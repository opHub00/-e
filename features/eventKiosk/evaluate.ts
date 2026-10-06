import { assessApplication } from '../applicationAssessment/engine.ts';
import { missingLabel } from '../applicationAssessment/form.ts';
import { STAGE_LABELS, SUPPLY_LABELS } from '../applicationAssessment/labels.ts';
import type { ApplicationAssessmentResult, Evidence, Stage, SupplyType } from '../applicationAssessment/types.ts';
import { toAssessmentInput } from './engineInput.ts';
import type { EventListing, LoadedEvent } from './eventConfig.ts';
import type { KioskAnswers } from './model.ts';

/**
 * 행사 결과 계산. 판정은 전부 결정론 엔진이 하고, 여기서는 그 결과를 화면이 읽기 좋게 묶고 줄을 세운다.
 *
 * 상태 이름은 Codex Portfolio 의 AssessmentPortfolioStatus 와 같은 뜻으로 맞춘다.
 *   COMPLETE          판정이 끝났고 신청할 수 있다
 *   NEEDS_USER_INPUT  방문자가 더 답하면 판정할 수 있다
 *   INELIGIBLE        조건을 채우지 못했다
 *   UNAVAILABLE       완판e 가 이 공고를 아직 판정할 수 없다(규칙 없음, 공고 정보 부족)
 * 나중에 Portfolio 를 붙일 때 이 매핑만 바꾸면 된다.
 */
export type KioskStatus = 'COMPLETE' | 'NEEDS_USER_INPUT' | 'INELIGIBLE' | 'UNAVAILABLE';
export type KioskUnavailableReason = 'NO_ACTIVE_RULE_SET' | 'MISSING_ANNOUNCEMENT_FACTS' | 'ASSESSMENT_FAILED';

/** 대시보드 맨 위 세 칸. */
export type KioskBucket = 'eligible' | 'review' | 'difficult';
export const BUCKET_LABELS: Record<KioskBucket, string> = {
  eligible: '신청 가능',
  review: '추가 확인 필요',
  difficult: '신청 어려움',
};

/**
 * 공고 배점표 점수. 공고가 정한 항목과 배점 그대로이고, 공고가 배점을 두지 않은 공급이면 null 이다.
 * 완판e 추천도와 절대 섞지 않는다.
 */
export type OfficialScore = {
  total: number;
  max: number;
  items: { label: string; points: number; max: number }[];
};

/**
 * 완판e 추천도. 여러 공고를 한 줄로 세우기 위한 완판e 의 보조 지표다.
 * 공고 배점이 아니고, 당첨 가능성도 아니다. 그래서 '점'을 붙이지 않고 수준(높음/보통/낮음)으로 보여 준다.
 */
export type WanpanLevel = 'high' | 'medium' | 'low' | 'none';
export type WanpanIndicator = {
  /** 0~100. 정렬과 막대 길이에만 쓴다. 화면에 숫자로 내세우지 않는다. */
  value: number;
  level: WanpanLevel;
  /** 이 값이 어떻게 나왔는지. 상세 화면 '왜 이 순서인가요'에 그대로 쓴다. */
  factors: { label: string; effect: number }[];
};
export const WANPAN_LEVEL_LABELS: Record<WanpanLevel, string> = {
  high: '높음',
  medium: '보통',
  low: '낮음',
  none: '해당 없음',
};

export type KioskOutcome = {
  /** 공고 + 공급 하나. 같은 공고라도 공급마다 결과가 다르다. */
  id: string;
  listing: EventListing;
  supplyType: SupplyType | null;
  supplyLabel: string;
  status: KioskStatus;
  unavailableReason: KioskUnavailableReason | null;
  bucket: KioskBucket;
  /** 엔진이 정한 공급 단계(우선/일반/추첨). 이것이 카드의 '순위'다. */
  stage: Stage | null;
  stageLabel: string | null;
  stageExplanation: string | null;
  regionalPriority: string | null;
  officialScore: OfficialScore | null;
  wanpan: WanpanIndicator;
  /** 카드에 보이는 짧은 목록. */
  advantages: string[];
  cautions: string[];
  /** 상세 화면용 전체 목록. */
  satisfied: string[];
  failed: string[];
  missing: string[];
  warnings: string[];
  requiredDocuments: string[];
  evidence: Evidence[];
  rank: number;
  /** 상담 엔진에 넘길 원래 결과. 규칙이 없는 공고는 null. */
  result: ApplicationAssessmentResult | null;
};

export type KioskEvaluation = {
  evaluatedAt: string;
  outcomes: KioskOutcome[];
  counts: Record<KioskBucket, number>;
};

const BUCKET_ORDER: KioskBucket[] = ['eligible', 'review', 'difficult'];

export function statusFromResult(result: ApplicationAssessmentResult): { status: KioskStatus; reason: KioskUnavailableReason | null } {
  if (result.status === 'ELIGIBLE') return { status: 'COMPLETE', reason: null };
  if (result.status === 'INELIGIBLE') return { status: 'INELIGIBLE', reason: null };
  if (result.missingInformation.some(key => key.startsWith('input:'))) return { status: 'NEEDS_USER_INPUT', reason: null };
  return { status: 'UNAVAILABLE', reason: 'MISSING_ANNOUNCEMENT_FACTS' };
}

