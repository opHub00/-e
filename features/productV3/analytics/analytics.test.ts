import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { analyticsGateFromEnv, getAnalyticsSummary, parseAnalyticsEvent, parseAnalyticsQuery, shouldCollect } from './core.ts';
import { recordAnalyticsBatch, recordAnalyticsEvent, recordBrowserAnalytics, serverEvent, stableAnalyticsEventId } from './server.ts';
import { handleProductV3ConsoleRequest } from '../../adminConsole/server/consoleApi.ts';
import type { AnalyticsEvent } from './contract.ts';

const staging = { WANPANE_ENV: 'staging', VERCEL_ENV: 'preview', SUPABASE_STAGING_PROJECT_REF: 'aaaaaaaaaaaaaaaaaaaa',
  SUPABASE_PRODUCTION_PROJECT_REF: 'bbbbbbbbbbbbbbbbbbbb', SUPABASE_STAGING_URL: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
  SUPABASE_STAGING_ANON_KEY: 'test-anon', SUPABASE_STAGING_SERVICE_ROLE_KEY: 'test-service',
  EVENT_ANALYTICS_ENABLED: 'true', EVENT_ANALYTICS_ALLOWED_TRAFFIC_TYPES: 'qa', EVENT_ANALYTICS_TRAFFIC_TYPE: 'qa' };
const session = '829c8bfe-b396-4ac8-9f04-4bd8974203f4';
const id = '26d97871-03b6-4074-8010-6a3fcb2fa44a';
const event = (type: AnalyticsEvent['eventType'], overrides: Partial<AnalyticsEvent> = {}): AnalyticsEvent => ({
  eventId: id, anonymousSessionId: session, noticeId: 'samdo-1', noticeVersion: 'VER1.8', eventType: type,
  occurredAt: '2026-10-28T03:00:00.000Z', environment: 'staging', trafficType: 'qa', ...overrides,
});

test('strict projection persists no raw profile, conversation, exact values or QR token', () => {
  const parsed = parseAnalyticsEvent({ ...event('RESULT_VIEWED'), profile: { name: 'private' },
    question: 'exact conversation', monthlyIncome: 7_650_000, assets: 500_000_000, qrToken: 'private-token', factValue: 'private' });
  assert.ok(parsed);
  const serialized = JSON.stringify(parsed);
  for (const forbidden of ['profile', 'name', 'question', 'monthlyIncome', 'assets', 'qrToken', 'factValue', 'private']) assert.ok(!serialized.includes(forbidden));
  assert.equal(parseAnalyticsEvent({ ...event('FACT_MARKED_UNKNOWN'), unresolvedCategory: 'score.applicantDisabled' }), null);
  assert.equal(parseAnalyticsEvent({ ...event('SESSION_STARTED'), anonymousSessionId: 'phone-number' }), null);
  assert.equal(parseAnalyticsEvent({ ...event('SESSION_STARTED'), supplyType: 'raw birth date' }), null);
});

test('gate separates QA, Staging, pre-announcement, wrong source version and real collection', () => {
  const gate = analyticsGateFromEnv({ EVENT_ANALYTICS_ENABLED: 'true', EVENT_ANALYTICS_ALLOWED_TRAFFIC_TYPES: 'qa,real' });
  assert.equal(shouldCollect(event('SESSION_STARTED'), gate, false), true);
  assert.equal(shouldCollect(event('SESSION_STARTED', { trafficType: 'real' }), gate, true), false);
  assert.equal(shouldCollect(event('SESSION_STARTED', { trafficType: 'real', environment: 'production', occurredAt: '2026-10-26T00:00:00Z' }), gate, true), false);
  assert.equal(shouldCollect(event('SESSION_STARTED', { trafficType: 'real', environment: 'production', noticeVersion: 'VER1.7' }), gate, true), false);
  assert.equal(shouldCollect(event('SESSION_STARTED', { trafficType: 'real', environment: 'production' }), gate, false), false);
  assert.equal(shouldCollect(event('SESSION_STARTED', { trafficType: 'real', environment: 'production' }), gate, true), true);
  assert.equal(shouldCollect(event('SESSION_STARTED'), { ...gate, analyticsEnabled: false }, true), false);
  assert.equal(gate.retentionDays, null);
  assert.equal(analyticsGateFromEnv({ EVENT_ANALYTICS_RETENTION_DAYS: '90' }).retentionDays, 90);
});

