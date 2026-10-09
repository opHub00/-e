import type { KioskBucket, KioskEvaluation, KioskOutcome } from '../evaluate.ts';
import { cautionLines, type ListingExplanation } from '../experience/explain.ts';
import { HOUSEHOLD_TYPES, type KioskAnswers } from '../model.ts';
import { humanize, kioskStatusLabel } from '../presentation.ts';

/**
 * Recommendation Summary V2 — '내가 어떤 사람인지'보다 '어디에 신청하면 되는지'를 먼저 보여 주는 요약.
 *
 * 순서: 가장 추천하는 공고 → 관심 공고 → 함께 검토할 공고 → 신청 일정 → 왜 추천하는지 → 확인할 점 → (접힌) 내 입력 정보.
 * 판정은 다시 하지 않는다. 엔진 결과·설명 계층·결과 순위(rank)를 그대로 쓴다.
 * 휴대폰으로 넘기는 QR 요약(ResultSummary)의 모양은 바꾸지 않는다. 이것은 행사 화면용 모델이다.
 */
export type SummaryOutcomeItem = {
  outcomeId: string;
  title: string;
  supply: string;
  tone: KioskBucket;
  statusLabel: string;
  stage: string | null;
  /** 이 공고에서 다음에 할 일 한 줄. */
  next: string | null;
};

export type ScheduleItem = {
  listingId: string;
  title: string;
  label: string;
  state: 'open' | 'upcoming' | 'closed' | 'unknown';
  startDate: string | null;
};

export type RecommendationSummaryV2 = {
  top: (SummaryOutcomeItem & { reasons: string[] }) | null;
  favorites: SummaryOutcomeItem[];
  alsoReview: SummaryOutcomeItem[];
  schedule: ScheduleItem[];
  why: string[];
  cautions: string[];
  profile: { household: string | null; lines: string[] };
};

const ALSO_REVIEW_LIMIT = 3;
const CAUTION_LIMIT = 5;
const STATE_LABELS = { open: '접수 중', upcoming: '접수 예정', closed: '접수 마감', unknown: '일정 확인 필요' } as const;
const dot = (date: string | null | undefined) => (date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(5).replace('-', '.') : null);

function itemOf(outcome: KioskOutcome, explanation: ListingExplanation): SummaryOutcomeItem {
  return {
    outcomeId: outcome.id,
    title: outcome.listing.title,
    supply: outcome.supplyLabel,
    tone: outcome.bucket,
    statusLabel: kioskStatusLabel(outcome.status, outcome.unavailableReason),
    stage: outcome.stageLabel ? humanize(outcome.stageLabel) : null,
    next: explanation.nextSteps[0] ?? null,
  };
}

/** 사람이 알아볼 정도로만. 소득·자산 같은 숫자는 넣지 않는다. */
function profileLines(answers: KioskAnswers | null): string[] {
  if (!answers) return [];
  const yesNo = (value: boolean | null, yes: string, no: string) => (value === null ? null : value ? yes : no);
  return [
    yesNo(answers.applicant.livesInEventRegion, '행사 지역 거주', '행사 지역 외 거주'),
    yesNo(answers.applicant.householdNoHome, '세대 무주택', '세대 주택 보유'),
    answers.subscription.accountKind === 'housing' ? '주택청약종합저축 보유' : answers.subscription.accountKind === 'none' ? '청약통장 없음' : null,
    answers.household.childrenCount ? `자녀 ${answers.household.childrenCount}명` : null,
  ].filter((line): line is string => Boolean(line));
}

export function buildRecommendationSummary(input: {
  evaluation: KioskEvaluation;
  favoriteIds: readonly string[];
  explain: (outcome: KioskOutcome) => ListingExplanation;
  answers: KioskAnswers | null;
}): RecommendationSummaryV2 {
  const { evaluation, favoriteIds } = input;
  const explanations = new Map<string, ListingExplanation>();
  const explain = (outcome: KioskOutcome) => {
    let found = explanations.get(outcome.id);
    if (!found) { found = input.explain(outcome); explanations.set(outcome.id, found); }
    return found;
  };
  // 결과는 이미 '신청 가능 → 추가 확인 → 신청 어려움, 묶음 안에서는 완판e 추천도' 순서다. 그 첫 신청 가능을 가장 추천한다.
  const ranked = [...evaluation.outcomes].sort((a, b) => a.rank - b.rank);
  const topOutcome = ranked.find(outcome => outcome.bucket === 'eligible') ?? null;
  const favorites = favoriteIds
    .map(id => ranked.find(outcome => outcome.id === id))
    .filter((outcome): outcome is KioskOutcome => Boolean(outcome));
  const taken = new Set([topOutcome?.id, ...favorites.map(outcome => outcome.id)]);
  const alsoReview = ranked
    .filter(outcome => !taken.has(outcome.id) && outcome.bucket !== 'difficult')
    .slice(0, ALSO_REVIEW_LIMIT);

  const focus = [topOutcome, ...favorites, ...alsoReview].filter((outcome): outcome is KioskOutcome => Boolean(outcome));
  const scheduleSeen = new Set<string>();
  const schedule: ScheduleItem[] = [];
  for (const outcome of focus) {
    const listing = outcome.listing;
    if (scheduleSeen.has(listing.listingId)) continue;
    scheduleSeen.add(listing.listingId);
    const from = dot(listing.recruitment?.startDate);
    const to = dot(listing.recruitment?.endDate);
    const state = listing.recruitment?.status ?? 'unknown';
    schedule.push({
      listingId: listing.listingId,
      title: listing.title,
      label: from || to ? `${from ?? '미정'} ~ ${to ?? '미정'} · ${STATE_LABELS[state]}` : STATE_LABELS[state],
      state,
      startDate: listing.recruitment?.startDate ?? null,
    });
  }
  // 열려 있거나 곧 열리는 접수를 먼저, 그 안에서는 날짜 순.
  const stateOrder = { open: 0, upcoming: 1, unknown: 2, closed: 3 } as const;
  schedule.sort((a, b) => stateOrder[a.state] - stateOrder[b.state] || (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999'));

  const topExplanation = topOutcome ? explain(topOutcome) : null;
  const why = topExplanation
    ? [...(topExplanation.priority.label ? [topExplanation.priority.body] : []), ...topExplanation.satisfied.slice(0, 3)]
    : [];
  const cautions = [...new Set(focus.flatMap(outcome => cautionLines(explain(outcome))))].slice(0, CAUTION_LIMIT);
  const household = HOUSEHOLD_TYPES.find(type => type.key === input.answers?.householdType)?.label ?? null;

  return {
    top: topOutcome && topExplanation ? { ...itemOf(topOutcome, topExplanation), reasons: topExplanation.reasons } : null,
    favorites: favorites.map(outcome => itemOf(outcome, explain(outcome))),
    alsoReview: alsoReview.map(outcome => itemOf(outcome, explain(outcome))),
    schedule,
    why,
    cautions,
    profile: { household, lines: profileLines(input.answers) },
  };
}
