import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { analyticsCollectionStatus, analyticsGateFromEnv, analyticsRetentionPlan, analyticsWindow, getAnalyticsSummary, globalAnalyticsCollectionStatus, parseAnalyticsEvent, parseAnalyticsQuery, shouldCollect } from './core.ts';
import { allowBrowserAnalyticsAttempt, loadAnalyticsGlobalStatus, loadAnalyticsSummary, planStagingAnalyticsCleanup, recordAnalyticsBatch, recordAnalyticsEvent, recordBrowserAnalytics, serverEvent, stableAnalyticsEventId } from './server.ts';
import { handleProductV3ConsoleRequest } from '../../adminConsole/server/consoleApi.ts';
import type { AnalyticsEvent } from './contract.ts';

const staging = { WANPANE_ENV: 'staging', VERCEL_ENV: 'preview', SUPABASE_STAGING_PROJECT_REF: 'aaaaaaaaaaaaaaaaaaaa',
  SUPABASE_PRODUCTION_PROJECT_REF: 'bbbbbbbbbbbbbbbbbbbb', SUPABASE_STAGING_URL: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
  SUPABASE_STAGING_ANON_KEY: 'test-anon', SUPABASE_STAGING_SERVICE_ROLE_KEY: 'test-service',
  EVENT_ANALYTICS_ENABLED: 'true', EVENT_ANALYTICS_ALLOWED_TRAFFIC_TYPES: 'qa', EVENT_ANALYTICS_TRAFFIC_TYPE: 'qa' };
const session = '829c8bfe-b396-4ac8-9f04-4bd8974203f4';
const id = '26d97871-03b6-4074-8010-6a3fcb2fa44a';
const afterFixture = new Date('2026-10-29T00:00:00Z');
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
  const summary = getAnalyticsSummary(rows, query, afterFixture);
  assert.equal(summary.sessionsStarted, 1);
  assert.equal(summary.assessmentsStarted, 1);
  assert.equal(summary.assessmentsCompleted, 1);
  assert.equal(summary.completionRate, 1);
  assert.deepEqual(summary.assessmentStatusDistribution, { COMPLETE: 1, NEEDS_USER_INPUT: 1, INELIGIBLE: 0, UNAVAILABLE: 0 });
  assert.equal(summary.unresolvedCategoryDistribution.income, 1);
  assert.equal(summary.qrCreates, 1);
  assert.equal(summary.qrCreateSessions, 1);
  assert.equal(summary.resultViewSessions, 1);
  assert.equal(summary.lastEventAt, '2026-10-28T03:00:00.000Z');
  assert.equal(summary.generatedAt, afterFixture.toISOString());
  assert.deepEqual(summary.supplyTypeAssessmentDistribution.YOUTH, { COMPLETE: 1, NEEDS_USER_INPUT: 0, INELIGIBLE: 0, UNAVAILABLE: 0 });
  assert.equal(summary.averageTurns, 3);
  assert.equal(getAnalyticsSummary(rows, { ...query, environment: 'production' }, afterFixture).sessionsStarted, 0);
  assert.equal(getAnalyticsSummary(rows, { ...query, trafficType: 'real' }, afterFixture).sessionsStarted, 0);
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

