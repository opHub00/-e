import assert from 'node:assert/strict';
import test from 'node:test';
import { publicOpsEnabled, publicOpsProjection } from './server.ts';

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
  const body = JSON.stringify(snapshot);
  assert.ok(!body.includes('QA PRIVATE') && !body.includes('+821012345678') && !body.includes('secret'));
});
