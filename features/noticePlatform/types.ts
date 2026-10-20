import type { AssessmentInput, Evidence, RuleSourceStatus } from '../applicationAssessment/types.ts';

export type NoticeId = string;
export type NoticeLifecycleStatus = 'DRAFT' | 'SOURCE_VERIFIED' | 'REVIEW_REQUIRED' | 'APPROVED' | 'ACTIVE' | 'ARCHIVED';
export type RulePackageLifecycleStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'ACTIVE' | 'ARCHIVED';
export type NoticeLifecycle = {
  sourceVerificationState: 'UNVERIFIED' | 'SOURCE_VERIFIED';
  reviewStatus: 'DRAFT' | 'IN_REVIEW' | 'REVIEW_REQUIRED' | 'APPROVED';
  publicationStatus: 'INACTIVE' | 'ACTIVE' | 'ARCHIVED';
};
export type NoticeEligibility = 'ELIGIBLE' | 'CONDITIONAL' | 'INELIGIBLE' | 'EVIDENCE_REQUIRED' | 'UNAVAILABLE';

export type Listing = {
  id: string;
  complexId: string;
  title: string;
  address: string;
  region: string;
};

export type Complex = { id: string; name: string; region: string; address: string };

export type SupplyType = {
  id: string;
  label: string;
  supplyCount: number;
  assessmentMode: 'RULE_ENGINE' | 'DEDICATED' | 'INFORMATION_ONLY';
};

export type Notice = {
  id: NoticeId;
  title: string;
  managementNumber: string;
  listing: Listing;
  complex: Complex;
  noticeDate: string;
  status: NoticeLifecycleStatus;
  sourceDocument: { fileName: string; sha256: string; official: boolean };
  supplyTypes: SupplyType[];
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
};

export type Rule = {
  id: string;
  type: string;
  supplyTypeId: string;
  label: string;
  evidence: Evidence;
  isScoreRule: boolean;
};

export type RulePackage = {
  id: string;
  noticeId: NoticeId;
  version: string;
  sourceStatus: RuleSourceStatus;
  status: RulePackageLifecycleStatus;
  sourceHash: string;
  rules: Rule[];
  validationErrors: string[];
  createdAt: string;
  updatedAt: string;
};

export type AssessmentFact = {
  id: string;
  label: string;
  state: 'ANSWERED' | 'UNKNOWN' | 'DOES_NOT_KNOW' | 'EVIDENCE_REQUIRED' | 'CONDITIONAL';
  affectedSupplyTypeIds: string[];
  question: string;
  reason: string;
  evidenceNeeded: string;
};

export type OfficialScore =
  | { status: 'AVAILABLE'; total: number; max: number; breakdown: Array<{ label: string; points: number; max: number; evidenceId: string }> }
  | { status: 'NOT_APPLICABLE' }
  | { status: 'PENDING' };

export type NoticeSupplyAssessment = {
  supplyTypeId: string;
  supplyTypeLabel: string;
  eligibility: NoticeEligibility;
  priorityStage: string | null;
  priorityLabel: string;
  officialScore: OfficialScore;
  supplyCount: number;
  applicationDate: string;
  matchedAdvantages: string[];
  cautions: string[];
  evidenceRequired: string[];
  reasons: string[];
  failedReasons: string[];
  missingInformation: string[];
  evidence: Evidence[];
  autoRecommend: boolean;
  rank: number;
};

export type Recommendation = {
  recommended: NoticeSupplyAssessment | null;
  alternatives: NoticeSupplyAssessment[];
  lowerPriority: NoticeSupplyAssessment[];
  rejected: NoticeSupplyAssessment[];
  informationOnly: NoticeSupplyAssessment[];
};

export type Assessment = {
  noticeId: NoticeId;
  listingId: string;
  rulePackageId: string;
  rulePackageVersion: string;
  sourceStatus: RuleSourceStatus;
  evaluations: NoticeSupplyAssessment[];
  recommendation: Recommendation;
  requiredDocuments: string[];
  unresolvedFacts: AssessmentFact[];
};

export type RAGSource = {
  id: string;
  noticeId: NoticeId;
  version: string;
  sourceHash: string;
  chunks: Array<{
    id: string;
    section: string;
    kind: 'paragraph' | 'table';
    supplyTypeIds: string[];
    textExcerpt: string;
    locator: Record<string, unknown>;
  }>;
};

export type ComparisonResult = {
  orderedNoticeIds: NoticeId[];
  preferredNoticeId: NoticeId | null;
  basis: 'ELIGIBILITY' | 'PRIORITY_STAGE' | 'OFFICIAL_SCORE' | 'EVIDENCE_COMPLETENESS' | 'SUPPLY_COUNT' | 'EQUIVALENT' | 'NO_RECOMMENDATION';
  reasons: string[];
  disclaimer: string;
};

export type NoticePresentation = {
  id: NoticeId;
  title: string;
  managementNumber: string;
  region: string;
  address: string;
  noticeDate: string;
  status: NoticeLifecycleStatus;
  supplyTypes: SupplyType[];
  source: { fileName: string; sha256: string; official: boolean };
};

export type NoticeAssessmentInput = AssessmentInput & {
  /** Presentation response state; values are never interpreted as domain facts. */
  answerStates?: Record<string, 'ANSWERED' | 'DOES_NOT_KNOW'>;
};

export type NoticeAdapter = {
  notice: Notice;
  rulePackage: RulePackage;
  ragSource: RAGSource;
  lifecycle: NoticeLifecycle;
  binding: { noticeId: NoticeId; rulePackageId: string; sourceHash: string; status: 'INACTIVE' | 'ACTIVE' };
  /** Unresolved source/scope findings prohibit public activation. */
  reviewBlockers: readonly string[];
  assess: (profile: NoticeAssessmentInput) => Assessment;
};
