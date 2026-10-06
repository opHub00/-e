import type { EvaluationResult, OfficialScore as DomainOfficialScore } from './frozen/domain/evaluation.ts';
import type { Evidence, SelectionMethod, SupplyType } from './frozen/domain/rules.ts';
import type { UserProfile } from './frozen/domain/profile.ts';
import { assessFrozenDataset, type BatchAssessment } from './frozen/engine/batch.ts';
import { toUserProfile } from './engineInput.ts';
import type { EventListing, LoadedEvent } from './eventConfig.ts';
import type { KioskAnswers } from './model.ts';

export type KioskStatus = 'COMPLETE' | 'NEEDS_USER_INPUT' | 'INELIGIBLE' | 'UNAVAILABLE';
export type KioskUnavailableReason = 'NO_ACTIVE_RULE_SET' | 'MISSING_ANNOUNCEMENT_FACTS' | 'ASSESSMENT_FAILED';
export type KioskBucket = 'eligible' | 'review' | 'difficult';

export const BUCKET_LABELS: Record<KioskBucket, string> = {
  eligible: '신청 가능',
  review: '추가 확인 필요',
  difficult: '신청 어려움',
};

export type OfficialScore = {
  total: number;
  max: number;
  items: { label: string; points: number; max: number }[];
};

export type OfficialScoreState =
  | { status: 'AVAILABLE'; reason: null }
  | { status: 'PENDING'; reason: string }
  | { status: 'NOT_APPLICABLE'; reason: string };

export type WanpanLevel = 'high' | 'medium' | 'low' | 'none';
export type WanpanIndicator = {
  value: number;
  level: WanpanLevel;
  factors: { label: string; effect: number }[];
};

export const WANPAN_LEVEL_LABELS: Record<WanpanLevel, string> = {
  high: '적극 검토',
  medium: '검토 가능',
  low: '조건 확인 필요',
  none: '신청 어려움',
};

export type KioskEvidence = Pick<Evidence, 'id' | 'label' | 'section' | 'page' | 'sourceUrl'> & {
  textExcerpt?: string;
};

export type KioskOutcome = {
  id: string;
  listing: EventListing;
  supplyType: SupplyType | null;
  supplyLabel: string;
  status: KioskStatus;
  unavailableReason: KioskUnavailableReason | null;
  bucket: KioskBucket;
  stage: 'PRIORITY' | 'GENERAL' | 'LOTTERY' | null;
  stageLabel: string | null;
  stageExplanation: string | null;
  regionalPriority: string | null;
  officialScore: OfficialScore | null;
  officialScoreState: OfficialScoreState;
  wanpan: WanpanIndicator;
  advantages: string[];
  cautions: string[];
  satisfied: string[];
  failed: string[];
  missing: string[];
  warnings: string[];
  requiredDocuments: string[];
  evidence: KioskEvidence[];
  rank: number;
  result: EvaluationResult | null;
};

export type KioskEvaluation = {
  evaluatedAt: string;
  outcomes: KioskOutcome[];
  counts: Record<KioskBucket, number>;
  profile: UserProfile;
  assessment: BatchAssessment;
};

const BUCKET_ORDER: KioskBucket[] = ['eligible', 'review', 'difficult'];

export function statusFromResult(result: EvaluationResult): { status: KioskStatus; reason: KioskUnavailableReason | null } {
  if (result.eligibility === 'ELIGIBLE') return { status: 'COMPLETE', reason: null };
  if (result.eligibility === 'INELIGIBLE') return { status: 'INELIGIBLE', reason: null };
  return { status: 'NEEDS_USER_INPUT', reason: null };
}

export const bucketOf = (status: KioskStatus): KioskBucket =>
  status === 'COMPLETE' ? 'eligible' : status === 'INELIGIBLE' ? 'difficult' : 'review';

function wanpanLevel(status: KioskStatus, value: number): WanpanLevel {
  if (status === 'INELIGIBLE' || status === 'UNAVAILABLE') return 'none';
  if (status === 'NEEDS_USER_INPUT') return 'low';
  if (value >= 75) return 'high';
  if (value >= 55) return 'medium';
  return 'low';
}

export function wanpanIndicator(input: { status: KioskStatus; score: number; breakdown?: EvaluationResult['wanpanScore']['breakdown'] }): WanpanIndicator {
  return {
    value: input.status === 'INELIGIBLE' || input.status === 'UNAVAILABLE' ? 0 : input.score,
    level: wanpanLevel(input.status, input.score),
    factors: (input.breakdown ?? []).map(item => ({ label: item.explanation, effect: item.points })),
  };
}

const unique = (items: string[]): string[] => [...new Set(items.filter(Boolean))];
export const missingCaution = (label: string): string => `확인 필요 · ${label}`;

