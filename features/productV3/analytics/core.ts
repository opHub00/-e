import { ANALYTICS_EVENT_TYPES, UNRESOLVED_CATEGORIES, type AnalyticsCollectionStatus, type AnalyticsEvent, type AnalyticsGate, type AnalyticsGlobalCollectionStatus, type AnalyticsQuery, type AnalyticsQueryDataState, type AnalyticsSummaryV2, type AnalyticsTrafficType } from './contract.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noticeId = /^[a-z][a-z0-9-]{1,62}$/;
const version = /^[A-Za-z0-9._-]{1,32}$/;
const supply = /^[A-Z0-9_]{2,40}$/;
const date = /^\d{4}-\d{2}-\d{2}$/;
const allowed = new Set(ANALYTICS_EVENT_TYPES);
const categories = new Set(UNRESOLVED_CATEGORIES);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Explicit projection: unknown fields are never persisted, even if a caller sends them. */
export function parseAnalyticsEvent(value: unknown): AnalyticsEvent | null {
  if (!record(value)) return null;
  const row = value as Record<string, unknown>;
  if (!uuid.test(String(row.eventId ?? '')) || !uuid.test(String(row.anonymousSessionId ?? ''))
    || !noticeId.test(String(row.noticeId ?? '')) || !version.test(String(row.noticeVersion ?? ''))
    || !allowed.has(row.eventType as AnalyticsEvent['eventType'])
    || !['preview', 'staging', 'production'].includes(String(row.environment))
    || !['qa', 'internal', 'beta', 'real'].includes(String(row.trafficType))
    || !Number.isFinite(Date.parse(String(row.occurredAt ?? '')))) return null;
  if (row.supplyType !== undefined && !supply.test(String(row.supplyType))) return null;
  if (row.assessmentStatus !== undefined && !['COMPLETE', 'NEEDS_USER_INPUT', 'INELIGIBLE', 'UNAVAILABLE'].includes(String(row.assessmentStatus))) return null;
  if (row.unresolvedCategory !== undefined && !categories.has(row.unresolvedCategory as (typeof UNRESOLVED_CATEGORIES)[number])) return null;
  if (row.conversationTurnCount !== undefined && (!Number.isInteger(row.conversationTurnCount) || Number(row.conversationTurnCount) < 0 || Number(row.conversationTurnCount) > 100)) return null;
  if (row.durationBucket !== undefined && !['under_1m', '1_to_3m', '3_to_10m', 'over_10m'].includes(String(row.durationBucket))) return null;
  if (row.aiMode !== undefined && !['deterministic', 'llm', 'fallback'].includes(String(row.aiMode))) return null;
  if (row.fallbackReason !== undefined && !['missing_key', 'provider_error', 'timeout', 'grounding_rejected', 'parser_failure', 'unknown'].includes(String(row.fallbackReason))) return null;
  return Object.fromEntries(Object.keys(row).filter(key => [
    'eventId', 'anonymousSessionId', 'noticeId', 'noticeVersion', 'eventType', 'occurredAt', 'environment', 'trafficType',
    'supplyType', 'assessmentStatus', 'unresolvedCategory', 'conversationTurnCount', 'durationBucket', 'aiMode', 'fallbackReason',
  ].includes(key)).map(key => [key, row[key]])) as AnalyticsEvent;
}

export function analyticsGateFromEnv(env: Record<string, string | undefined>): AnalyticsGate {
  const retention = Number(env.EVENT_ANALYTICS_RETENTION_DAYS);
  const cap = Number(env.EVENT_ANALYTICS_SESSION_EVENT_CAP);
  const rate = Number(env.EVENT_ANALYTICS_RATE_LIMIT_PER_MINUTE);
  return {
    analyticsEnabled: env.EVENT_ANALYTICS_ENABLED === 'true',
    collectionStartAt: env.EVENT_ANALYTICS_COLLECTION_START_AT ?? '2026-10-27T00:00:00+09:00',
    requiredNoticeVersion: env.EVENT_ANALYTICS_REQUIRED_NOTICE_VERSION ?? 'VER1.8',
    requiredOfficialState: 'ACTIVE', allowedEnvironment: 'production',
    allowedTrafficTypes: (env.EVENT_ANALYTICS_ALLOWED_TRAFFIC_TYPES ?? 'qa,internal,beta').split(',').filter((item): item is AnalyticsTrafficType => ['qa', 'internal', 'beta', 'real'].includes(item)),
    sessionEventCap: Number.isInteger(cap) && cap > 0 && cap <= 10000 ? cap : 300,
    endpointRateLimitPerMinute: Number.isInteger(rate) && rate > 0 && rate <= 10000 ? rate : 60,
    retentionDays: Number.isInteger(retention) && retention > 0 && retention <= 3650 ? retention : null,
  };
}

