import type { ApplicantProfileV2 } from '../profile/domain.ts';

export type SupplyType = 'youth' | 'newlywed' | 'firstHome';
export type Stage = 'PRIORITY' | 'GENERAL' | 'LOTTERY';
export type Status = 'ELIGIBLE' | 'INELIGIBLE' | 'NEEDS_MORE_INFORMATION';
export type RuleSourceStatus = 'REFERENCE' | 'DRAFT_SOURCE_VERIFIED' | 'OFFICIAL_VERIFIED';
export type Scalar = string | number | boolean;
export type Child = { birthDate?: string; unborn: boolean };

/** Additional exact, announcement-date inputs. Existing profile stays the source of truth. */
export type AssessmentInput = {
  profile: ApplicantProfileV2;
  details: Partial<{
    birthDate: string;
    firstMarriageDate: string;
    everMarried: boolean;
    accountKindEligible: boolean;
    firstRank: boolean;
    isHouseholdHead: boolean;
    householdNoWinningFiveYears: boolean;
    incomeHouseholdSize: number;
    plannedMarriageWithinDeadline: boolean;
    singleParentQualified: boolean;
    unmarriedChildInHousehold: boolean;
    marriageDate: string;
    familyCategory: 'married' | 'engaged' | 'singleParent';
    spouse: { birthDate?: string };
    children: Child[];
    householdMembers: { birthDate?: string; relationship: string }[];
    currentResidence: string;
    residenceStartDate: string;
    overseasStayHistory: { startDate: string; endDate?: string }[];
    housingOwnershipHistory: { acquiredAt: string; disposedAt?: string }[];
    housingDisposalDates: string[];
    noHomeSince: string;
    subscriptionAccountOpenedAt: string;
    recognizedPaymentCount: number;
    recognizedDepositAmount: number;
    monthlyIncome: number;
    spouseIncome: number;
    householdIncome: number;
    dualIncome: boolean;
    earnedIncome: number;
    businessIncome: number;
    totalAssets: number;
    parentAssets: number;
    /** 세대가 보유한 부동산(건물+토지) 가액 합계. 부동산·자동차를 따로 보는 자산기준용. */
    realEstateAssets: number;
    /** 세대 보유 자동차 중 가장 높은 차량가액. 없으면 0. */
    vehicleValue: number;
    workStartedAt: string;
    youthPriorityTarget: boolean;
    newlywedPriorityTarget: boolean;
    specialSupplyHistory: boolean;
    reWinningRestriction: boolean;
    specialExceptions: string[];
  }>;
};

export type Evidence = {
  id: string;
  source: string;
  section: string;
  label: string;
  url?: string;
  page?: number;
  documentId?: string;
  tableLabel?: string;
  textExcerpt?: string;
  locator?: Record<string, unknown>;
};
export type Expression =
  | { all: Expression[] }
  | { any: Expression[] }
  | { fact: string; op: 'eq' | 'gte' | 'lte'; value: Scalar | { parameter: string } };
export type ConditionRule = {
  id: string;
  label: string;
  expression: Expression;
  evidence: Evidence;
  documents: string[];
  onFailure?: 'REVIEW';
};
export type ScoreRule = {
  id: string;
  label: string;
  fact: string;
  /** null means the announcement's scoring table has not been verified. */
  /** notApplicable: the item cannot be chosen by this applicant (e.g. 한부모-only item for a married couple): 0 points, excluded from the maximum. */
  bands: { min?: number; max?: number; points: number; notApplicable?: true }[] | null;
  evidence: Evidence;
};
export type SupplyRule = {
  type: SupplyType;
  eligibility: ConditionRule[];
  /** Ordered stages: a missing earlier stage must never fall through. */
  stages: { stage: Stage; conditions: ConditionRule[]; scores: ScoreRule[] | null }[];
};
export type AnnouncementRules = {
  id: string;
  version: string;
  listingId: string;
  title: string;
  verification: 'REFERENCE_ONLY' | 'VERIFIED';
  /** Explicit provenance takes precedence over the legacy static fixture flag. */
  sourceStatus?: RuleSourceStatus;
  provenance?: { announcementId: string; documentId: string | null; schemaVersion: number };
  announcementDate: string | null;
  parameters: Record<string, Scalar | null>;
  supplies: SupplyRule[];
};
export type ConditionResult = {
  ruleId: string;
  evidenceId: string;
  label: string;
  outcome: 'PASS' | 'FAIL' | 'UNKNOWN';
  inputs: Record<string, Scalar | null>;
  missing: string[];
};
export type ApplicationAssessmentResult = {
  rulesId: string;
  rulesVersion: string;
  sourceStatus?: RuleSourceStatus;
  provenance?: AnnouncementRules['provenance'];
  listingId: string;
  supplyType: SupplyType;
  status: Status;
  eligible: boolean | null;
  stage: Stage | null;
  stageExplanation: string;
  regionalPriority?: { status: 'LOCAL' | 'REMAINDER_ONLY' | 'NEEDS_REVIEW'; label: string };
  inputDates: Record<string, string>;
  score?: { total: number; max: number; breakdown: { ruleId: string; evidenceId: string; label: string; input: number; points: number; max: number; appliedBand: { min?: number; max?: number } }[] };
  scoring: 'AVAILABLE' | 'NOT_APPLICABLE' | 'PENDING';
  satisfiedConditions: ConditionResult[];
  failedConditions: ConditionResult[];
  unknownConditions: ConditionResult[];
  stageConditions: ConditionResult[];
  warnings: string[];
  requiredDocuments: string[];
  evidence: Evidence[];
  missingInformation: string[];
};
