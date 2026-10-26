import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeKoreanMobile, parseContactRegistration, maskKoreanMobile } from './contract.ts';
import { canTransitionDelivery, unconfiguredSmsSender } from './delivery.ts';
import { registerConsultationContact, loadAdminConsultationContacts } from './server.ts';
import adminHandler from '../../../api/admin-api/consultation-contacts.ts';

const token = 'a'.repeat(64);
const claim = 'b'.repeat(64);
const env = { WANPANE_ENV: 'staging', VERCEL_ENV: 'preview', SUPABASE_STAGING_PROJECT_REF: 'krkeiytshxpqojrlrmsx',
  SUPABASE_PRODUCTION_PROJECT_REF: 'abcdefghijklmnopqrst', SUPABASE_STAGING_URL: 'https://krkeiytshxpqojrlrmsx.supabase.co',
  SUPABASE_STAGING_ANON_KEY: 'test-anon', SUPABASE_STAGING_SERVICE_ROLE_KEY: 'test-service' };
const session = async () => ({ status: 'ok' as const, summary: { v: 3 as const, event: 'event', date: '2026-10-26', title: 'Samdo',
  focus: { eligibility: 'CONDITIONAL' as const, kind: 'REVIEW' as const, supply: '청년', stage: '검토', officialScore: { status: 'NOT_APPLICABLE' as const, label: '해당 없음' },
    reasons: [], checks: [], applicationDate: '2026-11-16' }, cautions: [] },
  expiresAt: '2026-10-27T00:00:00.000Z', analyticsSessionId: '26d97871-03b6-4074-8010-6a3fcb2fa44a', createdAt: '2026-10-26T09:00:00.000Z',
  contactClaimHash: createHash('sha256').update(claim).digest('hex') });

test('phone normalization, consent and private payload rejection', () => {
  assert.equal(normalizeKoreanMobile('010-1234-5678'), '+821012345678');
  assert.equal(normalizeKoreanMobile('+821012345678'), '+821012345678');
  assert.equal(normalizeKoreanMobile('02-1234-5678'), null);
  assert.equal(maskKoreanMobile('+821012345678'), '010-****-5678');
  assert.equal(parseContactRegistration({ token, claim, name: '홍길동', phone: '01012345678', consent: false }), null);
  assert.equal(parseContactRegistration({ token, claim, name: '홍길동', phone: '01012345678', consent: true, income: 999 }), null);
});

test('valid consent writes only separately to staging RPC; duplicate retry remains one record', async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  let created = true;
  const fetcher = (async (url: URL | string, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    const row = { contact_id: '829c8bfe-b396-4ac8-9f04-4bd8974203f4', delivery_id: '36d97871-03b6-4074-8010-6a3fcb2fa44a',
      delivery_status: 'PROVIDER_UNCONFIGURED', retention_until: '2026-11-02T10:00:00.000Z', created };
    created = false;
    return new Response(JSON.stringify([row]), { status: 200 });
  }) as typeof fetch;
  const payload = { token, claim, name: '홍길동', phone: '010-1234-5678', consent: true };
  const first = await registerConsultationContact(payload, env, fetcher, session, new Date('2026-10-26T10:00:00Z'));
  const retry = await registerConsultationContact(payload, env, fetcher, session, new Date('2026-10-26T10:00:01Z'));
  assert.equal(first.status, 201); assert.equal(retry.status, 200);
  assert.equal(first.body.smsSent, false);
  assert.equal(first.body.phoneMasked, '010-****-5678');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.p_result_session_hash, createHash('sha256').update(token).digest('hex'));
  assert.equal(calls[0].body.p_analytics_session_id, '26d97871-03b6-4074-8010-6a3fcb2fa44a');
  assert.equal(calls[0].body.p_result_status, 'CONDITIONAL');
  assert.ok(!JSON.stringify(calls[0].body).includes(token));
  assert.ok(!calls[0].url.includes(token));
  assert.ok(!calls[0].url.includes('product_v3_analytics_events'));
});

test('no consent, invalid phone, expired result and production deployment never write', async () => {
  let writes = 0;
  const fetcher = (async () => { writes += 1; return new Response('[]'); }) as typeof fetch;
  const base = { token, claim, name: '홍길동', phone: '01012345678', consent: true };
  assert.equal((await registerConsultationContact({ ...base, consent: false }, env, fetcher, session)).status, 400);
  assert.equal((await registerConsultationContact({ ...base, phone: '1234' }, env, fetcher, session)).status, 400);
  assert.equal((await registerConsultationContact(base, env, fetcher, async () => ({ status: 'expired' }))).status, 410);
  assert.equal((await registerConsultationContact({ ...base, claim: 'c'.repeat(64) }, env, fetcher, session)).status, 403);
  await assert.rejects(registerConsultationContact(base, { ...env, VERCEL_ENV: 'production' }, fetcher, session), /STAGING_ONLY/);
  assert.equal(writes, 0);
});

