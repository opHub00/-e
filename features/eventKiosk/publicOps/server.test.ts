import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPublicOps, publicOpsEnabled, publicOpsProjection } from './server.ts';
import { SAMDO_DISTRICTS } from '../samdoDual/config.ts';

const env = { EVENT_DEMO_PUBLIC_READONLY: '1', WANPANE_ENV: 'staging', VERCEL_ENV: 'preview',
  SUPABASE_STAGING_PROJECT_REF: 'krkeiytshxpqojrlrmsx', SUPABASE_PRODUCTION_PROJECT_REF: 'ypdreeipoxcztbxtiklt',
  SUPABASE_STAGING_URL: 'https://krkeiytshxpqojrlrmsx.supabase.co',
  SUPABASE_STAGING_ANON_KEY: 'qa-anon', SUPABASE_STAGING_SERVICE_ROLE_KEY: 'qa-service' };

test('public event operations require an explicit staging Preview gate', () => {
  assert.equal(publicOpsEnabled(env), true);
  assert.equal(publicOpsEnabled({ ...env, EVENT_DEMO_PUBLIC_READONLY: '0' }), false);
  assert.equal(publicOpsEnabled({ ...env, VERCEL_ENV: 'production' }), false);
  assert.equal(publicOpsEnabled({ ...env, SUPABASE_STAGING_PROJECT_REF: env.SUPABASE_PRODUCTION_PROJECT_REF }), false);
});

test('public projection deduplicates sessions and exposes only masked contact fields', () => {
  const privateContact = { name: 'QA PRIVATE', phone_e164: '+821012345678', result_session_hash: 'secret', created_at: '2026-10-27T00:00:00Z',
    consultation_result_deliveries: [{ delivery_status: 'PROVIDER_UNCONFIGURED' }] };
  const snapshot = publicOpsProjection([
    { anonymous_session_id: 'qa-session', event_type: 'SESSION_STARTED' },
    { anonymous_session_id: 'qa-session', event_type: 'SESSION_STARTED' },
    { anonymous_session_id: 'qa-session', event_type: 'ASSESSMENT_COMPLETED' },
    { anonymous_session_id: 'qa-session', event_type: 'RESULT_VIEWED' },
  ], [privateContact],
  { registered: 1, requested: 1, unconfigured: 1 }, false);
  assert.deepEqual(snapshot.metrics, { consultationSessions: 1, completedSessions: 1, resultViewedSessions: 1,
    registeredContacts: 1, deliveryRequested: 1, deliveryUnconfigured: 1 });
  assert.equal(snapshot.contacts[0].phoneMasked, '010-****-5678');
  assert.deepEqual(snapshot.baseline.noticeIds, ['samdo-1', 'samdo-2']);
  assert.equal(snapshot.baseline.noticeVersion, 'VER1.8');
  assert.equal(snapshot.baseline.sourceStatus, 'STAGING_EVENT_FINAL_UNVERIFIED');
  const body = JSON.stringify(snapshot);
  assert.ok(!body.includes('QA PRIVATE') && !body.includes('+821012345678') && !body.includes('secret'));
});

test('event baseline remains the two hashed user-source final 1.8 notices, not an official publication claim', () => {
  assert.equal(SAMDO_DISTRICTS['samdo-1'].document.sha256, '5834b996f9d49ea7dc6e45fc36312b2fba1b4d5fa3b5d1bcd3a7d8e9189b90d2');
  assert.equal(SAMDO_DISTRICTS['samdo-2'].document.sha256, '336c345354c6ab9085683ede9e8fde52f4be73969c5058c0a62602257289ab71');
  assert.ok(Object.values(SAMDO_DISTRICTS).every(notice => notice.document.fileName.includes('최종1.8') && notice.document.isOfficial === false));
});

test('public operations read only the current dual-district Staging QA baseline', async () => {
  const calls: URL[] = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url);
    if (init?.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': '0-0/0' } });
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const result = await loadPublicOps(env, fetcher as typeof fetch, new Date('2026-10-27T12:00:00+09:00'));
  assert.equal(result.metrics.consultationSessions, 0);
  const analytics = calls.find(url => url.pathname.endsWith('/product_v3_analytics_events'))!;
  assert.equal(analytics.searchParams.get('notice_id'), 'in.(samdo-1,samdo-2)');
  assert.equal(analytics.searchParams.get('notice_version'), 'eq.VER1.8');
  assert.equal(analytics.searchParams.get('traffic_type'), 'eq.qa');
  assert.equal(analytics.searchParams.get('environment'), 'eq.staging');
  assert.equal(analytics.searchParams.get('occurred_at'), 'gte.2026-10-26T15:00:00.000Z');
  for (const url of calls.filter(item => /consultation_(contacts|result_deliveries)$/.test(item.pathname)))
    assert.equal(url.searchParams.get('notice_id'), 'eq.samdo-1');
});
