import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { analyticsCollectionStatus, analyticsGateFromEnv, analyticsWindow, parseAnalyticsQuery } from '../productV3/analytics/core.ts';
import type { AnalyticsCollectionState, AnalyticsSummary } from '../productV3/analytics/contract.ts';
import { handleProductV3ConsoleRequest } from './server/consoleApi.ts';
import { analyticsDemo, ANALYTICS_DEMO_KEYS } from './analyticsDemo.ts';
import {
  ANALYTICS_ERROR_CODES, ANALYTICS_ERROR_COPY, analyticsErrorCode, BANNED_TERMS, buildAiQuality, buildFunnel, buildKpis, COLLECTION_META,
  countDelta, DEFAULT_FILTERS, freshness, kstTime, launchChecks, periodLabel, queryString, rateDelta, resolveRange, supplyStatusRows,
  toQuery, unresolvedRows, viewState, type AnalyticsFilters,
} from './analyticsModel.ts';

const NOW = new Date('2026-10-22T23:30:00Z'); // KST 10-23 08:30
const LIVE = new Date('2026-11-12T01:00:00Z'); // KST 11-12 10:00
const filters = (patch: Partial<AnalyticsFilters> = {}): AnalyticsFilters => ({ ...DEFAULT_FILTERS, ...patch });
const collection = (collectionState: AnalyticsCollectionState, officialDataReady = collectionState !== 'PRE_LAUNCH') =>
  ({ collectionState, officialDataReady, requiredNoticeVersion: 'VER1.8', collectionStartAt: '2026-10-27T00:00:00+09:00' });
const summary = (patch: Partial<AnalyticsSummary> = {}): AnalyticsSummary => ({
  query: { from: '2026-11-06', to: '2026-11-12', environment: 'production', trafficType: 'real', previousPeriod: true },
  generatedAt: LIVE.toISOString(), lastEventAt: null, collection: collection('COLLECTING'),
  sessionsStarted: 0, assessmentsStarted: 0, assessmentsCompleted: 0, completionRate: null, resultViews: 0, resultSaves: 0, qrCreates: 0,
  resultViewSessions: 0, resultSaveSessions: 0, qrCreateSessions: 0,
  assessmentStatusDistribution: { COMPLETE: 0, NEEDS_USER_INPUT: 0, INELIGIBLE: 0, UNAVAILABLE: 0 }, unresolvedCategoryDistribution: {},
  noticeDistribution: {}, supplyTypeDistribution: {}, supplyTypeAssessmentDistribution: {}, copilotUsage: 0, aiModeDistribution: {}, fallbackDistribution: {},
  averageTurns: null, durationBuckets: {}, previousPeriodComparison: null, ...patch,
});

test('UI queries pass the Codex v2 parser and the API handler unchanged; periods are KST calendar days', async () => {
  assert.deepEqual(resolveRange(filters({ period: 'today' }), NOW), { ok: true, from: '2026-10-23', to: '2026-10-23', days: 1 });
  assert.deepEqual(resolveRange(filters({ period: '7d' }), NOW), { ok: true, from: '2026-10-17', to: '2026-10-23', days: 7 });
  assert.deepEqual(resolveRange(filters({ period: '30d' }), NOW), { ok: true, from: '2026-09-24', to: '2026-10-23', days: 30 });
  // KST 자정 직전·직후
  assert.equal((resolveRange(filters({ period: 'today' }), new Date('2026-10-26T14:59:00Z')) as { from: string }).from, '2026-10-26');
  assert.equal((resolveRange(filters({ period: 'today' }), new Date('2026-10-26T15:00:00Z')) as { from: string }).from, '2026-10-27');
  for (const patch of [{}, { period: 'today' as const, notice: 'samdo-2' as const }, { environment: 'preview' as const, trafficType: 'qa' as const }]) {
    const query = toQuery(filters(patch), NOW)!;
    const raw = Object.fromEntries(new URLSearchParams(queryString(query)));
    assert.deepEqual(parseAnalyticsQuery(raw), query, 'UI query must round-trip through Codex parseAnalyticsQuery');
    // 서버 창(window)이 KST 00:00 에서 시작한다
    assert.equal(new Date(analyticsWindow(query).from).toISOString(), new Date(`${query.from}T00:00:00+09:00`).toISOString());
    let received: unknown = null;
    const reply = await handleProductV3ConsoleRequest({ method: 'GET', headers: { authorization: 'Bearer token' }, query: raw },
      { authorize: async () => 'admin', loadSnapshot: async () => { throw new Error('unused'); }, loadAnalytics: async parsed => { received = parsed; return summary(); } });
    assert.equal(reply.status, 200);
    assert.deepEqual(received, query);
  }
  assert.equal(periodLabel(filters({ period: '7d' }), NOW), '최근 7일 (10.17~10.23 KST)');
  assert.equal(periodLabel(filters({ period: 'today' }), NOW), '오늘 (10.23 KST)');
  assert.equal(kstTime('2026-11-12T00:41:00Z'), '11.12 09:41 KST');
});