function officialScoreOf(score: DomainOfficialScore): { score: OfficialScore | null; state: OfficialScoreState } {
  if (score.status === 'AVAILABLE') {
    return {
      score: {
        total: score.total,
        max: score.max,
        items: score.breakdown.map(item => ({ label: item.label, points: item.points, max: item.max })),
      },
      state: { status: 'AVAILABLE', reason: null },
    };
  }
  return { score: null, state: { status: score.status, reason: score.reason } };
}

function stageOf(result: EvaluationResult): Pick<KioskOutcome, 'stage' | 'stageLabel' | 'stageExplanation'> {
  if (result.priority.status === 'DETERMINED') {
    return {
      stage: result.priority.rank === 1 ? 'PRIORITY' : 'GENERAL',
      stageLabel: result.priority.label,
      stageExplanation: `${result.priority.rank}순위 · ${result.priority.code}`,
    };
  }
  if (result.selectionMethod === 'LOTTERY') return { stage: 'LOTTERY', stageLabel: '추첨', stageExplanation: result.priority.reason };
  return { stage: null, stageLabel: null, stageExplanation: result.priority.reason };
}

function evidenceFor(event: LoadedEvent, result: EvaluationResult): KioskEvidence[] {
  const rulePackage = event.dataset.rulePackages.find(item => item.id === result.rulePackageId);
  if (!rulePackage) return [];
  const wanted = new Set(result.evidenceIds);
  return rulePackage.evidence.filter(item => wanted.has(item.id)).map(item => ({
    id: item.id,
    label: item.label,
    section: item.section,
    ...(item.page === undefined ? {} : { page: item.page }),
    ...(item.sourceUrl === undefined ? {} : { sourceUrl: item.sourceUrl }),
    ...(item.excerpt === undefined ? {} : { textExcerpt: item.excerpt }),
  }));
}

function outcomeFromResult(event: LoadedEvent, result: EvaluationResult): Omit<KioskOutcome, 'rank'> {
  const listing = event.listingsById.get(result.listingId);
  if (!listing) throw new Error(`EVENT_LISTING_MISSING:${result.listingId}`);
  const { status, reason } = statusFromResult(result);
  const official = officialScoreOf(result.officialScore);
  const stage = stageOf(result);
  const satisfied = unique(result.matchedRules.map(rule => rule.label));
  const failed = unique(result.failedRules.filter(rule => rule.outcome === 'FAIL').map(rule => rule.label));
  const review = unique(result.failedRules.filter(rule => rule.outcome === 'REVIEW').map(rule => `${rule.label}(증빙으로 확인)`));
  const missing = unique([...result.missingInformation, ...review]);
  return {
    id: result.evaluationId,
    listing,
    supplyType: result.supplyType,
    supplyLabel: result.supplyLabel,
    status,
    unavailableReason: reason,
    bucket: bucketOf(status),
    ...stage,
    regionalPriority: null,
    officialScore: official.score,
    officialScoreState: official.state,
    wanpan: wanpanIndicator({ status, score: result.wanpanScore.score, breakdown: result.wanpanScore.breakdown }),
    advantages: satisfied.slice(0, 3),
    cautions: [...failed, ...missing.map(missingCaution)].slice(0, 3),
    satisfied,
    failed,
    missing,
    warnings: unique(result.warnings),
    requiredDocuments: [],
    evidence: evidenceFor(event, result),
    result,
  };
}

export function rankOutcomes(outcomes: Omit<KioskOutcome, 'rank'>[]): KioskOutcome[] {
  return [...outcomes]
    .sort((a, b) =>
      BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket)
      || b.wanpan.value - a.wanpan.value
      || a.listing.title.localeCompare(b.listing.title, 'ko')
      || a.supplyLabel.localeCompare(b.supplyLabel, 'ko'))
    .map((outcome, index) => ({ ...outcome, rank: index + 1 }));
}

export function evaluateEvent(event: LoadedEvent, answers: KioskAnswers, referenceDate?: Date): KioskEvaluation {
  const profileDate = referenceDate ?? new Date(`${event.dataset.eventDate}T12:00:00+09:00`);
  const profile = toUserProfile(answers, profileDate);
  const assessment = assessFrozenDataset(profile, event.dataset, { evaluatedAt: profileDate.toISOString() });
  const outcomes = rankOutcomes(assessment.results.map(result => outcomeFromResult(event, result)));
  const counts: Record<KioskBucket, number> = { eligible: 0, review: 0, difficult: 0 };
  for (const outcome of outcomes) counts[outcome.bucket] += 1;
  return { evaluatedAt: assessment.evaluatedAt, outcomes, counts, profile, assessment };
}

export const selectionMethodLabel = (method: SelectionMethod): string => ({
  QUALIFICATION_ONLY: '자격판정', PRIORITY: '순위제', OFFICIAL_SCORE: '공식 배점', LOTTERY: '추첨', MIXED: '순위·배점 혼합',
})[method];
