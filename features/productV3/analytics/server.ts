import { createHash, randomUUID } from 'node:crypto';
import { getActiveNotices } from '../../eventKiosk/noticePlatform/index.ts';
import { resolveProductV3StagingTarget } from '../admin/stagingTarget.ts';
import { analyticsGateFromEnv, getAnalyticsSummary, parseAnalyticsEvent, shouldCollect } from './core.ts';
import type { AnalyticsEvent, AnalyticsEventType, AnalyticsQuery, AnalyticsSummary, AnalyticsTrafficType, UnresolvedCategory } from './contract.ts';

const safeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const browserTypes = new Set<AnalyticsEventType>(['SESSION_STARTED', 'QUESTION_ANSWERED', 'FACT_MARKED_UNKNOWN', 'RESULT_VIEWED', 'NOTICE_COMPARED', 'COPILOT_USED', 'SIMULATION_RUN', 'RESULT_SAVED', 'SESSION_COMPLETED']);
const categoryMap: ReadonlyArray<[RegExp, UnresolvedCategory]> = [
  [/재당첨|rewinn/i, 'rewinning_restriction'], [/청약통장|입주자저축|납입|subscription|account/i, 'subscription_account'],
  [/소득|income/i, 'income'], [/자산|asset|vehicle/i, 'assets'], [/거주|residen/i, 'residency'],
  [/자녀|출생|혼인|결혼|child|marriage/i, 'marriage_child'], [/세대|무주택|주택소유|household|housing/i, 'household'],
];
export const safeUnresolvedCategory = (value: string): UnresolvedCategory => categoryMap.find(([pattern]) => pattern.test(value))?.[1] ?? 'evidence';

