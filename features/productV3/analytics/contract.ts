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
  requiredOfficialState: 'ACTIVE';
  allowedEnvironment: 'production';
  allowedTrafficTypes: readonly AnalyticsTrafficType[];
  sessionEventCap: number;
  endpointRateLimitPerMinute: number;
  retentionDays: number | null;
};

export type AnalyticsCollectionState = 'PRE_LAUNCH' | 'READY_NOT_STARTED' | 'COLLECTING' | 'PAUSED' | 'MISCONFIGURED';
export type AnalyticsCollectionStatus = {
  collectionState: AnalyticsCollectionState;
  officialDataReady: boolean;
  requiredNoticeVersion: string;
  collectionStartAt: string;
  targetEnvironment?: 'production';
  allowedTrafficTypes?: readonly AnalyticsTrafficType[];
};

/** Independent of the Admin filter. A missing Production store must never be read from Staging. */
export type AnalyticsGlobalCollectionStatus = AnalyticsCollectionStatus & {
  targetEnvironment: 'production';
  allowedTrafficTypes: readonly AnalyticsTrafficType[];
  productionStoreReady: boolean;
};
export type AnalyticsQueryDataState = 'AVAILABLE' | 'NO_EVENTS' | 'STORE_UNAVAILABLE';
export type AnalyticsCurrentQueryState = {
  environment: AnalyticsEnvironment;
  trafficType: AnalyticsTrafficType;
  dataState: AnalyticsQueryDataState;
  lastEventAt: string | null;
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
  /** Global launch state is server-derived, not inferred from this filtered result. */
  globalCollection?: AnalyticsGlobalCollectionStatus;
  globalCollectionState?: AnalyticsCollectionState;
  globalOfficialDataReady?: boolean;
  globalCollectionStartAt?: string;
  globalRequiredNoticeVersion?: string;
  globalTargetEnvironment?: 'production';
  globalAllowedTrafficTypes?: readonly AnalyticsTrafficType[];
  currentQuery?: AnalyticsCurrentQueryState;
  generatedAt?: string;
  lastEventAt?: string | null;
  collection?: AnalyticsCollectionStatus;
  /** Distinct anonymous session IDs, never unique people. */
  sessionsStarted: number;
  assessmentsStarted: number;
  assessmentsCompleted: number;
  completionRate: number | null;
  resultViews: number;
  resultSaves: number;
  qrCreates: number;
  resultViewSessions?: number;
  resultSaveSessions?: number;
  qrCreateSessions?: number;
  assessmentStatusDistribution: Record<AnalyticsAssessmentStatus, number>;
  unresolvedCategoryDistribution: Partial<Record<UnresolvedCategory, number>>;
  noticeDistribution: Record<string, number>;
  supplyTypeDistribution: Record<string, number>;
  /** Completed assessment cells only; not a success probability. */
  supplyTypeAssessmentDistribution?: Record<string, Record<AnalyticsAssessmentStatus, number>>;
  copilotUsage: number;
  aiModeDistribution: Partial<Record<AnalyticsAiMode, number>>;
  fallbackDistribution: Partial<Record<AnalyticsFallbackReason, number>>;
  averageTurns: number | null;
  durationBuckets: Partial<Record<DurationBucket, number>>;
  previousPeriodComparison: {
    sessionsStarted: number; assessmentsStarted: number; assessmentsCompleted: number; completionRate: number | null;
    resultViewSessions?: number; resultSaveSessions?: number; qrCreateSessions?: number;
    needsUserInput?: number; fallback?: number;
  } | null;
};

/** Server responses always include v2 fields; optional base fields preserve existing UI fixtures. */
export type AnalyticsSummaryV2 = AnalyticsSummary & {
  generatedAt: string; lastEventAt: string | null; collection: AnalyticsCollectionStatus;
  globalCollection: AnalyticsGlobalCollectionStatus; currentQuery: AnalyticsCurrentQueryState;
  globalCollectionState: AnalyticsCollectionState; globalOfficialDataReady: boolean;
  globalCollectionStartAt: string; globalRequiredNoticeVersion: string;
  globalTargetEnvironment: 'production'; globalAllowedTrafficTypes: readonly AnalyticsTrafficType[];
  resultViewSessions: number; resultSaveSessions: number; qrCreateSessions: number;
  supplyTypeAssessmentDistribution: Record<string, Record<AnalyticsAssessmentStatus, number>>;
};
