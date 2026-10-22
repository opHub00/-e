/** Operational events contain no answers, profile, conversation text, or QR data. */
export const ANALYTICS_EVENT_TYPES = [
  'SESSION_STARTED', 'ASSESSMENT_STARTED', 'QUESTION_ANSWERED', 'FACT_MARKED_UNKNOWN',
  'ASSESSMENT_COMPLETED', 'RESULT_VIEWED', 'NOTICE_COMPARED', 'COPILOT_USED',
  'SIMULATION_RUN', 'RESULT_SAVED', 'QR_CREATED', 'SESSION_COMPLETED',
] as const;
export type AnalyticsEventType = typeof ANALYTICS_EVENT_TYPES[number];
export type AnalyticsEnvironment = 'preview' | 'staging' | 'production';
export type AnalyticsTrafficType = 'qa' | 'internal' | 'beta' | 'real';
export type AnalyticsAssessmentStatus = 'COMPLETE' | 'NEEDS_USER_INPUT' | 'INELIGIBLE' | 'UNAVAILABLE';
export const UNRESOLVED_CATEGORIES = [
  'residency', 'subscription_account', 'income', 'assets', 'rewinning_restriction',
  'household', 'marriage_child', 'evidence', 'other',
] as const;
export type UnresolvedCategory = typeof UNRESOLVED_CATEGORIES[number];
export type AnalyticsAiMode = 'deterministic' | 'llm' | 'fallback';
export type AnalyticsFallbackReason = 'missing_key' | 'provider_error' | 'timeout' | 'grounding_rejected' | 'parser_failure' | 'unknown';
export type DurationBucket = 'under_1m' | '1_to_3m' | '3_to_10m' | 'over_10m';

export type AnalyticsEvent = {
  eventId: string;
  anonymousSessionId: string;
  noticeId: string;
  noticeVersion: string;
  eventType: AnalyticsEventType;
  occurredAt: string;
  environment: AnalyticsEnvironment;
  trafficType: AnalyticsTrafficType;
  supplyType?: string;
  assessmentStatus?: AnalyticsAssessmentStatus;
  unresolvedCategory?: UnresolvedCategory;
  conversationTurnCount?: number;
  durationBucket?: DurationBucket;
  aiMode?: AnalyticsAiMode;
  fallbackReason?: AnalyticsFallbackReason;
};

export type AnalyticsGate = {
  analyticsEnabled: boolean;
  collectionStartAt: string;
  requiredNoticeVersion: string;
  allowedTrafficTypes: readonly AnalyticsTrafficType[];
  retentionDays: number | null;
};

export type AnalyticsQuery = {
  from: string;
  to: string;
  environment: AnalyticsEnvironment;
  trafficType: AnalyticsTrafficType;
  noticeId?: string;
  previousPeriod?: boolean;
};

export type AnalyticsSummary = {
  query: AnalyticsQuery;
  /** Distinct anonymous session IDs, never unique people. */
  sessionsStarted: number;
  assessmentsStarted: number;
  assessmentsCompleted: number;
  completionRate: number | null;
  resultViews: number;
  resultSaves: number;
  qrCreates: number;
  assessmentStatusDistribution: Record<AnalyticsAssessmentStatus, number>;
  unresolvedCategoryDistribution: Partial<Record<UnresolvedCategory, number>>;
  noticeDistribution: Record<string, number>;
  supplyTypeDistribution: Record<string, number>;
  copilotUsage: number;
  aiModeDistribution: Partial<Record<AnalyticsAiMode, number>>;
  fallbackDistribution: Partial<Record<AnalyticsFallbackReason, number>>;
  averageTurns: number | null;
  durationBuckets: Partial<Record<DurationBucket, number>>;
  previousPeriodComparison: { sessionsStarted: number; assessmentsCompleted: number; completionRate: number | null } | null;
};