export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
export const kstDayStart = (day: string): number => Date.parse(`${day}T00:00:00Z`) - KST_OFFSET_MS;
export function analyticsWindow(query: AnalyticsQuery): { from: number; to: number; previousFrom: number } {
  const from = kstDayStart(query.from), to = kstDayStart(query.to) + DAY_MS;
  return { from, to, previousFrom: from - (to - from) };
}

/** Server-provided launch state; no client-provided version or publication assertion is trusted. */
export function analyticsCollectionStatus(gate: AnalyticsGate, officialDataReady: boolean, hasRealEvents: boolean, now = new Date()): AnalyticsCollectionStatus {
  let collectionState: AnalyticsCollectionStatus['collectionState'];
  if (!version.test(gate.requiredNoticeVersion) || !Number.isFinite(Date.parse(gate.collectionStartAt))) collectionState = 'MISCONFIGURED';
  else if (!officialDataReady || now.getTime() < Date.parse(gate.collectionStartAt)) collectionState = 'PRE_LAUNCH';
  else if (!gate.analyticsEnabled || !gate.allowedTrafficTypes.includes('real')) collectionState = 'PAUSED';
  else collectionState = hasRealEvents ? 'COLLECTING' : 'READY_NOT_STARTED';
  return { collectionState, officialDataReady, requiredNoticeVersion: gate.requiredNoticeVersion, collectionStartAt: gate.collectionStartAt };
}

/** A global operational state never depends on the selected Admin environment, traffic or notice filter. */
export function globalAnalyticsCollectionStatus(gate: AnalyticsGate, officialDataReady: boolean,
  productionStoreReady: boolean, hasRealEvents: boolean, now = new Date()): AnalyticsGlobalCollectionStatus {
  const base = analyticsCollectionStatus(gate, officialDataReady, hasRealEvents, now);
  return {
    ...base,
    collectionState: base.collectionState === 'READY_NOT_STARTED' || base.collectionState === 'COLLECTING'
      ? productionStoreReady ? base.collectionState : 'MISCONFIGURED' : base.collectionState,
    targetEnvironment: gate.allowedEnvironment,
    allowedTrafficTypes: [...gate.allowedTrafficTypes],
    productionStoreReady,
  };
}

/** Dry-run contract only. No deletion is scheduled or executed by this function. */
export function analyticsRetentionPlan(gate: AnalyticsGate, now = new Date()): { cutoff: string; retentionDays: number } | null {
  return gate.retentionDays === null ? null : { cutoff: new Date(now.getTime() - gate.retentionDays * DAY_MS).toISOString(), retentionDays: gate.retentionDays };
}

/** `real` additionally requires a server-verified, officially published ACTIVE notice. */
export function shouldCollect(event: AnalyticsEvent, gate: AnalyticsGate, officialActiveVerified: boolean): boolean {
  if (!gate.analyticsEnabled || !gate.allowedTrafficTypes.includes(event.trafficType)) return false;
  if (event.trafficType !== 'real') return true;
  return event.environment === gate.allowedEnvironment && officialActiveVerified
    && event.noticeVersion === gate.requiredNoticeVersion
    && Number.isFinite(Date.parse(gate.collectionStartAt))
    && Date.parse(event.occurredAt) >= Date.parse(gate.collectionStartAt);
}