test('custom range is validated before any request', () => {
  const custom = (customFrom: string, customTo: string) => resolveRange(filters({ period: 'custom', customFrom, customTo }), NOW);
  assert.equal(custom('2026-10-27', '2026-11-02').ok, true);
  assert.equal(custom('2026-11-02', '2026-10-27').ok, false);
  assert.equal(custom('2026-02-30', '2026-03-01').ok, false);
  assert.equal(custom('2025-01-01', '2026-10-01').ok, false);
  assert.equal(toQuery(filters({ period: 'custom', customFrom: 'x', customTo: '' }), NOW), null);
  assert.equal(viewState(filters({ period: 'custom' }), NOW, null).kind, 'INVALID_RANGE');
});

test('collectionState (5 states + missing) decides the real view; QA views always show labelled numbers', () => {
  const data = { sessionsStarted: 12, assessmentsStarted: 10, assessmentsCompleted: 8 };
  const expect: Record<AnalyticsCollectionState, string> = {
    PRE_LAUNCH: 'COLLECTION_GATE', READY_NOT_STARTED: 'COLLECTION_GATE', COLLECTING: 'READY', PAUSED: 'READY', MISCONFIGURED: 'COLLECTION_GATE',
  };
  for (const [state, kind] of Object.entries(expect) as Array<[AnalyticsCollectionState, string]>) {
    assert.equal(viewState(filters(), LIVE, summary({ ...data, collection: collection(state) })).kind, kind, state);
    // QA 화면은 운영 상태와 관계없이 숫자를 보인다(배너·태그가 붙는다)
    assert.equal(viewState(filters({ environment: 'staging', trafficType: 'qa' }), LIVE, summary({ ...data, collection: collection(state) })).kind, 'READY', `qa ${state}`);
  }
  assert.deepEqual(viewState(filters(), LIVE, summary({ ...data, collection: undefined })), { kind: 'COLLECTION_GATE', state: 'UNKNOWN' });
  assert.deepEqual(viewState(filters(), LIVE, summary()), { kind: 'EMPTY', operational: true, state: 'COLLECTING' });
  assert.equal(viewState(filters({ environment: 'staging', trafficType: 'real' }), LIVE, summary({ ...data, collection: collection('PRE_LAUNCH') })).kind, 'COLLECTION_GATE');
  assert.equal(COLLECTION_META.PRE_LAUNCH.title, '아직 운영 집계가 시작되지 않았어요');
  assert.equal(COLLECTION_META.READY_NOT_STARTED.title, '운영 데이터 수집 준비가 완료됐지만 아직 시작되지 않았어요');
  assert.equal(COLLECTION_META.PAUSED.title, '운영 집계가 일시 중지돼 있어요');
  assert.equal(COLLECTION_META.MISCONFIGURED.level, 'ERROR');
  // 체크리스트는 서버 값만 쓴다
  assert.deepEqual(launchChecks(summary({ collection: collection('PRE_LAUNCH', false), generatedAt: NOW.toISOString() })).map(check => check.done), [false, false, false]);
  assert.deepEqual(launchChecks(summary({ collection: collection('READY_NOT_STARTED') })).map(check => check.done), [true, true, false]);
  // 서버 판단 함수와 화면 해석이 맞는다
  const gate = analyticsGateFromEnv({ EVENT_ANALYTICS_ENABLED: 'true', EVENT_ANALYTICS_ALLOWED_TRAFFIC_TYPES: 'qa,real' });
  assert.equal(analyticsCollectionStatus(gate, false, false, LIVE).collectionState, 'PRE_LAUNCH');
  assert.equal(analyticsCollectionStatus(gate, true, false, LIVE).collectionState, 'READY_NOT_STARTED');
  assert.equal(analyticsCollectionStatus(gate, true, true, LIVE).collectionState, 'COLLECTING');
});

