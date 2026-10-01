import type {
  ApplicationAssessmentResult,
  ConditionResult,
  Evidence,
  Stage,
  Status,
  SupplyType,
} from './types.ts';

export type AssessmentPortfolioStatus =
  | 'COMPLETE'
  | 'NEEDS_USER_INPUT'
  | 'INELIGIBLE'
  | 'UNAVAILABLE';

export type AssessmentUnavailableReason =
  | 'NO_ACTIVE_RULE_SET'
  | 'RULE_SET_UNSUPPORTED'
  | 'SOURCE_DOCUMENT_MISMATCH'
  | 'MISSING_ANNOUNCEMENT_FACTS'
  | 'RULE_LOAD_FAILED';

export type AssessmentPortfolioEntry = {
  listingId: string;
  supplyType: SupplyType;
  status: AssessmentPortfolioStatus;
  eligibilityStatus: Status | null;
  scoringStatus: ApplicationAssessmentResult['scoring'] | 'UNAVAILABLE';
  missingUserFields: string[];
  missingAnnouncementFields: string[];
  blockers: ConditionResult[];
  warnings: string[];
  evidence: Evidence[];
  score: ApplicationAssessmentResult['score'] | null;
  stage: Stage | null;
  unavailableReason?: AssessmentUnavailableReason;
  /** 기존 엔진 결과를 손실 없이 보존한다. */
  engineResult: ApplicationAssessmentResult | null;
};

function splitMissing(keys: string[]): {
  user: string[];
  announcement: string[];
} {
  const user: string[] = [];
  const announcement: string[] = [];
  for (const key of keys) {
    const target = key.startsWith('input:') ? user : announcement;
    if (!target.includes(key)) target.push(key);
  }
  return { user, announcement };
}

export function portfolioEntryFromAssessment(
  result: ApplicationAssessmentResult,
): AssessmentPortfolioEntry {
  const missing = splitMissing(result.missingInformation);
  const status: AssessmentPortfolioStatus = result.status === 'ELIGIBLE'
    ? 'COMPLETE'
    : result.status === 'INELIGIBLE'
      ? 'INELIGIBLE'
      : missing.user.length > 0
        ? 'NEEDS_USER_INPUT'
        : 'UNAVAILABLE';
  return {
    listingId: result.listingId,
    supplyType: result.supplyType,
    status,
    eligibilityStatus: result.status,
    scoringStatus: result.scoring,
    missingUserFields: missing.user,
    missingAnnouncementFields: missing.announcement,
    blockers: [...result.failedConditions],
    warnings: [...result.warnings],
    evidence: [...result.evidence],
    score: result.score ?? null,
    stage: result.stage,
    ...(status === 'UNAVAILABLE' ? { unavailableReason: 'MISSING_ANNOUNCEMENT_FACTS' as const } : {}),
    engineResult: result,
  };
}

export function unavailablePortfolioEntry(input: {
  listingId: string;
  supplyType: SupplyType;
  reason: AssessmentUnavailableReason;
  warnings?: string[];
}): AssessmentPortfolioEntry {
  return {
    listingId: input.listingId,
    supplyType: input.supplyType,
    status: 'UNAVAILABLE',
    eligibilityStatus: null,
    scoringStatus: 'UNAVAILABLE',
    missingUserFields: [],
    missingAnnouncementFields: [],
    blockers: [],
    warnings: [...(input.warnings ?? [])],
    evidence: [],
    score: null,
    stage: null,
    unavailableReason: input.reason,
    engineResult: null,
  };
}