test('KST midnight, duplicate action sessions, notice filter and prior period use the same boundaries', () => {
  const row = (type: AnalyticsEvent['eventType'], suffix: string, at: string, extra: Partial<AnalyticsEvent> = {}) =>
    event(type, { eventId: stableAnalyticsEventId(id, suffix), occurredAt: at, ...extra });
  const query = parseAnalyticsQuery({ from: '2026-10-28', to: '2026-10-28', environment: 'staging', trafficType: 'qa', previousPeriod: 'true' });
  assert.ok(query);
  assert.equal(new Date(analyticsWindow(query).from).toISOString(), '2026-10-27T15:00:00.000Z');
  const rows = [row('RESULT_VIEWED', 'before', '2026-10-27T14:59:59.999Z'),
    row('ASSESSMENT_STARTED', 'prior-start', '2026-10-27T14:59:59.999Z'),
    row('ASSESSMENT_COMPLETED', 'prior-needs', '2026-10-27T14:59:59.999Z', { supplyType: 'YOUTH', assessmentStatus: 'NEEDS_USER_INPUT' }),
    row('COPILOT_USED', 'prior-fallback', '2026-10-27T14:59:59.999Z', { aiMode: 'fallback' }),
    row('RESULT_VIEWED', 'a', '2026-10-27T15:00:00.000Z'), row('RESULT_VIEWED', 'b', '2026-10-28T02:00:00.000Z'),
    row('RESULT_SAVED', 'c', '2026-10-28T02:00:00.000Z'), row('QR_CREATED', 'd', '2026-10-28T02:00:00.000Z'),
    row('ASSESSMENT_COMPLETED', 'e', '2026-10-28T02:00:00.000Z', { supplyType: 'YOUTH', assessmentStatus: 'NEEDS_USER_INPUT' }),
    row('ASSESSMENT_COMPLETED', 'f', '2026-10-28T02:00:00.000Z', { supplyType: 'GENERAL', assessmentStatus: 'INELIGIBLE', noticeId: 'samdo-2' }),
    row('COPILOT_USED', 'g', '2026-10-28T02:00:00.000Z', { aiMode: 'fallback' })];
  const summary = getAnalyticsSummary(rows, query, afterFixture);
  assert.equal(summary.resultViews, 2);
  assert.equal(summary.resultViewSessions, 1);
  assert.equal(summary.resultSaveSessions, 1);
  assert.equal(summary.qrCreateSessions, 1);
  assert.equal(summary.previousPeriodComparison?.resultViewSessions, 1);
  assert.equal(summary.previousPeriodComparison?.assessmentsStarted, 1);
  assert.equal(summary.previousPeriodComparison?.needsUserInput, 1);
  assert.equal(summary.previousPeriodComparison?.fallback, 1);
  assert.equal(summary.supplyTypeAssessmentDistribution.GENERAL.INELIGIBLE, 1);
  assert.equal(summary.lastEventAt, '2026-10-28T02:00:00.000Z');
  const filtered = getAnalyticsSummary(rows, { ...query, noticeId: 'samdo-1' }, afterFixture);
  assert.equal(filtered.supplyTypeAssessmentDistribution.GENERAL, undefined);
  assert.equal(filtered.supplyTypeAssessmentDistribution.YOUTH.NEEDS_USER_INPUT, 1);
  assert.equal(getAnalyticsSummary([], query, afterFixture).lastEventAt, null);
});