test('freshness separates generatedAt and lastEventAt; staleness only from lastEventAt', () => {
  const live = filters();
  const recent = freshness(summary({ lastEventAt: '2026-11-12T00:41:00Z' }), live, LIVE);
  assert.equal(recent.generated, '11.12 10:00 KST (방금)');
  assert.deepEqual(recent.lastEvent, { text: '11.12 09:41 KST (19분 전)', stale: false });
  assert.equal(freshness(summary({ lastEventAt: null }), live, LIVE).noEvents, true);
  assert.equal(freshness(summary({ lastEventAt: '2026-11-11T17:00:00Z' }), live, LIVE).lastEvent?.stale, true, '8h old while collecting today');
  assert.equal(freshness(summary({ lastEventAt: '2026-11-11T17:00:00Z', collection: collection('PAUSED') }), live, LIVE).lastEvent?.stale, false);
  assert.equal(freshness(summary({ lastEventAt: '2026-11-11T17:00:00Z' }), filters({ trafficType: 'qa', environment: 'staging' }), LIVE).lastEvent?.stale, false, 'QA is sporadic');
  assert.equal(freshness(summary({ lastEventAt: '2026-11-01T00:00:00Z' }), filters({ period: 'custom', customFrom: '2026-10-27', customTo: '2026-11-01' }), LIVE).lastEvent?.stale, false, 'past window');
  // 집계가 오래됐어도(새로고침 안 함) 이벤트 기준이 아니면 stale 아님
  assert.equal(freshness(summary({ generatedAt: '2026-11-11T20:00:00Z', lastEventAt: '2026-11-11T19:59:00Z' }), live, LIVE).lastEvent?.stale, false);
  assert.equal(freshness(summary({ generatedAt: undefined, lastEventAt: undefined }), live, LIVE).missing, true);
});

test('funnel is sessions only; actions are event counts with per-session averages', () => {
  const funnel = buildFunnel(summary({ sessionsStarted: 100, assessmentsStarted: 80, assessmentsCompleted: 60, resultViewSessions: 50, resultSaveSessions: 10, qrCreateSessions: 20,
    resultViews: 150, resultSaves: 12, qrCreates: 30,
    previousPeriodComparison: { sessionsStarted: 90, assessmentsStarted: 80, assessmentsCompleted: 50, completionRate: 0.6, resultViewSessions: 40, resultSaveSessions: 10, qrCreateSessions: 25, needsUserInput: 5, fallback: 2 } }));
  assert.deepEqual(funnel.steps.map(step => [step.key, step.count, step.branch]), [
    ['session', 100, false], ['started', 80, false], ['completed', 60, false], ['viewed', 50, false], ['saved', 10, true], ['qr', 20, true],
  ]);
  assert.deepEqual(funnel.steps[3].dropFromPrevious, { count: 10, rate: 10 / 60 });
  assert.deepEqual(funnel.steps[4].base, { label: '결과 조회 세션', rate: 0.2 });
  assert.equal(funnel.steps[4].dropFromPrevious, null, 'branches are not drop-off');
  assert.deepEqual(funnel.steps.map(step => step.delta.direction), ['up', 'flat', 'up', 'up', 'flat', 'down']);
  assert.deepEqual(funnel.actions.map(action => [action.label, action.count, action.sessions, action.perSession]), [
    ['결과 조회', 150, 50, 3], ['결과 저장', 12, 10, 1.2], ['QR 생성', 30, 20, 1.5],
  ]);
  const missing = buildFunnel(summary({ sessionsStarted: 5, resultViewSessions: undefined, resultSaveSessions: undefined, qrCreateSessions: undefined }));
  assert.equal(missing.steps[3].count, null, 'never estimate a missing session count');
  assert.equal(missing.actions[0].perSession, null);
  const odd = buildFunnel(summary({ sessionsStarted: 5, assessmentsStarted: 8 }));
  assert.equal(odd.steps[1].anomaly, true);
  assert.equal(odd.steps[1].dropFromPrevious, null);
});

