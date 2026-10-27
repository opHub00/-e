import { resolveProductV3StagingTarget } from '../../productV3/admin/stagingTarget.ts';
import { maskKoreanMobile } from '../contact/contract.ts';
import { SAMDO_DISTRICTS } from '../samdoDual/config.ts';

const STAGING_REF = 'krkeiytshxpqojrlrmsx';
const PRODUCTION_REF = 'ypdreeipoxcztbxtiklt';
const MAX_EVENTS = 5_000;
const allowedEvents = new Set(['SESSION_STARTED', 'ASSESSMENT_COMPLETED', 'RESULT_VIEWED']);
const allowedDelivery = new Set(['REQUESTED', 'PROVIDER_UNCONFIGURED', 'SENDING', 'SENT', 'FAILED', 'EXPIRED']);
const eventNotices = Object.values(SAMDO_DISTRICTS);
const eventVersion = 'VER1.8';
const eventStart = '2026-10-27T00:00:00+09:00';
const eventBaseline = {
  noticeIds: eventNotices.map(notice => notice.id), noticeVersion: eventVersion,
  noticeTitles: eventNotices.map(notice => notice.title),
  sourceStatus: 'STAGING_EVENT_FINAL_UNVERIFIED' as const,
};

export function publicOpsEnabled(env: Record<string, string | undefined>) {
  if (env.EVENT_DEMO_PUBLIC_READONLY !== '1' || env.VERCEL_ENV !== 'preview'
    || env.SUPABASE_STAGING_PROJECT_REF !== STAGING_REF
    || env.SUPABASE_PRODUCTION_PROJECT_REF !== PRODUCTION_REF) return false;
  try { resolveProductV3StagingTarget(env); return true; } catch { return false; }
}

type EventRow = { anonymous_session_id?: unknown; event_type?: unknown };
type ContactRow = { phone_e164?: unknown; created_at?: unknown; consultation_result_deliveries?: unknown };

export function publicOpsProjection(events: EventRow[], contacts: ContactRow[], counts: { registered: number; requested: number; unconfigured: number }, totalEventsCapped: boolean) {
  const sessions = { started: new Set<string>(), completed: new Set<string>(), viewed: new Set<string>() };
  for (const row of events) {
    if (typeof row.anonymous_session_id !== 'string' || !allowedEvents.has(String(row.event_type))) continue;
    if (row.event_type === 'SESSION_STARTED') sessions.started.add(row.anonymous_session_id);
    if (row.event_type === 'ASSESSMENT_COMPLETED') sessions.completed.add(row.anonymous_session_id);
    if (row.event_type === 'RESULT_VIEWED') sessions.viewed.add(row.anonymous_session_id);
  }
  const rows = contacts.slice(0, 10).flatMap(row => {
    if (typeof row.phone_e164 !== 'string') return [];
    const phoneMasked = maskKoreanMobile(row.phone_e164);
    if (!/^010-\*\*\*\*-\d{4}$/.test(phoneMasked)) return [];
    const delivery = Array.isArray(row.consultation_result_deliveries) ? row.consultation_result_deliveries[0] : null;
    const status = delivery && typeof delivery === 'object' && allowedDelivery.has(String(delivery.delivery_status))
      ? String(delivery.delivery_status) : 'UNKNOWN';
    return [{ phoneMasked, deliveryStatus: status, registeredAt: typeof row.created_at === 'string' ? row.created_at : null }];
  });
  return { period: 'LAST_24_HOURS', approximate: totalEventsCapped,
    baseline: eventBaseline,
    metrics: { consultationSessions: sessions.started.size, completedSessions: sessions.completed.size,
      resultViewedSessions: sessions.viewed.size, registeredContacts: counts.registered,
      deliveryRequested: counts.requested, deliveryUnconfigured: counts.unconfigured },
    contacts: rows };
}

async function readJson(response: Response): Promise<unknown[]> {
  if (!response.ok) throw new Error('PUBLIC_OPS_STORE_UNAVAILABLE');
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error('PUBLIC_OPS_STORE_UNAVAILABLE');
  return body;
}

export async function loadPublicOps(env: Record<string, string | undefined>, fetcher: typeof fetch = fetch, now = new Date()) {
  if (!publicOpsEnabled(env)) throw new Error('PUBLIC_OPS_DISABLED');
  const target = resolveProductV3StagingTarget(env);
  const headers = { apikey: target.serviceRoleKey, authorization: `Bearer ${target.serviceRoleKey}` };
  const since = new Date(Math.max(now.getTime() - 86_400_000, Date.parse(eventStart))).toISOString();
  const eventRows: EventRow[] = [];
  for (let offset = 0; offset < MAX_EVENTS; offset += 1_000) {
    const url = new URL('/rest/v1/product_v3_analytics_events', target.url);
    url.searchParams.set('select', 'anonymous_session_id,event_type');
    url.searchParams.set('environment', 'eq.staging');
    url.searchParams.set('traffic_type', 'eq.qa');
    url.searchParams.set('notice_id', `in.(${eventBaseline.noticeIds.join(',')})`);
    url.searchParams.set('notice_version', `eq.${eventVersion}`);
    url.searchParams.set('occurred_at', `gte.${since}`);
    url.searchParams.set('event_type', 'in.(SESSION_STARTED,ASSESSMENT_COMPLETED,RESULT_VIEWED)');
    url.searchParams.set('order', 'occurred_at.desc');
    url.searchParams.set('limit', '1000');
    url.searchParams.set('offset', String(offset));
    const page = await readJson(await fetcher(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(6_000) })) as EventRow[];
    eventRows.push(...page);
    if (page.length < 1_000) break;
  }
  const contactUrl = new URL('/rest/v1/consultation_contacts', target.url);
  contactUrl.searchParams.set('select', 'phone_e164,created_at,consultation_result_deliveries(delivery_status)');
  contactUrl.searchParams.set('created_at', `gte.${since}`);
  contactUrl.searchParams.set('notice_id', 'eq.samdo-1');
  contactUrl.searchParams.set('order', 'created_at.desc');
  contactUrl.searchParams.set('limit', '10');
  const count = async (table: string, status?: string) => {
    const url = new URL(`/rest/v1/${table}`, target.url);
    url.searchParams.set('select', 'id');
    url.searchParams.set(table === 'consultation_contacts' ? 'created_at' : 'requested_at', `gte.${since}`);
    url.searchParams.set('notice_id', 'eq.samdo-1');
    if (status) url.searchParams.set('delivery_status', `eq.${status}`);
    const response = await fetcher(url, { method: 'HEAD', headers: { ...headers, Prefer: 'count=exact' }, cache: 'no-store', signal: AbortSignal.timeout(6_000) });
    if (!response.ok) throw new Error('PUBLIC_OPS_STORE_UNAVAILABLE');
    const total = Number(response.headers.get('content-range')?.split('/')[1]);
    if (!Number.isSafeInteger(total) || total < 0) throw new Error('PUBLIC_OPS_STORE_UNAVAILABLE');
    return total;
  };
  const [contacts, registered, requested, unconfigured] = await Promise.all([
    fetcher(contactUrl, { headers, cache: 'no-store', signal: AbortSignal.timeout(6_000) }).then(readJson),
    count('consultation_contacts'), count('consultation_result_deliveries'),
    count('consultation_result_deliveries', 'PROVIDER_UNCONFIGURED'),
  ]);
  return publicOpsProjection(eventRows, contacts as ContactRow[], { registered, requested, unconfigured }, eventRows.length >= MAX_EVENTS);
}
