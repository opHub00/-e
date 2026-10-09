import { BUCKET_LABELS, missingCaution, type KioskBucket, type KioskEvaluation, type KioskOutcome } from './evaluate.ts';
import { HOUSEHOLD_TYPES, type HouseholdType } from './model.ts';
import { humanize, humanizeAll } from './presentation.ts';
import { cautionLines, explainOutcome } from './experience/explain.ts';
import type { RecommendationAssessmentStatus, RecommendationPortfolio } from './live/recommendation.ts';

/** Privacy-reduced payload stored behind an opaque, expiring result token. */
export type SummaryItem = {
  title: string;
  supply: string;
  bucket: KioskBucket;
  stage: string | null;
  note: string | null;
};

export type ResultSummaryV1 = {
  v: 1;
  event: string;
  date: string;
  household: string | null;
  counts: Record<KioskBucket, number>;
  recommended: SummaryItem[];
  favorites: SummaryItem[];
  cautions: string[];
};

export type PortfolioSummaryItem = SummaryItem & {
  status: RecommendationAssessmentStatus;
  rank: number;
  officialScoreStatus: 'AVAILABLE' | 'PENDING' | 'NOT_APPLICABLE';
  wanpanRecommendation: string;
  whyMatched: string[];
  cautions: string[];
  applicationStart: string | null;
  applicationEnd: string | null;
  location: string | null;
  nearbyHighlights: string[];
  sourceLabel: string;
  sourceUrl: string;
};

export type ResultSummaryV2 = {
  v: 2;
  event: string;
  date: string;
  household: null;
  counts: Record<KioskBucket, number>;
  recommended: PortfolioSummaryItem[];
  favorites: PortfolioSummaryItem[];
  cautions: string[];
};

export type ResultSummary = ResultSummaryV1 | ResultSummaryV2;

/** 설명 계층과 같은 기준(부족 → 확인 필요 → 서류)으로 한 줄 메모를 고른다. 데이터셋이 없으면 기존 문구를 정리해 쓴다. */
const noteOf = (outcome: KioskOutcome, evidenceOnly?: Set<string>): string | null => {
  if (evidenceOnly) return cautionLines(explainOutcome(outcome, evidenceOnly))[0] ?? null;
  return outcome.cautions[0] ? humanize(outcome.cautions[0]) : null;
};

const itemOf = (outcome: KioskOutcome, evidenceOnly?: Set<string>): SummaryItem => ({
  title: outcome.listing.title,
  supply: outcome.supplyLabel,
  bucket: outcome.bucket,
  stage: outcome.stageLabel ? humanize(outcome.stageLabel) : null,
  // 휴대폰 요약에도 기계용 키가 나가지 않게 사람용 문구로 바꿔 담는다.
  note: noteOf(outcome, evidenceOnly),
});

export function buildSummary(input: {
  eventId: string;
  householdType: HouseholdType | null;
  evaluation: KioskEvaluation;
  favoriteIds: string[];
  /** 서류로만 확인하는 사실. 넘기면 메모·주의사항을 상세 화면과 같은 기준으로 만든다. */
  evidenceOnly?: Set<string>;
}): ResultSummaryV1 {
  const recommended = input.evaluation.outcomes.filter(outcome => outcome.bucket === 'eligible').slice(0, 3);
  const favorites = input.favoriteIds
    .map(id => input.evaluation.outcomes.find(outcome => outcome.id === id))
    .filter((outcome): outcome is KioskOutcome => Boolean(outcome));
  const focus = favorites.length ? favorites : recommended;
  const cautions = (input.evidenceOnly
    ? humanizeAll(focus.flatMap(outcome => cautionLines(explainOutcome(outcome, input.evidenceOnly!))))
    : humanizeAll(focus.flatMap(outcome => [...outcome.failed, ...outcome.missing.map(item => missingCaution(humanize(item)))]))).slice(0, 4);
  return {
    v: 1,
    event: input.eventId,
    date: input.evaluation.evaluatedAt.slice(0, 10),
    household: HOUSEHOLD_TYPES.find(type => type.key === input.householdType)?.label ?? null,
    counts: { ...input.evaluation.counts },
    recommended: recommended.map(outcome => itemOf(outcome, input.evidenceOnly)),
    favorites: favorites.map(outcome => itemOf(outcome, input.evidenceOnly)),
    cautions,
  };
}

/** Listing-centred, privacy-reduced V2 payload stored behind the same opaque session token. */
export function buildPortfolioSummary(input: {
  eventId: string;
  portfolio: RecommendationPortfolio;
}): ResultSummaryV2 {
  const recommended = input.portfolio.items
    .filter(item => item.assessmentStatus !== 'INELIGIBLE' && item.assessmentStatus !== 'UNAVAILABLE')
    .slice(0, 5);
  const favorites = input.portfolio.items.filter(item => item.favorite).slice(0, 5);
  const focus = favorites.length ? favorites : recommended;
  return {
    v: 2,
    event: input.eventId,
    date: input.portfolio.generatedAt.slice(0, 10),
    household: null,
    counts: {
      eligible: input.portfolio.counts.COMPLETE,
      review: input.portfolio.counts.NEEDS_USER_INPUT + input.portfolio.counts.INFORMATION_ONLY + input.portfolio.counts.UNAVAILABLE,
      difficult: input.portfolio.counts.INELIGIBLE,
    },
    recommended: recommended.map(portfolioItem),
    favorites: favorites.map(portfolioItem),
    cautions: uniqueText(focus.flatMap(item => item.cautions)).slice(0, 6),
  };
}

function portfolioItem(item: RecommendationPortfolio['items'][number]): PortfolioSummaryItem {
  const bucket: KioskBucket = item.assessmentStatus === 'COMPLETE'
    ? 'eligible'
    : item.assessmentStatus === 'INELIGIBLE'
      ? 'difficult'
      : 'review';
  return {
    title: item.listing.title,
    supply: item.supplyType,
    bucket,
    stage: item.priority.label,
    note: item.cautions[0] ?? null,
    status: item.assessmentStatus,
    rank: item.rank,
    officialScoreStatus: item.officialScore.status,
    wanpanRecommendation: item.wanpanRecommendation.label,
    whyMatched: item.whyMatched.slice(0, 4),
    cautions: item.cautions.slice(0, 4),
    applicationStart: item.applicationDates.start,
    applicationEnd: item.applicationDates.end,
    location: item.location.normalizedAddress,
    nearbyHighlights: item.nearbyHighlights.map(highlight => highlight.text).slice(0, 3),
    sourceLabel: item.listing.provider,
    sourceUrl: item.listing.sourceUrl,
  };
}

const uniqueText = (items: readonly string[]) => [...new Set(items.filter(Boolean))];

export const bucketLabel = (bucket: KioskBucket): string => BUCKET_LABELS[bucket];