export const bucketOf = (status: KioskStatus): KioskBucket =>
  status === 'COMPLETE' ? 'eligible' : status === 'INELIGIBLE' ? 'difficult' : 'review';

const STATUS_BASE: Record<KioskStatus, number> = { COMPLETE: 60, NEEDS_USER_INPUT: 35, UNAVAILABLE: 20, INELIGIBLE: 0 };
const STAGE_BONUS: Record<Stage, number> = { PRIORITY: 20, GENERAL: 10, LOTTERY: 5 };

/**
 * 완판e 추천도 계산. 순수 함수이고 입력은 이미 엔진이 정한 값뿐이다.
 * 신청할 수 없는 공급은 0 이다. 줄 세우기에서 맨 뒤로 가고, 추천도는 '해당 없음'이 된다.
 */
export function wanpanIndicator(input: {
  status: KioskStatus;
  stage: Stage | null;
  officialScore: OfficialScore | null;
  missingCount: number;
  recruitment: EventListing['recruitment']['status'];
}): WanpanIndicator {
  if (input.status === 'INELIGIBLE') return { value: 0, level: 'none', factors: [{ label: '신청 조건을 채우지 못했어요', effect: 0 }] };
  const factors: WanpanIndicator['factors'] = [];
  const statusLabel: Record<KioskStatus, string> = {
    COMPLETE: '신청 조건을 모두 확인했어요',
    NEEDS_USER_INPUT: '몇 가지를 더 확인해야 해요',
    UNAVAILABLE: '완판e가 아직 판정하지 못했어요',
    INELIGIBLE: '',
  };
  factors.push({ label: statusLabel[input.status], effect: STATUS_BASE[input.status] });
  if (input.stage) factors.push({ label: `${STAGE_LABELS[input.stage]} 대상이에요`, effect: STAGE_BONUS[input.stage] });
  if (input.officialScore && input.officialScore.max > 0) {
    factors.push({ label: '공고 배점이 높을수록 앞에 둬요', effect: Math.round((input.officialScore.total / input.officialScore.max) * 15) });
  }
  if (input.missingCount > 0) factors.push({ label: `확인할 항목 ${input.missingCount}개`, effect: -3 * Math.min(input.missingCount, 5) });
  if (input.recruitment === 'open') factors.push({ label: '지금 접수 중이에요', effect: 5 });
  if (input.recruitment === 'upcoming') factors.push({ label: '곧 접수를 시작해요', effect: 3 });
  const value = Math.max(0, Math.min(100, factors.reduce((sum, factor) => sum + factor.effect, 0)));
  const level: WanpanLevel = value >= 75 ? 'high' : value >= 45 ? 'medium' : value > 0 ? 'low' : 'none';
  return { value, level, factors };
}

const unique = (items: string[]): string[] => [...new Set(items.filter(Boolean))];
/** 엔진 라벨의 단위 표기('(원)')는 문장 안에서 어색하다. 뜻은 그대로 두고 꼬리만 뗀다. */
const plainLabel = (label: string): string => label.replace(/\s*\((원|개월|년|명)\)$/, '');

/**
 * 입력 폼의 질문형 라벨('…인가요?')은 '확인 필요 · …' 목록에서 어색하다. 행사 화면에서만 명사형으로 바꾼다.
 * 여기 없는 키는 엔진 라벨을 그대로 쓴다.
 */
const KIOSK_FIELD_LABELS: Record<string, string> = {
  isHouseholdHead: '세대주 여부',
  everMarried: '과거 혼인 여부',
  plannedMarriageWithinDeadline: '입주 전 혼인 증명 가능 여부',
  singleParentQualified: '한부모가족 자격',
  unmarriedChildInHousehold: '같은 등본의 미혼 자녀',
  householdNoWinningFiveYears: '세대원 5년 내 당첨 이력',
  specialSupplyHistory: '특별공급 당첨 이력',
  reWinningRestriction: '재당첨 제한',
  accountKindEligible: '청약통장 종류',
  firstRank: '청약 1순위 여부',
  dualIncome: '맞벌이 여부',
  youthPriorityTarget: '청년 우선공급 대상 여부',
  newlywedPriorityTarget: '신혼부부 우선공급 대상 여부',
};
const fieldLabel = (key: string): string =>
  (key.startsWith('input:') ? KIOSK_FIELD_LABELS[key.slice('input:'.length)] : undefined) ?? plainLabel(missingLabel(key));
export const missingCaution = (label: string): string => `확인 필요 · ${label}`;

function officialScoreOf(result: ApplicationAssessmentResult): OfficialScore | null {
  if (result.scoring !== 'AVAILABLE' || !result.score) return null;
  return {
    total: result.score.total,
    max: result.score.max,
    items: result.score.breakdown.map(item => ({ label: item.label, points: item.points, max: item.max })),
  };
}