export function parseAnalyticsQuery(raw: Record<string, unknown>): AnalyticsQuery | null {
  const from = String(raw.from ?? ''), to = String(raw.to ?? '');
  if (!date.test(from) || !date.test(to) || !Number.isFinite(Date.parse(`${from}T00:00:00Z`)) || !Number.isFinite(Date.parse(`${to}T00:00:00Z`))
    || new Date(`${from}T00:00:00Z`).toISOString().slice(0, 10) !== from
    || new Date(`${to}T00:00:00Z`).toISOString().slice(0, 10) !== to || from > to
    || Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 366 * 86_400_000) return null;
  const environment = String(raw.environment ?? ''), trafficType = String(raw.trafficType ?? '');
  if (!['preview', 'staging', 'production'].includes(environment) || !['qa', 'internal', 'beta', 'real'].includes(trafficType)) return null;
  if (raw.noticeId !== undefined && !noticeId.test(String(raw.noticeId))) return null;
  if (raw.previousPeriod !== undefined && !['true', 'false'].includes(String(raw.previousPeriod))) return null;
  return { from, to, environment: environment as AnalyticsQuery['environment'], trafficType: trafficType as AnalyticsQuery['trafficType'],
    ...(raw.noticeId ? { noticeId: String(raw.noticeId) } : {}), previousPeriod: raw.previousPeriod === 'true' };
}

