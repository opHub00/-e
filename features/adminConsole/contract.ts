/**
 * 통합 운영 콘솔(Product V3) — 화면이 받을 데이터 모양.
 *
 * 데이터는 Codex 쪽(Generic Notice · Admin backend · monitoring)이 만든다. 콘솔은 이 모양을 받아 그릴 뿐이고
 * 숫자를 직접 만들지 않는다. 연결 전에는 '연결 전'으로 보여 주고, 예시 데이터는 ?demo=1(Demo 빌드)에서만 쓴다.
 * 개인정보는 이 계약에 들어오지 않는다(AI 질문은 서버에서 정리된 sanitized 문장만).
 */
export type NoticeLifecycle = 'DRAFT' | 'SOURCE_VERIFIED' | 'REVIEW_REQUIRED' | 'APPROVED' | 'ACTIVE' | 'ARCHIVED';

export type ConsoleValidation = { status: 'PASS' | 'WARN' | 'FAIL'; messages: string[] };

export type ConsoleNotice = {
  id: string;
  title: string;
  region: string;
  /** 'YYYY-MM-DD' */
  announcementDate: string;
  status: NoticeLifecycle;
  ruleVersion: string | null;
  ragVersion: string | null;
  provenance: { fileName: string; sha256: string; official: boolean; sourceUrl?: string | null };
  /** ISO 시각 */
  updatedAt: string;
  supplyTypes: string[];
  ruleCount: number;
  ragChunkCount: number;
  validation: ConsoleValidation;
  history: Array<{ at: string; actor: string; summary: string }>;
};

export type RuleReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type ConsoleRule = {
  id: string;
  noticeId: string;
  ruleType: string;
  supplyType: string;
  condition: string;
  value: string;
  evidence: { section: string; excerpt: string; locator: string };
  validation: ConsoleValidation;
  status: RuleReviewStatus;
};

export type AssessmentStatus = 'COMPLETE' | 'NEEDS_USER_INPUT' | 'INELIGIBLE' | 'UNAVAILABLE';

export type ConsoleAssessmentStats = {
  /** 'YYYY-MM-DD' 집계 기준일 */
  date: string;
  byStatus: Record<AssessmentStatus, number>;
  /** 사용자가 답하지 못해 판정이 멈춘 항목(fact 라벨) 순위 */
  blockers: Array<{ label: string; count: number }>;
};

export type AiMode = 'deterministic' | 'llm' | 'fallback';

export type ConsoleAiEvent = {
  id: string;
  at: string;
  /** 서버에서 개인정보를 지운 질문 */
  question: string;
  mode: AiMode;
  provider: string | null;
  fallbackReason: string | null;
  groundingRejected: boolean;
  providerError: boolean;
  evidenceCount: number;
  latencyMs: number;
  evidence: Array<{ section: string; excerpt: string; locator: string }>;
};

export type ConsoleAuditEntry = {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity: { type: 'NOTICE' | 'RULE' | 'RULE_PACKAGE' | 'RAG' | 'SETTING'; id: string; label: string };
  before: Record<string, string | number | boolean | null> | null;
  after: Record<string, string | number | boolean | null> | null;
};

export type ConsoleError = { at: string; source: string; message: string };

export type ConsoleSnapshot = {
  generatedAt: string;
  notices: ConsoleNotice[];
  rules: ConsoleRule[];
  assessments: ConsoleAssessmentStats;
  ai: ConsoleAiEvent[];
  audit: ConsoleAuditEntry[];
  errors: ConsoleError[];
};

export type ConsoleSource =
  | { status: 'CONNECTED'; snapshot: ConsoleSnapshot }
  | { status: 'DEMO'; snapshot: ConsoleSnapshot }
  | { status: 'NOT_CONNECTED' };