function outcomeFromResult(listing: EventListing, result: ApplicationAssessmentResult): Omit<KioskOutcome, 'rank'> {
  const { status, reason } = statusFromResult(result);
  const officialScore = officialScoreOf(result);
  // 'review:' 는 공고가 '증빙으로 확인'하라고 정한 조건이다. 떨어졌다고 단정하지 않고 확인할 것으로 옮긴다.
  const reviewRules = new Set(result.missingInformation.filter(key => key.startsWith('review:')).map(key => key.slice('review:'.length)));
  const conditionLabel = (ruleId: string) =>
    [...result.failedConditions, ...result.unknownConditions].find(condition => condition.ruleId === ruleId)?.label;
  const missing = unique(result.missingInformation.map(key => {
    if (key.startsWith('review:')) {
      const label = conditionLabel(key.slice('review:'.length));
      return label ? `${label}(증빙으로 확인)` : fieldLabel(key);
    }
    return fieldLabel(key);
  }));
  const failed = unique(result.failedConditions.filter(condition => !reviewRules.has(condition.ruleId)).map(condition => condition.label));
  const satisfied = unique(result.satisfiedConditions.map(condition => condition.label));
  const warnings = unique(result.warnings);
  const stage = status === 'COMPLETE' ? result.stage : null;
  return {
    id: `${listing.listingId}:${result.supplyType}`,
    listing,
    supplyType: result.supplyType,
    supplyLabel: SUPPLY_LABELS[result.supplyType],
    status,
    unavailableReason: reason,
    bucket: bucketOf(status),
    stage,
    stageLabel: stage ? STAGE_LABELS[stage] : null,
    stageExplanation: result.stageExplanation || null,
    regionalPriority: result.regionalPriority?.label ?? null,
    officialScore,
    wanpan: wanpanIndicator({ status, stage, officialScore, missingCount: missing.length, recruitment: listing.recruitment.status }),
    advantages: satisfied.slice(0, 3),
    cautions: [...failed, ...missing.map(missingCaution)].slice(0, 3),
    satisfied,
    failed,
    missing,
    warnings,
    requiredDocuments: unique(result.requiredDocuments),
    evidence: result.evidence,
    result,
  };
}

function unavailableOutcome(listing: EventListing, reason: KioskUnavailableReason): Omit<KioskOutcome, 'rank'> {
  const caution = reason === 'NO_ACTIVE_RULE_SET'
    ? '완판e가 아직 이 공고의 신청 조건을 확인하지 않았어요'
    : '이 공고는 지금 판정할 수 없어요';
  return {
    id: `${listing.listingId}:all`,
    listing,
    supplyType: null,
    supplyLabel: listing.housingType,
    status: 'UNAVAILABLE',
    unavailableReason: reason,
    bucket: 'review',
    stage: null,
    stageLabel: null,
    stageExplanation: null,
    regionalPriority: null,
    officialScore: null,
    wanpan: wanpanIndicator({ status: 'UNAVAILABLE', stage: null, officialScore: null, missingCount: 0, recruitment: listing.recruitment.status }),
    advantages: [],
    cautions: [caution],
    satisfied: [],
    failed: [],
    missing: [],
    warnings: [],
    requiredDocuments: [],
    evidence: [],
    result: null,
  };
}

/** 같은 묶음 안에서는 추천도가 높은 순, 같으면 공고명 순. 순서가 늘 같아야 한다. */
export function rankOutcomes(outcomes: Omit<KioskOutcome, 'rank'>[]): KioskOutcome[] {
  return [...outcomes]
    .sort((a, b) =>
      BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket)
      || b.wanpan.value - a.wanpan.value
      || a.listing.title.localeCompare(b.listing.title, 'ko')
      || a.supplyLabel.localeCompare(b.supplyLabel, 'ko'))
    .map((outcome, index) => ({ ...outcome, rank: index + 1 }));
}

export function evaluateEvent(event: LoadedEvent, answers: KioskAnswers, referenceDate = new Date()): KioskEvaluation {
  const input = toAssessmentInput(answers, event.config.residenceRegion, referenceDate);
  const collected: Omit<KioskOutcome, 'rank'>[] = [];
  for (const listing of event.config.listings) {
    const rules = event.rulesByListing.get(listing.listingId);
    if (!rules) {
      collected.push(unavailableOutcome(listing, 'NO_ACTIVE_RULE_SET'));
      continue;
    }
    let results: ApplicationAssessmentResult[];
    try {
      results = assessApplication(rules, input, listing.listingId);
    } catch {
      collected.push(unavailableOutcome(listing, 'ASSESSMENT_FAILED'));
      continue;
    }
    if (!results.length) collected.push(unavailableOutcome(listing, 'MISSING_ANNOUNCEMENT_FACTS'));
    for (const result of results) collected.push(outcomeFromResult(listing, result));
  }
  const outcomes = rankOutcomes(collected);
  const counts: Record<KioskBucket, number> = { eligible: 0, review: 0, difficult: 0 };
  for (const outcome of outcomes) counts[outcome.bucket] += 1;
  return { evaluatedAt: referenceDate.toISOString(), outcomes, counts };
}