/** A retry of the same assessment request produces the same event IDs. */
export function stableAnalyticsEventId(requestId: string, suffix: string): string {
  const hex = createHash('sha256').update(`${requestId}:${suffix}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function serverEvent(input: {
  eventId?: string; anonymousSessionId: string; noticeId: string; eventType: AnalyticsEventType;
  supplyType?: string; assessmentStatus?: AnalyticsEvent['assessmentStatus']; unresolvedCategory?: UnresolvedCategory;
  conversationTurnCount?: number; durationBucket?: AnalyticsEvent['durationBucket']; aiMode?: AnalyticsEvent['aiMode']; fallbackReason?: AnalyticsEvent['fallbackReason'];
}, env: Record<string, string | undefined>, now = new Date()): AnalyticsEvent | null {
  const notice = getActiveNotices().find(item => item.id === input.noticeId);
  if (!notice || !safeUuid.test(input.anonymousSessionId)) return null;
  // The version label is derived from registered source metadata, never supplied by the browser.
  const noticeVersion = /1\.8/.test(notice.sourceDocument.fileName) ? 'VER1.8' : 'UNKNOWN';
  const environment = env.VERCEL_ENV === 'production' ? 'production' : env.WANPANE_ENV === 'staging' ? 'staging' : 'preview';
  const trafficType = (env.EVENT_ANALYTICS_TRAFFIC_TYPE ?? 'qa') as AnalyticsTrafficType;
  return parseAnalyticsEvent({ eventId: input.eventId ?? randomUUID(), anonymousSessionId: input.anonymousSessionId,
    noticeId: input.noticeId, noticeVersion, eventType: input.eventType, occurredAt: now.toISOString(), environment, trafficType,
    supplyType: input.supplyType, assessmentStatus: input.assessmentStatus, unresolvedCategory: input.unresolvedCategory,
    conversationTurnCount: input.conversationTurnCount, durationBucket: input.durationBucket, aiMode: input.aiMode, fallbackReason: input.fallbackReason });
}

const toRow = (event: AnalyticsEvent) => ({
  event_id: event.eventId, anonymous_session_id: event.anonymousSessionId, notice_id: event.noticeId,
  notice_version: event.noticeVersion, event_type: event.eventType, occurred_at: event.occurredAt,
  environment: event.environment, traffic_type: event.trafficType,
  supply_type: event.supplyType ?? null, assessment_status: event.assessmentStatus ?? null,
  unresolved_category: event.unresolvedCategory ?? null, conversation_turn_count: event.conversationTurnCount ?? null,
  duration_bucket: event.durationBucket ?? null, ai_mode: event.aiMode ?? null, fallback_reason: event.fallbackReason ?? null,
});

/** Every write is server-only, allowlisted and non-blocking. No production target is configured in this phase. */
export async function recordAnalyticsEvent(event: AnalyticsEvent | null, env: Record<string, string | undefined>, fetcher: typeof fetch = fetch): Promise<boolean> {
  return recordAnalyticsBatch(event ? [event] : [], env, fetcher);
}

export async function recordAnalyticsBatch(events: readonly AnalyticsEvent[], env: Record<string, string | undefined>, fetcher: typeof fetch = fetch): Promise<boolean> {
  const gate = analyticsGateFromEnv(env);
  const accepted = events.flatMap(event => {
    const parsed = parseAnalyticsEvent(event);
    if (!parsed) return [];
    const notice = getActiveNotices().find(item => item.id === parsed.noticeId);
    const officialActiveVerified = notice?.status === 'ACTIVE' && notice.sourceDocument.official === true;
    return shouldCollect(parsed, gate, officialActiveVerified) ? [parsed] : [];
  });
  if (!accepted.length) return false;
  try {
    const target = resolveProductV3StagingTarget(env);
    const response = await fetcher(new URL('/rest/v1/product_v3_analytics_events?on_conflict=event_id', target.url), {
      method: 'POST', headers: { apikey: target.serviceRoleKey, authorization: `Bearer ${target.serviceRoleKey}`,
        'content-type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(accepted.map(toRow)), signal: AbortSignal.timeout(6000),
    });
    return response.ok;
  } catch { return false; }
}

/** Browser may trigger a UX event, but cannot set metadata, status, version, traffic or raw fact category. */
export async function recordBrowserAnalytics(value: unknown, env: Record<string, string | undefined>, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (!browserTypes.has(row.eventType as AnalyticsEventType) || !safeUuid.test(String(row.eventId ?? '')) || !safeUuid.test(String(row.anonymousSessionId ?? ''))) return false;
  const event = serverEvent({ eventId: String(row.eventId), anonymousSessionId: String(row.anonymousSessionId),
    noticeId: String(row.noticeId ?? ''), eventType: row.eventType as AnalyticsEventType,
    ...(row.eventType === 'COPILOT_USED' && Number.isInteger(row.conversationTurnCount) ? { conversationTurnCount: Number(row.conversationTurnCount) } : {}),
    ...(row.eventType === 'SESSION_COMPLETED' && ['under_1m', '1_to_3m', '3_to_10m', 'over_10m'].includes(String(row.durationBucket))
      ? { durationBucket: row.durationBucket as AnalyticsEvent['durationBucket'] } : {}) }, env);
  return recordAnalyticsEvent(event, env, fetcher);
}

/** Admin-authenticated server read; no client-side DB access and no unbounded scan. */
export async function loadAnalyticsSummary(query: AnalyticsQuery, env: Record<string, string | undefined>, fetcher: typeof fetch = fetch): Promise<AnalyticsSummary> {
  const target = resolveProductV3StagingTarget(env);
  const from = new Date(`${query.from}T00:00:00Z`);
  const to = new Date(`${query.to}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() + 1);
  if (query.previousPeriod) from.setTime(from.getTime() - (to.getTime() - from.getTime()));
  const events: AnalyticsEvent[] = [];
  for (let offset = 0; offset < 100_000; offset += 1000) {
    const url = new URL('/rest/v1/product_v3_analytics_events', target.url);
    url.searchParams.set('select', 'event_id,anonymous_session_id,notice_id,notice_version,event_type,occurred_at,environment,traffic_type,supply_type,assessment_status,unresolved_category,conversation_turn_count,duration_bucket,ai_mode,fallback_reason');
    url.searchParams.set('occurred_at', `gte.${from.toISOString()}`);
    url.searchParams.append('occurred_at', `lt.${to.toISOString()}`);
    url.searchParams.set('environment', `eq.${query.environment}`);
    url.searchParams.set('traffic_type', `eq.${query.trafficType}`);
    if (query.noticeId) url.searchParams.set('notice_id', `eq.${query.noticeId}`);
    url.searchParams.set('order', 'occurred_at.asc,event_id.asc');
    url.searchParams.set('limit', '1000'); url.searchParams.set('offset', String(offset));
    const response = await fetcher(url, { headers: { apikey: target.serviceRoleKey, authorization: `Bearer ${target.serviceRoleKey}` }, cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (response.status === 404) throw new Error('ANALYTICS_SCHEMA_NOT_READY');
    if (!response.ok) throw new Error('ANALYTICS_READ_FAILED');
    const page: unknown = await response.json();
    if (!Array.isArray(page)) throw new Error('ANALYTICS_RESPONSE_INVALID');
    for (const value of page) {
      const row = value as Record<string, unknown>;
      const parsed = parseAnalyticsEvent({ eventId: row.event_id, anonymousSessionId: row.anonymous_session_id, noticeId: row.notice_id,
        noticeVersion: row.notice_version, eventType: row.event_type, occurredAt: row.occurred_at,
        environment: row.environment, trafficType: row.traffic_type,
        ...(row.supply_type ? { supplyType: row.supply_type } : {}), ...(row.assessment_status ? { assessmentStatus: row.assessment_status } : {}),
        ...(row.unresolved_category ? { unresolvedCategory: row.unresolved_category } : {}),
        ...(row.conversation_turn_count !== null ? { conversationTurnCount: row.conversation_turn_count } : {}),
        ...(row.duration_bucket ? { durationBucket: row.duration_bucket } : {}), ...(row.ai_mode ? { aiMode: row.ai_mode } : {}),
        ...(row.fallback_reason ? { fallbackReason: row.fallback_reason } : {}) });
      if (parsed) events.push(parsed);
    }
    if (page.length < 1000) return getAnalyticsSummary(events, query);
  }
  throw new Error('ANALYTICS_PAGE_LIMIT');
}