test('admin rows mask phone and SMS absent is not a false success', async () => {
  const fetcher = (async (_url: URL | string, init?: RequestInit) => {
    if (init?.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': '0-0/1' } });
    return new Response(JSON.stringify([{ id: 'id', name: '홍길동', phone_e164: '+821012345678', notice_id: 'samdo-1',
      result_status: 'CONDITIONAL', result_created_at: '2026-10-26T09:00:00Z', created_at: '2026-10-26T10:00:00Z',
      expires_at: '2026-11-02T10:00:00Z', consultation_result_deliveries: [{ delivery_status: 'PROVIDER_UNCONFIGURED', requested_at: '2026-10-26T10:00:00Z' }] }]), { status: 200 });
  }) as typeof fetch;
  const page = await loadAdminConsultationContacts(env, fetcher);
  assert.equal(page.rows[0].phoneMasked, '010-****-5678');
  assert.equal(JSON.stringify(page).includes('12345678'), false);
  assert.equal((await unconfiguredSmsSender.sendConsultationResult({ channel: 'SMS', recipient: '+821012345678', resultUrl: 'https://example.com/event/take?token=' + token, summary: '결과' })).status, 'PROVIDER_UNCONFIGURED');
});

test('delivery transition contract cannot fabricate a sent message', () => {
  assert.equal(canTransitionDelivery('REQUESTED', 'PROVIDER_UNCONFIGURED'), true);
  assert.equal(canTransitionDelivery('PROVIDER_UNCONFIGURED', 'SENT'), false);
  assert.equal(canTransitionDelivery('SENDING', 'SENT'), true);
  assert.equal(canTransitionDelivery('SENT', 'SENDING'), false);
  assert.equal(canTransitionDelivery('EXPIRED', 'SENT'), false);
});

test('anonymous analytics schema and contact schema remain separate', async () => {
  const analytics = await readFile(new URL('../../../supabase/migrations/20261022120000_product_v3_operational_analytics.sql', import.meta.url), 'utf8');
  const contact = await readFile(new URL('../../../supabase/migrations/20261026120000_event_consultation_contact_delivery.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(analytics, /name text|phone_e164|result_session_hash/i);
  assert.match(contact, /enable row level security/g);
  assert.match(contact, /revoke all on public\.consultation_contacts, public\.consultation_result_deliveries from public, anon, authenticated, service_role/);
});

test('admin endpoint returns 401 without a session and 403 for a reviewer', async () => {
  const replies: Array<{ status: number; body: unknown }> = [];
  const response = { setHeader() {}, status(status: number) { replies.push({ status, body: null }); return this; },
    json(body: unknown) { replies.at(-1)!.body = body; } };
  await adminHandler({ method: 'GET', headers: {} }, response);
  assert.equal(replies.at(-1)?.status, 401);
  const oldFetch = globalThis.fetch;
  const saved = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  globalThis.fetch = (async () => new Response(JSON.stringify({ role: 'reviewer' }), { status: 200 })) as typeof fetch;
  try {
    await adminHandler({ method: 'GET', headers: { authorization: 'Bearer test-token' } }, response);
    assert.equal(replies.at(-1)?.status, 403);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test('approved staging admin gets masked contact rows without raw answers', async () => {
  const saved = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  Object.assign(process.env, env);
  globalThis.fetch = (async (url: URL | string, init?: RequestInit) => {
    if (String(url).includes('get_assessment_review_access')) return new Response(JSON.stringify({ role: 'admin' }), { status: 200 });
    if (init?.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': '0-0/1' } });
    return new Response(JSON.stringify([{ id: 'id', name: 'QA', phone_e164: '+821012345678', notice_id: 'samdo-1',
      result_status: 'CONDITIONAL', result_created_at: '2026-10-26T09:00:00Z', created_at: '2026-10-26T10:00:00Z',
      expires_at: '2026-11-02T10:00:00Z', consultation_result_deliveries: [{ delivery_status: 'PROVIDER_UNCONFIGURED', requested_at: '2026-10-26T10:00:00Z' }] }]), { status: 200 });
  }) as typeof fetch;
  let status = 0; let body: unknown;
  const response = { setHeader() {}, status(value: number) { status = value; return this; }, json(value: unknown) { body = value; } };
  try {
    await adminHandler({ method: 'GET', headers: { authorization: 'Bearer test-token' } }, response);
    assert.equal(status, 200);
    assert.equal((body as { rows: Array<{ phoneMasked: string }> }).rows[0].phoneMasked, '010-****-5678');
    assert.equal(JSON.stringify(body).includes('+821012345678'), false);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
