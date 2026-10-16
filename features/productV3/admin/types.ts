import type { Notice, NoticeLifecycleStatus, Rule, RulePackage, RulePackageLifecycleStatus } from '../../noticePlatform/types.ts';

export type AdminActor = { id: string; role: 'reviewer' | 'admin' };
export type AdminRuntime = 'local' | 'test' | 'preview' | 'production';

export type AuditLogEntry = {
  id: string;
  actor: AdminActor;
  action: string;
  entity: 'NOTICE' | 'RULE_PACKAGE';
  entityId: string;
  before: unknown;
  after: unknown;
  timestamp: string;
  reason: string;
};

export type NoticeAdminViewModel = {
  noticeId: string;
  title: string;
  complex: string;
  region: string;
  noticeDate: string;
  supplyTypes: string[];
  status: NoticeLifecycleStatus;
  sourceDocument: string;
  sourceHash: string;
  provenance: { managementNumber: string; official: boolean };
  rulePackageVersion: string | null;
  ragVersion: string | null;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
};

export type RulePackageReviewViewModel = {
  id: string;
  noticeId: string;
  version: string;
  status: RulePackageLifecycleStatus;
  ruleCount: number;
  rules: Array<{
    id: string;
    ruleType: string;
    supplyType: string;
    label: string;
    evidenceLocator: Record<string, unknown> | null;
    evidenceExcerpt: string | null;
    provenance: { source: string; section: string; documentId: string | null };
    scoreRule: boolean;
    missingEvidence: boolean;
  }>;
  validationErrors: string[];
  canRequestReview: boolean;
  canApprove: boolean;
  canActivate: boolean;
};

export type AiFallbackReason = 'missing_key' | 'provider_error' | 'timeout' | 'grounding_rejected' | 'parser_failure' | 'unknown';
export type AiMonitoringRecord = {
  requestId: string;
  createdAt: string;
  sanitizedQuestion: string;
  resolver: string;
  mode: 'deterministic' | 'llm' | 'fallback';
  provider: string | null;
  model: string | null;
  ragEvidenceCount: number;
  groundingResult: 'PASSED' | 'REJECTED' | 'NOT_RUN';
  fallbackReason: AiFallbackReason | null;
  latencyMs: number;
  noticeIds: string[];
};

export type AiMonitoringViewModel = {
  total: number;
  deterministic: number;
  llm: number;
  fallback: number;
  groundingRejection: number;
  providerError: number;
  timeout: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  recent: AiMonitoringRecord[];
};

export type AssessmentStatus = 'COMPLETE' | 'NEEDS_USER_INPUT' | 'INELIGIBLE' | 'UNAVAILABLE';
export type AssessmentMonitoringRecord = {
  id: string;
  createdAt: string;
  noticeIds: string[];
  statusCounts: Record<AssessmentStatus, number>;
  unresolvedCategories: string[];
};

export type AssessmentMonitoringViewModel = {
  total: number;
  statusCounts: Record<AssessmentStatus, number>;
  unresolvedFactFrequency: Array<{ label: string; count: number }>;
};

export type AdminDashboardViewModel = {
  activeNoticeCount: number;
  draftNoticeCount: number;
  activeRulePackageCount: number;
  reviewRequiredCount: number;
  assessments: AssessmentMonitoringViewModel;
  ai: AiMonitoringViewModel;
};

export type AdminOperationSnapshot = {
  notices: Notice[];
  rulePackages: RulePackage[];
  ragVersions: Record<string, string>;
  audits: AuditLogEntry[];
  ai: AiMonitoringRecord[];
  assessments: AssessmentMonitoringRecord[];
};

export type AdminMutation = { actor: AdminActor; reason: string; at?: string };

export type RulePackageDraft = Omit<RulePackage, 'status' | 'createdAt' | 'updatedAt'> & { rules: Rule[] };
