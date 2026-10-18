import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SAMDO_PERSONAS } from '../../eventKiosk/samdo/personas.test-data.ts';
import { noticePlatform } from '../../eventKiosk/noticePlatform/index.ts';
import { assessmentEvents, evaluateAndRecordAssessment, parseAssessmentRequest } from './assessmentEvents.ts';

const staging = {
  WANPANE_ENV: 'staging', VERCEL_ENV: 'preview', SUPABASE_STAGING_PROJECT_REF: 'aaaaaaaaaaaaaaaaaaaa',
  SUPABASE_PRODUCTION_PROJECT_REF: 'bbbbbbbbbbbbbbbbbbbb', SUPABASE_STAGING_URL: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
  SUPABASE_STAGING_ANON_KEY: 'test-anon', SUPABASE_STAGING_SERVICE_ROLE_KEY: 'test-service',
};
const id = '829c8bfe-b396-4ac8-9f04-4bd8974203f4';
const source = SAMDO_PERSONAS[0].input;
const input = { ...source, profile: { ...source.profile, basic: { ...source.profile.basic, name: '' } } };

test('server independently re-evaluates both notices and stores only aggregate-safe supply events', async () => {
  let payload: unknown = null;
  const fetcher = (async (url: URL, init?: RequestInit) => {
    assert.equal(url.host, 'aaaaaaaaaaaaaaaaaaaa.supabase.co');
    payload = JSON.parse(String(init?.body));
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  const result = await evaluateAndRecordAssessment({ requestId: id, input, fakeStatus: 'COMPLETE' }, staging, fetcher);
  assert.deepEqual(result, { status: 200, body: { result: 'ASSESSMENT_COMPLETED', recorded: true } });
  const rows = payload as Array<Record<string, unknown>>;
  assert.equal(rows.length, 10);
  assert.deepEqual([...new Set(rows.map(row => row.notice_id))], ['samdo-1', 'samdo-2']);
  assert.deepEqual(rows.map(row => row.status), assessmentEvents(id, noticePlatform.assessNotices(input, ['samdo-1', 'samdo-2'])).map(row => row.status));
  assert.ok(rows.every(row => typeof row.evidence_complete === 'boolean' && typeof row.rule_package_version === 'string'));
  const text = JSON.stringify(rows);
  for (const forbidden of ['profile', 'birthDate', 'monthlyIncome', 'parentAssets', 'fakeStatus', 'qrToken']) assert.ok(!text.includes(forbidden));
});

test('invalid/private profile and production identity fail closed; telemetry outage does not affect assessment', async () => {
  assert.equal(parseAssessmentRequest({ requestId: id, input: { ...input, profile: { ...input.profile, basic: { ...input.profile.basic, name: 'private' } } } }), null);
  assert.deepEqual(await evaluateAndRecordAssessment({ requestId: 'bad', input }, staging), { status: 400, body: { result: 'INVALID_ASSESSMENT_REQUEST' } });
  await assert.rejects(evaluateAndRecordAssessment({ requestId: id, input }, { ...staging, VERCEL_ENV: 'production' }), /PRODUCT_V3_STAGING_ONLY/);
  const failed = (async () => new Response(null, { status: 503 })) as typeof fetch;
  assert.deepEqual(await evaluateAndRecordAssessment({ requestId: id, input }, staging, failed), { status: 200, body: { result: 'ASSESSMENT_COMPLETED', recorded: false } });
});
