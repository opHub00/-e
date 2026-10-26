import { createHash, timingSafeEqual } from 'node:crypto';
import { resolveProductV3StagingTarget } from '../../productV3/admin/stagingTarget.ts';
import { PersistentResultSessionService } from '../server/persistentResultSession.ts';
import { createResultSessionRepository } from '../server/resultSessionRepository.ts';
import { EVENT_CONTACT_CONSENT_VERSION, EVENT_CONTACT_PROVISIONAL_RETENTION_DAYS, maskKoreanMobile, normalizeKoreanMobile, parseContactRegistration } from './contract.ts';

type Registered = { contact_id: string; delivery_id: string; delivery_status: string; created: boolean; retention_until: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function registerConsultationContact(
  value: unknown, env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
  readSession: (token: string) => ReturnType<PersistentResultSessionService['read']> = token =>
    new PersistentResultSessionService(createResultSessionRepository(env, fetcher)).read(token),
  now = new Date(),
): Promise<{ status: number; body: Record<string, unknown> }> {
  const input = parseContactRegistration(value);
  if (!input) return { status: 400, body: { error: 'INVALID_CONTACT_OR_CONSENT' } };
  // Resolve the staging identity before accessing either storage or PostgREST.
  const target = resolveProductV3StagingTarget(env);
  const result = await readSession(input.token);
  if (result.status !== 'ok') return { status: result.status === 'expired' ? 410 : 404, body: { error: 'RESULT_SESSION_NOT_AVAILABLE' } };
  const claimHash = createHash('sha256').update(input.claim).digest('hex');
  if (!result.contactClaimHash || !/^[a-f0-9]{64}$/.test(result.contactClaimHash)
    || !timingSafeEqual(Buffer.from(claimHash, 'hex'), Buffer.from(result.contactClaimHash, 'hex')))
    return { status: 403, body: { error: 'RESULT_SESSION_CLAIM_INVALID' } };
  if (result.summary.v !== 3 || !result.createdAt || !Number.isFinite(Date.parse(result.createdAt)))
    return { status: 422, body: { error: 'RESULT_SESSION_NOT_LINKABLE' } };
  const phone = normalizeKoreanMobile(input.phone);
  if (!phone) return { status: 400, body: { error: 'INVALID_PHONE' } };
  const hash = createHash('sha256').update(input.token).digest('hex');
  const consentedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + EVENT_CONTACT_PROVISIONAL_RETENTION_DAYS * 86_400_000).toISOString();
  const response = await fetcher(new URL('/rest/v1/rpc/register_consultation_contact', target.url), {
    method: 'POST',
    headers: { apikey: target.serviceRoleKey, authorization: `Bearer ${target.serviceRoleKey}`,
      'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ p_analytics_session_id: result.analyticsSessionId ?? null, p_result_session_hash: hash,
      p_notice_id: 'samdo-1', p_result_status: result.summary.focus?.eligibility ?? 'NOT_DETERMINED',
      p_result_created_at: result.createdAt, p_name: input.name, p_phone_e164: phone,
      p_consent_version: EVENT_CONTACT_CONSENT_VERSION, p_consented_at: consentedAt, p_expires_at: expiresAt }),
    cache: 'no-store', signal: AbortSignal.timeout(6_000),
  });
  if (response.status === 409) return { status: 409, body: { error: 'CONTACT_ALREADY_REGISTERED' } };
  if (!response.ok) return { status: 503, body: { error: 'CONTACT_STORAGE_UNAVAILABLE' } };
  const rows = await response.json() as Registered[];
  const row = rows[0];
  if (!row || !uuid.test(row.contact_id) || !uuid.test(row.delivery_id) || row.delivery_status !== 'PROVIDER_UNCONFIGURED' && row.delivery_status !== 'SENT')
    return { status: 503, body: { error: 'CONTACT_STORAGE_UNAVAILABLE' } };
  return { status: row.created ? 201 : 200,
    body: { contactId: row.contact_id, phoneMasked: maskKoreanMobile(phone), deliveryStatus: row.delivery_status,
      retentionUntil: row.retention_until, smsSent: row.delivery_status === 'SENT' } };
}

export type AdminContactRow = { id: string; name: string; phone_e164: string; notice_id: string; result_status: string;
  result_created_at: string; created_at: string; expires_at: string; consultation_result_deliveries?: Array<{ delivery_status: string; requested_at: string }> };

/** Only the existing server-side admin authorization path may call this. */
export async function loadAdminConsultationContacts(env: Record<string, string | undefined>, fetcher: typeof fetch = fetch, cursor = 0, limit = 25) {
  const target = resolveProductV3StagingTarget(env);
  const url = new URL('/rest/v1/consultation_contacts', target.url);
  url.searchParams.set('select', 'id,name,phone_e164,notice_id,result_status,result_created_at,created_at,expires_at,consultation_result_deliveries(delivery_status,requested_at)');
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('offset', String(cursor));
  url.searchParams.set('limit', String(Math.min(50, Math.max(1, limit))));
  const response = await fetcher(url, { headers: { apikey: target.serviceRoleKey, authorization: `Bearer ${target.serviceRoleKey}` }, cache: 'no-store', signal: AbortSignal.timeout(6_000) });
  if (!response.ok) throw new Error('CONTACT_READ_UNAVAILABLE');
  const rows = await response.json() as AdminContactRow[];
  const count = async (table: string, status?: string) => {
    const countUrl = new URL(`/rest/v1/${table}`, target.url);
    countUrl.searchParams.set('select', 'id');
    if (status) countUrl.searchParams.set('delivery_status', `eq.${status}`);
    const result = await fetcher(countUrl, { method: 'HEAD', headers: { apikey: target.serviceRoleKey,
      authorization: `Bearer ${target.serviceRoleKey}`, Prefer: 'count=exact' }, cache: 'no-store', signal: AbortSignal.timeout(6_000) });
    if (!result.ok) throw new Error('CONTACT_COUNT_UNAVAILABLE');
    const total = Number(result.headers.get('content-range')?.split('/')[1]);
    if (!Number.isSafeInteger(total) || total < 0) throw new Error('CONTACT_COUNT_UNAVAILABLE');
    return total;
  };
  const [registered, requested, sent, failed, unconfigured] = await Promise.all([
    count('consultation_contacts'), count('consultation_result_deliveries'),
    count('consultation_result_deliveries', 'SENT'), count('consultation_result_deliveries', 'FAILED'),
    count('consultation_result_deliveries', 'PROVIDER_UNCONFIGURED'),
  ]);
  return { metrics: { registered, requested, sent, failed, unconfigured },
    rows: rows.map(row => ({ id: row.id, name: row.name, phoneMasked: maskKoreanMobile(row.phone_e164),
    consultationAt: row.result_created_at, noticeId: row.notice_id, resultStatus: row.result_status,
    deliveryStatus: row.consultation_result_deliveries?.[0]?.delivery_status ?? 'UNKNOWN', expiresAt: row.expires_at })),
    nextCursor: rows.length === limit ? cursor + rows.length : null };
}