test('collection state, retention plan and browser limits remain pre-launch or QA-only', () => {
  const gate = analyticsGateFromEnv({ EVENT_ANALYTICS_ENABLED: 'true', EVENT_ANALYTICS_ALLOWED_TRAFFIC_TYPES: 'real',
    EVENT_ANALYTICS_RETENTION_DAYS: '90', EVENT_ANALYTICS_SESSION_EVENT_CAP: '2', EVENT_ANALYTICS_RATE_LIMIT_PER_MINUTE: '2' });
  assert.equal(analyticsCollectionStatus(gate, false, false, new Date('2026-10-28T00:00:00Z')).collectionState, 'PRE_LAUNCH');
  assert.equal(analyticsCollectionStatus(gate, true, false, new Date('2026-10-28T00:00:00Z')).collectionState, 'READY_NOT_STARTED');
  assert.equal(analyticsCollectionStatus(gate, true, true, new Date('2026-10-28T00:00:00Z')).collectionState, 'COLLECTING');
  assert.equal(analyticsCollectionStatus({ ...gate, analyticsEnabled: false }, true, false, new Date('2026-10-28T00:00:00Z')).collectionState, 'PAUSED');
  assert.equal(analyticsCollectionStatus({ ...gate, collectionStartAt: 'bad' }, true, false).collectionState, 'MISCONFIGURED');
  assert.deepEqual(analyticsRetentionPlan(gate, new Date('2026-10-28T00:00:00Z')), { cutoff: '2026-07-30T00:00:00.000Z', retentionDays: 90 });
  assert.deepEqual(planStagingAnalyticsCleanup({ ...staging, EVENT_ANALYTICS_RETENTION_DAYS: '90' }, new Date('2026-10-28T00:00:00Z')),
    { projectRef: 'aaaaaaaaaaaaaaaaaaaa', table: 'product_v3_analytics_events', cutoff: '2026-07-30T00:00:00.000Z', retentionDays: 90, mode: 'DRY_RUN' });
  assert.throws(() => planStagingAnalyticsCleanup({ ...staging, VERCEL_ENV: 'production', EVENT_ANALYTICS_RETENTION_DAYS: '90' }), /PRODUCT_V3_STAGING_ONLY/);
  const key = '54a30986-a30c-4ad9-b868-8e0f3c675147';
  const limited = { ...staging, EVENT_ANALYTICS_SESSION_EVENT_CAP: '2', EVENT_ANALYTICS_RATE_LIMIT_PER_MINUTE: '2' };
  assert.equal(allowBrowserAnalyticsAttempt(key, 'one', limited, 0), true);
  assert.equal(allowBrowserAnalyticsAttempt(key, 'one', limited, 0), true);
  assert.equal(allowBrowserAnalyticsAttempt(key, 'two', limited, 0), true);
  assert.equal(allowBrowserAnalyticsAttempt(key, 'three', limited, 60_000), false);
});

test('stable Admin analytics errors do not expose database messages', async () => {
  const query = { analytics: 'summary', from: '2026-10-28', to: '2026-10-28', environment: 'staging', trafficType: 'qa' };
  const request = { method: 'GET', headers: { authorization: 'Bearer token' }, query };
  const base = { authorize: async () => 'admin' as const, loadSnapshot: async () => { throw new Error('unused'); } };
  for (const code of ['ANALYTICS_SCHEMA_NOT_READY', 'ANALYTICS_READ_FAILED', 'ANALYTICS_AUTH_UNAVAILABLE', 'ANALYTICS_TIMEOUT']) {
    const result = await handleProductV3ConsoleRequest(request, { ...base, loadAnalytics: async () => { throw new Error(code); } });
    assert.deepEqual(result, { status: 503, body: { error: code } });
  }
  const unknown = await handleProductV3ConsoleRequest(request, { ...base, loadAnalytics: async () => { throw new Error('secret database detail'); } });
  assert.deepEqual(unknown, { status: 503, body: { error: 'ANALYTICS_READ_FAILED' } });
  const unavailable = await handleProductV3ConsoleRequest(request, { ...base, authorize: async () => { throw new Error('secret auth detail'); } });
  assert.deepEqual(unavailable, { status: 503, body: { error: 'ANALYTICS_AUTH_UNAVAILABLE' } });
});

test('server reader distinguishes missing schema, auth failure, timeout and read failure', async () => {
  const query = parseAnalyticsQuery({ from: '2026-10-28', to: '2026-10-28', environment: 'staging', trafficType: 'qa' });
  assert.ok(query);
  const failure = async (status: number) => loadAnalyticsSummary(query, staging, (async () => new Response('', { status })) as typeof fetch);
  await assert.rejects(failure(404), /ANALYTICS_SCHEMA_NOT_READY/);
  await assert.rejects(failure(403), /ANALYTICS_AUTH_UNAVAILABLE/);
  await assert.rejects(failure(500), /ANALYTICS_READ_FAILED/);
  await assert.rejects(loadAnalyticsSummary(query, staging, (async () => { const error = new Error('timeout'); error.name = 'TimeoutError'; throw error; }) as typeof fetch), /ANALYTICS_TIMEOUT/);
});