export function getAnalyticsSummary(events: readonly AnalyticsEvent[], query: AnalyticsQuery, now?: Date,
  globalCollection?: AnalyticsGlobalCollectionStatus, queryDataState?: AnalyticsQueryDataState): AnalyticsSummaryV2 {
  const { from, to, previousFrom } = analyticsWindow(query);
  const generated = now ?? new Date();
  const matching = (start: number, end: number) => events.filter(event => event.environment === query.environment
    && event.trafficType === query.trafficType && (!query.noticeId || event.noticeId === query.noticeId)
    && Date.parse(event.occurredAt) >= start && Date.parse(event.occurredAt) < (now ? Math.min(end, now.getTime() + 1) : end));
  const unique = (rows: readonly AnalyticsEvent[], kind: AnalyticsEvent['eventType']) => new Set(rows.filter(item => item.eventType === kind).map(item => item.anonymousSessionId)).size;
  const rate = (rows: readonly AnalyticsEvent[]) => {
    const started = unique(rows, 'ASSESSMENT_STARTED');
    return started ? unique(rows, 'ASSESSMENT_COMPLETED') / started : null;
  };
  const rows = [...new Map(matching(from, to).map(row => [row.eventId, row])).values()];
  const lastEventAt = rows.length
    ? new Date(rows.reduce((latest, row) => Math.max(latest, Date.parse(row.occurredAt)), -Infinity)).toISOString() : null;
  const global = globalCollection ?? globalAnalyticsCollectionStatus(analyticsGateFromEnv({}), false, false, false, generated);
  const prior = query.previousPeriod ? [...new Map(matching(previousFrom, from).map(row => [row.eventId, row])).values()] : null;
  const count = (kind: AnalyticsEvent['eventType']) => rows.filter(row => row.eventType === kind).length;
  const distribution = <K extends string>(values: readonly (K | undefined)[]): Partial<Record<K, number>> => {
    const result: Partial<Record<K, number>> = {};
    for (const value of values) if (value) result[value] = (result[value] ?? 0) + 1;
    return result;
  };
  const completed = rows.filter(row => row.eventType === 'ASSESSMENT_COMPLETED');
  const status = distribution(completed.map(row => row.assessmentStatus));
  const supplyStatus: AnalyticsSummaryV2['supplyTypeAssessmentDistribution'] = {};
  for (const row of completed) if (row.supplyType && row.assessmentStatus) {
    const cell = supplyStatus[row.supplyType] ??= { COMPLETE: 0, NEEDS_USER_INPUT: 0, INELIGIBLE: 0, UNAVAILABLE: 0 };
    cell[row.assessmentStatus] += 1;
  }
  const turnsBySession = new Map<string, number>();
  for (const row of rows) if (row.eventType === 'COPILOT_USED' && row.conversationTurnCount !== undefined)
    turnsBySession.set(row.anonymousSessionId, Math.max(turnsBySession.get(row.anonymousSessionId) ?? 0, row.conversationTurnCount));
  const turns = [...turnsBySession.values()];
  return { query, generatedAt: generated.toISOString(), lastEventAt,
    collection: global, globalCollection: global,
    globalCollectionState: global.collectionState, globalOfficialDataReady: global.officialDataReady,
    globalCollectionStartAt: global.collectionStartAt, globalRequiredNoticeVersion: global.requiredNoticeVersion,
    globalTargetEnvironment: global.targetEnvironment, globalAllowedTrafficTypes: global.allowedTrafficTypes,
    currentQuery: { environment: query.environment, trafficType: query.trafficType,
      dataState: queryDataState ?? (rows.length ? 'AVAILABLE' : 'NO_EVENTS'), lastEventAt },
    sessionsStarted: unique(rows, 'SESSION_STARTED'), assessmentsStarted: unique(rows, 'ASSESSMENT_STARTED'),
    assessmentsCompleted: unique(rows, 'ASSESSMENT_COMPLETED'), completionRate: rate(rows), resultViews: count('RESULT_VIEWED'),
    resultSaves: count('RESULT_SAVED'), qrCreates: count('QR_CREATED'),
    resultViewSessions: unique(rows, 'RESULT_VIEWED'), resultSaveSessions: unique(rows, 'RESULT_SAVED'), qrCreateSessions: unique(rows, 'QR_CREATED'),
    assessmentStatusDistribution: { COMPLETE: status.COMPLETE ?? 0, NEEDS_USER_INPUT: status.NEEDS_USER_INPUT ?? 0,
      INELIGIBLE: status.INELIGIBLE ?? 0, UNAVAILABLE: status.UNAVAILABLE ?? 0 },
    unresolvedCategoryDistribution: distribution([...new Map(rows.filter(row => row.eventType === 'FACT_MARKED_UNKNOWN' && row.unresolvedCategory)
      .map(row => [`${row.anonymousSessionId}:${row.unresolvedCategory}`, row])).values()].map(row => row.unresolvedCategory)),
    noticeDistribution: distribution([...new Map(completed.map(row => [`${row.anonymousSessionId}:${row.noticeId}`, row])).values()].map(row => row.noticeId)) as Record<string, number>,
    supplyTypeDistribution: distribution(completed.map(row => row.supplyType)) as Record<string, number>,
    supplyTypeAssessmentDistribution: supplyStatus,
    copilotUsage: count('COPILOT_USED'), aiModeDistribution: distribution(rows.filter(row => row.eventType === 'COPILOT_USED').map(row => row.aiMode)),
    fallbackDistribution: distribution(rows.filter(row => row.eventType === 'COPILOT_USED').map(row => row.fallbackReason)),
    averageTurns: turns.length ? turns.reduce((a, b) => a + b, 0) / turns.length : null,
    durationBuckets: distribution([...new Map(rows.filter(row => row.eventType === 'SESSION_COMPLETED').map(row => [row.anonymousSessionId, row])).values()].map(row => row.durationBucket)),
    previousPeriodComparison: prior ? { sessionsStarted: unique(prior, 'SESSION_STARTED'), assessmentsStarted: unique(prior, 'ASSESSMENT_STARTED'),
      assessmentsCompleted: unique(prior, 'ASSESSMENT_COMPLETED'), completionRate: rate(prior),
      resultViewSessions: unique(prior, 'RESULT_VIEWED'), resultSaveSessions: unique(prior, 'RESULT_SAVED'), qrCreateSessions: unique(prior, 'QR_CREATED'),
      needsUserInput: prior.filter(row => row.eventType === 'ASSESSMENT_COMPLETED' && row.assessmentStatus === 'NEEDS_USER_INPUT').length,
      fallback: prior.filter(row => row.eventType === 'COPILOT_USED' && row.aiMode === 'fallback').length } : null };
}