test('KPIs and previous-period deltas use only fields the server provides', () => {
  const kpis = buildKpis(summary({ sessionsStarted: 120, assessmentsCompleted: 70, completionRate: 0.7, assessmentsStarted: 100,
    assessmentStatusDistribution: { COMPLETE: 300, NEEDS_USER_INPUT: 200, INELIGIBLE: 450, UNAVAILABLE: 50 },
    previousPeriodComparison: { sessionsStarted: 100, assessmentsStarted: 100, assessmentsCompleted: 70, completionRate: 0.65, needsUserInput: 250 } }));
  assert.deepEqual(kpis.map(tile => tile.label), ['상담 시작 세션', '판정 완료 세션', '완료율', '추가 확인 필요']);
  assert.equal(kpis[0].delta.text, '이전 기간 대비 +20세션 (+20%)');
  assert.equal(kpis[1].delta.direction, 'flat');
  assert.equal(kpis[2].delta.text, '이전 기간 대비 +5%p');
  assert.equal(kpis[3].delta.text, '이전 기간 대비 −50건 (−20%)');
  assert.equal(kpis[3].basis, '공급유형 판정 결과 1,000건 중 20%');
  assert.equal(buildKpis(summary({ previousPeriodComparison: { sessionsStarted: 1, assessmentsStarted: 1, assessmentsCompleted: 1, completionRate: 1 } }))[3].delta.direction, 'none');
  assert.deepEqual(countDelta(4, 0, '세션'), { text: '이전 기간 0세션 → 4세션', direction: 'up' });
  assert.equal(rateDelta(0.5, null).direction, 'none');
  assert.equal(buildAiQuality(summary({ aiModeDistribution: { fallback: 3 }, copilotUsage: 10, previousPeriodComparison: { sessionsStarted: 0, assessmentsStarted: 0, assessmentsCompleted: 0, completionRate: null, fallback: 1 } })).fallbackDelta.text, '이전 기간 대비 +2회 (+200%)');
});

test('supplyType × assessmentStatus matrix is shown per supply type in report order', () => {
  const rows = supplyStatusRows(summary({ supplyTypeAssessmentDistribution: {
    GENERAL: { COMPLETE: 2, NEEDS_USER_INPUT: 1, INELIGIBLE: 1, UNAVAILABLE: 0 },
    YOUTH: { COMPLETE: 0, NEEDS_USER_INPUT: 3, INELIGIBLE: 1, UNAVAILABLE: 0 },
    MYSTERY: { COMPLETE: 0, NEEDS_USER_INPUT: 0, INELIGIBLE: 0, UNAVAILABLE: 2 },
  } }))!;
  assert.deepEqual(rows.map(row => `${row.label}:${row.total}`), ['청년:4', '신혼부부:0', '신생아:0', '생애최초:0', '일반:4', '기타 공급유형:2']);
  assert.deepEqual(rows[0].cells.map(cell => `${cell.label} ${cell.count}`), ['판정 완료 0', '추가 확인 필요 3', '신청 어려움 1', '판정 불가 0']);
  assert.equal(rows[0].cells[1].share, 0.75);
  assert.equal(supplyStatusRows(summary({ supplyTypeAssessmentDistribution: undefined })), null);
  assert.deepEqual(unresolvedRows(summary({ unresolvedCategoryDistribution: { assets: 24, rewinning_restriction: 31, subscription_account: 18, income: 0 } }))
    .map(row => `${row.label} ${row.count}`), ['재당첨 제한 31', '자산 24', '청약통장 18']);
});