test('global collection state does not depend on the selected filter or QA event count', () => {
  const gate = analyticsGateFromEnv({ EVENT_ANALYTICS_ENABLED: 'true', EVENT_ANALYTICS_ALLOWED_TRAFFIC_TYPES: 'real' });
  const now = new Date('2026-10-29T00:00:00Z');
  const collecting = globalAnalyticsCollectionStatus(gate, true, true, true, now);
  const noEvents = globalAnalyticsCollectionStatus(gate, true, true, false, now);
  const prelaunch = globalAnalyticsCollectionStatus(gate, false, true, true, now);
  assert.equal(collecting.collectionState, 'COLLECTING');
  assert.equal(noEvents.collectionState, 'READY_NOT_STARTED');
  assert.equal(prelaunch.collectionState, 'PRE_LAUNCH');
  assert.equal(globalAnalyticsCollectionStatus(gate, true, false, true, now).collectionState, 'MISCONFIGURED');
  const qa = event('RESULT_VIEWED', { eventId: stableAnalyticsEventId(id, 'qa') });
  const base = { from: '2026-10-28', to: '2026-10-28', environment: 'staging' as const, trafficType: 'qa' as const };
  const qaSummary = getAnalyticsSummary([qa], base, now, collecting);
  const otherFilter = getAnalyticsSummary([qa], { ...base, noticeId: 'samdo-2' }, now, collecting);
  assert.equal(qaSummary.globalCollectionState, 'COLLECTING');
  assert.equal(otherFilter.globalCollectionState, 'COLLECTING');
  assert.equal(otherFilter.currentQuery.dataState, 'NO_EVENTS');
  assert.equal(qaSummary.currentQuery.dataState, 'AVAILABLE');
  assert.equal(qaSummary.collection.collectionState, 'COLLECTING');
  assert.equal(qaSummary.globalTargetEnvironment, 'production');
});

test('Production analytics filter never reads the Staging physical store', async () => {
  const query = { from: '2026-10-28', to: '2026-10-28', environment: 'production' as const, trafficType: 'real' as const };
  let requests = 0;
  const result = await loadAnalyticsSummary(query, staging, (async () => { requests += 1; throw new Error('Staging must not be read'); }) as typeof fetch);
  assert.equal(requests, 0);
  assert.equal(result.currentQuery.dataState, 'STORE_UNAVAILABLE');
  assert.equal(result.currentQuery.environment, 'production');
  assert.equal(result.globalCollection.productionStoreReady, false);
  assert.equal(result.globalOfficialDataReady, false);
  const status = loadAnalyticsGlobalStatus(staging, new Date('2026-10-28T00:00:00Z'));
  assert.equal(status.collectionState, 'PRE_LAUNCH');
  assert.equal(status.targetEnvironment, 'production');
  assert.equal(status.productionStoreReady, false);
  assert.equal(await recordAnalyticsEvent(event('SESSION_STARTED', { environment: 'production', trafficType: 'real' }), staging,
    (async () => { requests += 1; return new Response(null, { status: 201 }); }) as typeof fetch), false);
  assert.equal(requests, 0);
});

test('Admin status endpoint is authenticated and independent of summary filters', async () => {
  const status = loadAnalyticsGlobalStatus(staging, new Date('2026-10-28T00:00:00Z'));
  const deps = { authorize: async () => 'admin' as const, loadSnapshot: async () => { throw new Error('unused'); }, loadAnalyticsStatus: async () => status };
  const request = { method: 'GET', headers: { authorization: 'Bearer token' }, query: { analytics: 'status' } };
  assert.deepEqual(await handleProductV3ConsoleRequest(request, deps), { status: 200, body: status });
  assert.equal((await handleProductV3ConsoleRequest({ ...request, headers: {} }, deps)).status, 401);
  assert.equal((await handleProductV3ConsoleRequest(request, { ...deps, authorize: async () => 'reviewer' as const })).status, 403);
});
