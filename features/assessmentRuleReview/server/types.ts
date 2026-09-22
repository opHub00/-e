import type { ExceptionRelationType } from '../../ruleExtraction/server/v4_1/exceptionRelations.ts';
import type { RuleSourceStatus } from '../../applicationAssessment/types.ts';

export const RULE_REVIEW_STATUSES = ['PENDING_REVIEW', 'IN_REVIEW', 'APPROVED', 'APPROVED_WITH_EDIT', 'HELD', 'REJECTED'] as const;
export type RuleReviewStatus = typeof RULE_REVIEW_STATUSES[number];
export const CRITICAL_CATEGORIES = ['AGE', 'HOUSING', 'SUBSCRIPTION', 'INCOME', 'ASSET', 'TAX', 'SAVINGS', 'STAGE', 'SCORE', 'SCOPE', 'EXCEPTION'] as const;
export type CriticalCategory = typeof CRITICAL_CATEGORIES[number];
export type CandidateSafetyStatus = 'AUTO_SAFE_CANDIDATE' | 'REVIEW_REQUIRED' | 'UNRESOLVED';
export type EvidenceReviewStatus = 'VALID' | 'INVALID' | 'REPLACED' | 'NEEDS_REVIEW';
export type ExceptionReviewStatus = 'LINKED' | 'INDEPENDENT' | 'EXCLUDED' | 'HELD' | 'ORPHAN_EXCEPTION' | 'WRONG_RELATION';
export type ConflictResolution =
  | { type: 'CANDIDATE'; candidateId: string; reason: string }
  | { type: 'CUSTOM'; value: unknown; evidenceIds: string[]; reason: string }
  | { type: 'HELD'; reason: string };

export const CRITICAL_BLOCKER_CODES = ['CONFLICT', 'UNRESOLVED', 'ORPHAN_EXCEPTION', 'MISSING_CRITICAL_RULE', 'SEMANTIC_EVIDENCE_MISMATCH',
  'CRITICAL_SCORE_VIOLATION', 'PARTIAL_RANGE_BINDING', 'SCOPE_MISMATCH', 'HIGH_CRITICAL_ERROR'] as const;
export type CriticalBlockerCode = typeof CRITICAL_BLOCKER_CODES[number];
export type ActivationBlockerCode = CriticalBlockerCode | 'PENDING_CRITICAL_REVIEW' | 'HELD_RULE' | 'REJECTED_CRITICAL_RULE' |
  'EVIDENCE_NOT_VALID' | 'DOCUMENT_REVALIDATION_REQUIRED' | 'REVIEW_NOT_STARTED' | 'NON_CRITICAL_REVIEW_INCOMPLETE';

export type ReviewEvidence = {
  id: string;
  documentId: string;
  section: string;
  tableLabel: string | null;
  label: string;
  textExcerpt: string | null;
  locator: Record<string, unknown>;
};

export type ReviewableRuleSnapshot = {
  ruleKey: string;
  label: string;
  semanticRole: string;
  supplyType: string;
  category: CriticalCategory;
  operator: string | null;
  value: unknown;
  scope: string | null;
  stage: string | null;
  score: number | null;
  maxScore: number | null;
  evidence: ReviewEvidence[];
  relatedExceptionRuleIds: string[];
  warnings: string[];
};

export type RuleReviewSeed = {
  ruleId: string;
  ruleVersionId: string;
  required: boolean;
  critical: boolean;
  candidateStatus: CandidateSafetyStatus;
  safetyBlockers: CriticalBlockerCode[];
  originalCandidate: ReviewableRuleSnapshot;
};

export type ReviewConflictSeed = {
  conflictId: string;
  concept: string;
  candidateRuleIds: string[];
  candidates: { candidateId: string; value: unknown; evidenceIds: string[] }[];
};

export type ReviewUnresolvedSeed = { unresolvedId: string; type: string; description: string; ruleIds: string[] };

export type RuleReviewWorkspaceSeed = {
  ruleVersionId: string;
  announcement: { id: string; title: string };
  document: { id: string; fileName: string; sha256: string; versionLabel: string };
  sourceStatus: RuleSourceStatus;
  version: string;
  rules: RuleReviewSeed[];
  conflicts: ReviewConflictSeed[];
  unresolvedItems: ReviewUnresolvedSeed[];
  requiredCategories: { supplyType: string; category: CriticalCategory }[];
  initialExceptionRelations?: { exceptionRuleId: string; baseRuleId: string; type: ExceptionRelationType }[];
};

export type RuleReviewRecord = RuleReviewSeed & {
  reviewStatus: RuleReviewStatus;
  reviewerId: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  decisionReason: string | null;
  originalCandidateHash: string;
  editedRuleSnapshot: ReviewableRuleSnapshot | null;
  editDiff: RuleEditDiff[];
  resolvedBlockerCodes: CriticalBlockerCode[];
  evidenceReviews: { evidenceId: string; status: EvidenceReviewStatus; reviewerId: string | null; reviewedAt: string | null; note: string | null; replacement: ReviewEvidence | null }[];
};

export type RuleEditDiff = { path: string; before: unknown; after: unknown };
export type ReviewConflict = ReviewConflictSeed & { resolution: ConflictResolution | null; reviewedBy: string | null; reviewedAt: string | null };
export type ReviewUnresolved = ReviewUnresolvedSeed & { resolution: string | null; reviewedBy: string | null; reviewedAt: string | null };
export type ExceptionReview = { exceptionRuleId: string; baseRuleId: string | null; relationType: ExceptionRelationType | null; status: ExceptionReviewStatus; reason: string | null };

export type ReviewAuditEntry = { sequence: number; actor: string; at: string; action: string; targetType: string; targetId: string; before: unknown; after: unknown; reason: string };

export type RuleReviewWorkspace = {
  ruleVersionId: string;
  announcement: RuleReviewWorkspaceSeed['announcement'];
  document: RuleReviewWorkspaceSeed['document'];
  sourceStatus: RuleSourceStatus;
  version: string;
  lifecycleStatus: 'PENDING_REVIEW' | 'IN_REVIEW' | 'REVALIDATION_REQUIRED';
  revision: number;
  reviewedDocumentHash: string;
  currentDocumentHash: string;
  rules: RuleReviewRecord[];
  conflicts: ReviewConflict[];
  unresolvedItems: ReviewUnresolved[];
  exceptionReviews: ExceptionReview[];
  requiredCategories: RuleReviewWorkspaceSeed['requiredCategories'];
  auditLog: ReviewAuditEntry[];
  /**
   * Whether this rule version is the one consultation currently reads.
   * Absent when the active state could not be read; the review gate is unaffected.
   */
  activation?: { state: 'ACTIVE' | 'NOT_ACTIVE' };
};

export type ActivationBlocker = { code: ActivationBlockerCode; ruleId?: string; conflictId?: string; unresolvedId?: string; message: string };
export type ActivationGate = {
  canActivate: boolean;
  status: 'ACTIVATION_ELIGIBLE' | 'BLOCKED' | 'REVALIDATION_REQUIRED';
  blockers: ActivationBlocker[];
  unresolvedCount: number;
  conflictsCount: number;
  heldCount: number;
  rejectedCriticalCount: number;
  pendingCriticalCount: number;
  missingRequiredCategories: string[];
};

export type ReviewMutation = { expectedRevision: number; actor: string; reason: string; at?: string };