test('session metrics count sessions, not people; duplicate event IDs and completed supply cells do not inflate completion', () => {
  const rows = [event('SESSION_STARTED'), event('SESSION_STARTED'), event('ASSESSMENT_STARTED', { eventId: stableAnalyticsEventId(id, 'start') }),
    event('ASSESSMENT_COMPLETED', { eventId: stableAnalyticsEventId(id, 'complete1'), supplyType: 'YOUTH', assessmentStatus: 'COMPLETE' }),
    event('ASSESSMENT_COMPLETED', { eventId: stableAnalyticsEventId(id, 'complete2'), supplyType: 'GENERAL', assessmentStatus: 'NEEDS_USER_INPUT' }),
    event('FACT_MARKED_UNKNOWN', { eventId: stableAnalyticsEventId(id, 'unknown'), unresolvedCategory: 'income' }),
    event('COPILOT_USED', { eventId: stableAnalyticsEventId(id, 'copilot'), aiMode: 'fallback', fallbackReason: 'missing_key', conversationTurnCount: 3 }),
    event('RESULT_VIEWED', { eventId: stableAnalyticsEventId(id, 'result') }),
    event('QR_CREATED', { eventId: stableAnalyticsEventId(id, 'qr') }),
  ];
  const query = parseAnalyticsQuery({ from: '2026-10-28', to: '2026-10-28', environment: 'staging', trafficType: 'qa', previousPeriod: 'true' });
  assert.ok(query);
  const summary = getAnalyticsSummary(rows, query);
  assert.equal(summary.sessionsStarted, 1);
  assert.equal(summary.assessmentsStarted, 1);
  assert.equal(summary.assessmentsCompleted, 1);
  assert.equal(summary.completionRate, 1);
  assert.deepEqual(summary.assessmentStatusDistribution, { COMPLETE: 1, NEEDS_USER_INPUT: 1, INELIGIBLE: 0, UNAVAILABLE: 0 });
  assert.equal(summary.unresolvedCategoryDistribution.income, 1);
  assert.equal(summary.qrCreates, 1);
  assert.equal(summary.averageTurns, 3);
  assert.equal(getAnalyticsSummary(rows, { ...query, environment: 'production' }).sessionsStarted, 0);
  assert.equal(getAnalyticsSummary(rows, { ...query, trafficType: 'real' }).sessionsStarted, 0);
});

test('server projects safe event and idempotent insert; outage never breaks caller', async () => {
  let written: unknown;
  const fetcher = (async (_url: URL, init?: RequestInit) => {
    assert.match(String(init?.headers && (init.headers as Record<string, string>).Prefer), /ignore-duplicates/);
    written = JSON.parse(String(init?.body));
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  const actual = serverEvent({ eventId: id, anonymousSessionId: session, noticeId: 'samdo-1', eventType: 'RESULT_VIEWED' }, staging, new Date('2026-10-28T03:00:00Z'));
  assert.ok(actual);
  assert.equal(actual.trafficType, 'qa');
  assert.equal(actual.environment, 'staging');
  assert.equal(await recordAnalyticsEvent(actual, staging, fetcher), true);
  assert.equal(JSON.stringify(written).includes('profile'), false);
  assert.equal((written as Array<Record<string, unknown>>)[0].notice_version, 'VER1.8');
  assert.equal(await recordAnalyticsBatch([actual], staging, (async () => { throw new Error('offline'); }) as typeof fetch), false);
  assert.equal(await recordAnalyticsEvent(actual, { ...staging, EVENT_ANALYTICS_ENABLED: 'false' }, fetcher), false);
  assert.equal(await recordAnalyticsEvent(actual, { ...staging, VERCEL_ENV: 'production' }, fetcher), false);
});

test('browser cannot dictate status, traffic, source version, unresolved key or environment', async () => {
  let written: any;
  const fetcher = (async (_url: URL, init?: RequestInit) => { written = JSON.parse(String(init?.body)); return new Response(null, { status: 201 }); }) as typeof fetch;
  assert.equal(await recordBrowserAnalytics({ eventId: id, anonymousSessionId: session, noticeId: 'samdo-1', eventType: 'RESULT_VIEWED',
    trafficType: 'real', environment: 'production', noticeVersion: 'VER9.9', assessmentStatus: 'COMPLETE', unresolvedCategory: 'score.applicantDisabled',
    profile: { income: 1 }, qrToken: 'secret' }, staging, fetcher), true);
  assert.equal(written[0].traffic_type, 'qa');
  assert.equal(written[0].environment, 'staging');
  assert.equal(written[0].notice_version, 'VER1.8');
  assert.equal(written[0].assessment_status, null);
  assert.equal(written[0].unresolved_category, null);
  assert.equal(JSON.stringify(written).includes('secret'), false);
  assert.equal(await recordBrowserAnalytics({ eventId: id, anonymousSessionId: session, noticeId: 'samdo-1', eventType: 'ASSESSMENT_COMPLETED' }, staging, fetcher), false);
});

test('analytics summary is Admin-only and validates scoped windows before reading', async () => {
  const summary = getAnalyticsSummary([], { from: '2026-10-28', to: '2026-10-28', environment: 'staging', trafficType: 'qa' });
  const query = { analytics: 'summary', from: '2026-10-28', to: '2026-10-28', environment: 'staging', trafficType: 'qa' };
  const dependencies = { authorize: async () => 'admin' as const, loadSnapshot: async () => { throw new Error('unused'); }, loadAnalytics: async () => summary };
  assert.equal((await handleProductV3ConsoleRequest({ method: 'GET', headers: {}, query }, dependencies)).status, 401);
  assert.equal((await handleProductV3ConsoleRequest({ method: 'GET', headers: { authorization: 'Bearer token' }, query },
    { ...dependencies, authorize: async () => 'reviewer' as const })).status, 403);
  const admin = await handleProductV3ConsoleRequest({ method: 'GET', headers: { authorization: 'Bearer token' }, query }, dependencies);
  assert.equal(admin.status, 200);
  assert.equal((admin.body as typeof summary).sessionsStarted, 0);
  assert.equal((await handleProductV3ConsoleRequest({ method: 'GET', headers: { authorization: 'Bearer token' },
    query: { ...query, from: '2026-02-30' } }, dependencies)).status, 400);
});