test('stable API error codes map to distinct operator copy; no generic 503 text', async () => {
  for (const code of ['ANALYTICS_SCHEMA_NOT_READY', 'ANALYTICS_READ_FAILED', 'ANALYTICS_AUTH_UNAVAILABLE', 'ANALYTICS_TIMEOUT'])
    assert.equal(analyticsErrorCode(503, code), code);
  assert.equal(analyticsErrorCode(401, 'AUTH_REQUIRED'), 'AUTH_REQUIRED');
  assert.equal(analyticsErrorCode(403, 'FORBIDDEN'), 'FORBIDDEN');
  assert.equal(analyticsErrorCode(503, 'SOMETHING_NEW'), 'ANALYTICS_READ_FAILED');
  assert.equal(analyticsErrorCode(null, null, 'TIMEOUT'), 'ANALYTICS_TIMEOUT');
  assert.equal(analyticsErrorCode(null, null, 'NETWORK'), 'NETWORK');
  assert.equal(ANALYTICS_ERROR_COPY.ANALYTICS_SCHEMA_NOT_READY.title, '운영 지표 저장소가 아직 준비되지 않았어요');
  assert.equal(ANALYTICS_ERROR_COPY.ANALYTICS_READ_FAILED.title, '운영 데이터를 읽는 중 문제가 발생했어요');
  assert.equal(ANALYTICS_ERROR_COPY.ANALYTICS_AUTH_UNAVAILABLE.title, '관리자 권한 확인 경로가 응답하지 않아요');
  assert.equal(ANALYTICS_ERROR_COPY.ANALYTICS_TIMEOUT.title, '운영 데이터 조회가 지연되고 있어요');
  assert.equal(new Set(ANALYTICS_ERROR_CODES.map(code => ANALYTICS_ERROR_COPY[code].title)).size, ANALYTICS_ERROR_CODES.length);
  // 서버 핸들러가 실제로 보내는 코드
  for (const code of ['ANALYTICS_SCHEMA_NOT_READY', 'ANALYTICS_READ_FAILED', 'ANALYTICS_AUTH_UNAVAILABLE', 'ANALYTICS_TIMEOUT']) {
    const reply = await handleProductV3ConsoleRequest({ method: 'GET', headers: { authorization: 'Bearer token' }, query: { analytics: 'summary', ...Object.fromEntries(new URLSearchParams(queryString(toQuery(filters(), NOW)!))) } },
      { authorize: async () => 'admin', loadSnapshot: async () => { throw new Error('unused'); }, loadAnalytics: async () => { throw new Error(code); } });
    assert.deepEqual([reply.status, analyticsErrorCode(reply.status, (reply.body as { error: string }).error)], [503, code]);
  }
  const unavailable = await handleProductV3ConsoleRequest({ method: 'GET', headers: { authorization: 'Bearer token' }, query: { analytics: 'summary' } },
    { authorize: async () => { throw new Error('down'); }, loadSnapshot: async () => { throw new Error('unused'); } });
  assert.equal(analyticsErrorCode(unavailable.status, (unavailable.body as { error: string }).error), 'ANALYTICS_AUTH_UNAVAILABLE');
  const reviewer = await handleProductV3ConsoleRequest({ method: 'GET', headers: { authorization: 'Bearer token' }, query: { analytics: 'summary' } },
    { authorize: async () => 'reviewer', loadSnapshot: async () => { throw new Error('unused'); } });
  assert.equal(analyticsErrorCode(reviewer.status, (reviewer.body as { error: string }).error), 'FORBIDDEN');
});

test('demo scenarios come from Codex v2 aggregation and collection functions', () => {
  const expected: Partial<Record<string, AnalyticsCollectionState>> = { prelaunch: 'PRE_LAUNCH', ready: 'READY_NOT_STARTED', live: 'COLLECTING', live0: 'COLLECTING', paused: 'PAUSED', misconfigured: 'MISCONFIGURED' };
  for (const key of ANALYTICS_DEMO_KEYS) {
    const demo = analyticsDemo(key);
    const result = demo.load(toQuery(filters({ period: '7d', ...demo.initialFilters }), demo.now)!);
    assert.ok(result.assessmentsCompleted <= result.assessmentsStarted, key);
    assert.ok(result.resultSaveSessions <= result.resultSaves && result.qrCreateSessions <= result.qrCreates, `${key}: sessions ≤ counts`);
    if (expected[key]) assert.equal(result.collection.collectionState, expected[key], key);
  }
  const live0 = analyticsDemo('live0');
  assert.equal(viewState(filters(), live0.now, live0.load(toQuery(filters(), live0.now)!)).kind, 'EMPTY');
  const qa0 = analyticsDemo('qa0');
  assert.equal(qa0.load(toQuery(filters({ ...qa0.initialFilters }), qa0.now)!).lastEventAt, null);
  const stale = analyticsDemo('stale');
  assert.equal(freshness(stale.load(toQuery(filters(), stale.now)!), filters(), stale.now).lastEvent?.stale, true);
  const sessions = (key: 'qa20' | 'qa500') => { const demo = analyticsDemo(key); return demo.load(toQuery(filters({ period: '30d', ...demo.initialFilters }), demo.now)!).sessionsStarted; };
  assert.ok(sessions('qa20') <= 20 && sessions('qa20') >= 15);
  assert.ok(sessions('qa500') >= 450);
});

test('operator copy never calls sessions people, never says UTC, never prints raw JSON or the removed workaround', () => {
  for (const file of ['app/admin/console/analytics.tsx', 'features/adminConsole/analyticsModel.ts', 'app/admin/console/index.tsx']) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').split('\n').filter(line => !line.includes('BANNED_TERMS = ')).join('\n');
    for (const term of BANNED_TERMS) assert.ok(!source.includes(term), `${file} contains "${term}"`);
    assert.ok(!source.includes('UTC 00시'), `${file} still mentions the UTC boundary`);
    assert.ok(!source.includes('아직 제공되지 않아요'), `${file} still carries the v1 supply workaround`);
    assert.ok(!source.includes('launchState('), `${file} still guesses launch locally`);
    if (file.endsWith('.tsx')) assert.ok(!/JSON\.stringify\([^)]*summary/.test(source), `${file} renders raw summary JSON`);
  }
});
