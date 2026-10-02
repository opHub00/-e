import type { AssessmentPortfolioEntry, AssessmentPortfolioStatus } from './portfolio.ts';
import type {
  ApplicationAssessmentResult,
  ConditionResult,
  Evidence,
  RuleSourceStatus,
  Stage,
  Status,
  SupplyType,
} from './types.ts';

export type AssessmentResultStaleReason =
  | 'PROFILE_CHANGED'
  | 'RULE_SET_CHANGED'
  | 'SOURCE_DOCUMENT_CHANGED'
  | 'ENGINE_CHANGED';

export type AssessmentResultStaleState = {
  isStale: boolean;
  reason?: AssessmentResultStaleReason;
  detectedAt?: string;
};

/** 향후 user_assessment_results 저장소가 구현할 canonical row contract. */
export type PersistedUserAssessmentResult = {
  id: string;
  userId: string;
  announcementId: string;
  listingId: string;
  supplyType: SupplyType;
  ruleSetId: string | null;
  ruleSetVersion: string | null;
  sourceStatus: RuleSourceStatus;
  sourceDocumentId: string | null;
  sourceDocumentHash: string | null;
  profileRevision: number;
  engineVersion: string;
  inputHash: string;
  portfolioStatus: AssessmentPortfolioStatus;
  eligibilityStatus: Status | null;
  scoringStatus: 'SCORED' | 'PENDING' | 'NOT_APPLICABLE' | 'UNAVAILABLE';
  stage: Stage | null;
  score: ApplicationAssessmentResult['score'] | null;
  missingUserFields: string[];
  missingAnnouncementFields: string[];
  blockers: ConditionResult[];
  warnings: string[];
  evidence: Evidence[];
  engineResult: ApplicationAssessmentResult | null;
  calculatedAt: string;
  stale: AssessmentResultStaleState;
};

export type AssessmentResultPersistenceMetadata = {
  id: string;
  userId: string;
  announcementId: string;
  sourceStatus: RuleSourceStatus;
  sourceDocumentId: string | null;
  sourceDocumentHash: string | null;
  profileRevision: number;
  engineVersion: string;
  inputHash: string;
  calculatedAt: string;
};

export type AssessmentResultFreshness = {
  profileRevision: number;
  ruleSetId: string | null;
  ruleSetVersion: string | null;
  sourceDocumentHash: string | null;
  engineVersion: string;
};

export function buildPersistedAssessmentResult(
  entry: AssessmentPortfolioEntry,
  metadata: AssessmentResultPersistenceMetadata,
): PersistedUserAssessmentResult {
  const ruleSetId = entry.engineResult?.rulesId ?? null;
  const ruleSetVersion = entry.engineResult?.rulesVersion ?? null;
  return {
    ...metadata,
    listingId: entry.listingId,
    supplyType: entry.supplyType,
    ruleSetId,
    ruleSetVersion,
    portfolioStatus: entry.status,
    eligibilityStatus: entry.eligibilityStatus,
    scoringStatus: entry.scoringStatus === 'AVAILABLE' ? 'SCORED' : entry.scoringStatus,
    stage: entry.stage,
    score: entry.score,
    missingUserFields: [...entry.missingUserFields],
    missingAnnouncementFields: [...entry.missingAnnouncementFields],
    blockers: [...entry.blockers],
    warnings: [...entry.warnings],
    evidence: [...entry.evidence],
    engineResult: entry.engineResult,
    stale: { isStale: false },
  };
}

export function markAssessmentResultStale(
  result: PersistedUserAssessmentResult,
  reason: AssessmentResultStaleReason,
  detectedAt: string,
): PersistedUserAssessmentResult {
  return { ...result, stale: { isStale: true, reason, detectedAt } };
}

/** 가장 직접적인 원인을 우선해, 삭제 없이 재계산 필요 여부를 판정한다. */
export function detectAssessmentResultStaleness(
  result: PersistedUserAssessmentResult,
  current: AssessmentResultFreshness,
): AssessmentResultStaleReason | null {
  if (result.profileRevision !== current.profileRevision) return 'PROFILE_CHANGED';
  if (result.ruleSetId !== current.ruleSetId || result.ruleSetVersion !== current.ruleSetVersion) {
    return 'RULE_SET_CHANGED';
  }
  if (result.sourceDocumentHash !== current.sourceDocumentHash) return 'SOURCE_DOCUMENT_CHANGED';
  if (result.engineVersion !== current.engineVersion) return 'ENGINE_CHANGED';
  return null;
}
