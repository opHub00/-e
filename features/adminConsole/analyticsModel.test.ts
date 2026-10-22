import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseAnalyticsQuery } from '../productV3/analytics/core.ts';
import type { AnalyticsSummary } from '../productV3/analytics/contract.ts';
import { analyticsDemo, ANALYTICS_DEMO_KEYS } from './analyticsDemo.ts';
import {
  BANNED_TERMS, buildAiQuality, buildFunnel, buildKpis, countDelta, DEFAULT_FILTERS, launchState, queryString, rateDelta,
  resolveRange, supplyRows, toQuery, unresolvedRows, viewState, type AnalyticsFilters,
} from './analyticsModel.ts';

const NOW = new Date('2026-10-22T23:30:00Z'); // KST 10-23 08:30
const filters = (patch: Partial<AnalyticsFilters> = {}): AnalyticsFilters => ({ ...DEFAULT_FILTERS, ...patch });
const notices = (official: boolean, status: 'ACTIVE' | 'REVIEW_REQUIRED' = 'ACTIVE') => ['samdo-1', 'samdo-2'].map(id => ({ id, status, provenance: { fileName: '', sha256: '', official } }));
const summary = (patch: Partial<AnalyticsSummary> = {}): AnalyticsSummary => ({
  query: { from: '2026-10-28', to: '2026-11-03', environment: 'production', trafficType: 'real', previousPeriod: true },
  sessionsStarted: 0, assessmentsStarted: 0, assessmentsCompleted: 0, completionRate: null, resultViews: 0, resultSaves: 0, qrCreates: 0,
  assessmentStatusDistribution: { COMPLETE: 0, NEEDS_USER_INPUT: 0, INELIGIBLE: 0, UNAVAILABLE: 0 }, unresolvedCategoryDistribution: {},
  noticeDistribution: {}, supplyTypeDistribution: {}, copilotUsage: 0, aiModeDistribution: {}, fallbackDistribution: {}, averageTurns: null,
  durationBuckets: {}, previousPeriodComparison: null, ...patch,
});

test('period presets use the Korean calendar day and produce queries the server contract accepts', () => {
  assert.deepEqual(resolveRange(filters({ period: 'today' }), NOW), { ok: true, from: '2026-10-23', to: '2026-10-23', days: 1 });
  assert.deepEqual(resolveRange(filters({ period: '7d' }), NOW), { ok: true, from: '2026-10-17', to: '2026-10-23', days: 7 });
  assert.deepEqual(resolveRange(filters({ period: '30d' }), NOW), { ok: true, from: '2026-09-24', to: '2026-10-23', days: 30 });
  for (const patch of [{}, { period: 'today' as const, notice: 'samdo-2' as const }, { environment: 'staging' as const, trafficType: 'qa' as const }]) {
    const query = toQuery(filters(patch), NOW);
    assert.ok(query);
    const parsed = parseAnalyticsQuery(Object.fromEntries(new URLSearchParams(queryString(query))));
    assert.deepEqual(parsed, query, 'UI query must round-trip through Codex parseAnalyticsQuery unchanged');
  }
});

test('custom range is validated before any request', () => {
  const custom = (customFrom: string, customTo: string) => resolveRange(filters({ period: 'custom', customFrom, customTo }), NOW);
  assert.equal(custom('2026-10-27', '2026-11-02').ok, true);
  assert.equal(custom('2026-11-02', '2026-10-27').ok, false);
  assert.equal(custom('2026-02-30', '2026-03-01').ok, false);
  assert.equal(custom('2025-01-01', '2026-10-01').ok, false);
  assert.equal(toQuery(filters({ period: 'custom', customFrom: 'x', customTo: '' }), NOW), null);
  assert.equal(viewState(filters({ period: 'custom' }), launchState(notices(true), NOW), NOW, null).kind, 'INVALID_RANGE');
});

test('real traffic stays pre-launch until official ACTIVE notice and collection start; QA is never pre-launch', () => {
  const before = launchState(notices(false), NOW);
  assert.equal(before.launched, false);
  assert.deepEqual(before.checks.map(check => check.done), [false, true, false]);
  assert.equal(before.requiredNoticeVersion, 'VER1.8');
  assert.equal(launchState(notices(true), NOW).launched, false, 'official but before 2026-10-27 KST');
  const after = new Date('2026-10-26T15:00:00Z'); // 10-27 00:00 KST
  assert.equal(launchState(notices(true), after).launched, true);
  assert.equal(launchState(notices(true, 'REVIEW_REQUIRED'), after).launched, false);
  assert.equal(launchState([notices(true)[0]], after).launched, false, 'both districts must be present');

  assert.equal(viewState(filters(), before, NOW, null).kind, 'PRE_LAUNCH');
  assert.equal(viewState(filters({ environment: 'staging', trafficType: 'real' }), before, NOW, null).kind, 'PRE_LAUNCH');
  assert.deepEqual(viewState(filters({ environment: 'staging', trafficType: 'qa' }), before, NOW, summary()), { kind: 'EMPTY', operational: false });
  assert.deepEqual(viewState(filters(), launchState(notices(true), after), after, summary()), { kind: 'EMPTY', operational: true });
  assert.deepEqual(viewState(filters(), launchState(notices(true), after), after, summary({ sessionsStarted: 3 })), { kind: 'READY', operational: true });
});

test('funnel keeps sessions and event counts apart and never reports negative drop-off', () => {
  const funnel = buildFunnel(summary({ sessionsStarted: 100, assessmentsStarted: 80, assessmentsCompleted: 60, resultViews: 150, resultSaves: 20, qrCreates: 30 }));
  assert.deepEqual(funnel.steps.map(step => [step.count, step.ofTotal, step.dropFromPrevious]), [
    [100, 1, null], [80, 0.8, { count: 20, rate: 0.2 }], [60, 0.6, { count: 20, rate: 0.25 }],
  ]);
  assert.deepEqual(funnel.afterActions.map(action => [action.label, action.count, action.perCompleted]), [['결과 조회', 150, 2.5], ['결과 저장', 20, 20 / 60], ['QR 생성', 30, 0.5]]);
  const odd = buildFunnel(summary({ sessionsStarted: 5, assessmentsStarted: 8, assessmentsCompleted: 0 }));
  assert.equal(odd.steps[1].anomaly, true);
  assert.equal(odd.steps[1].dropFromPrevious, null);
  assert.equal(buildFunnel(summary()).steps[0].ofTotal, null);
});

test('KPIs use session/count units and deltas carry direction only (no good/bad colour)', () => {
  const kpis = buildKpis(summary({ sessionsStarted: 120, assessmentsCompleted: 70, completionRate: 0.7, assessmentsStarted: 100,
    assessmentStatusDistribution: { COMPLETE: 300, NEEDS_USER_INPUT: 200, INELIGIBLE: 450, UNAVAILABLE: 50 },
    previousPeriodComparison: { sessionsStarted: 100, assessmentsCompleted: 70, completionRate: 0.65 } }));
  assert.deepEqual(kpis.primary.map(tile => tile.label), ['상담 시작 세션', '판정 완료 세션', '완료율', '추가 확인 필요']);
  assert.deepEqual(kpis.secondary.map(tile => `${tile.label}:${tile.unit}`), ['판정 시작 세션:세션', '결과 조회:회', '결과 저장:회', 'QR 생성:회']);
  assert.equal(kpis.primary[0].delta.text, '이전 기간 대비 +20세션 (+20%)');
  assert.equal(kpis.primary[1].delta.direction, 'flat');
  assert.equal(kpis.primary[2].delta.text, '이전 기간 대비 +5%p');
  assert.equal(kpis.primary[3].basis, '공급유형 판정 결과 1,000건 중 20%');
  assert.deepEqual(countDelta(4, 0, '세션'), { text: '이전 기간 0세션 → 4세션', direction: 'up' });
  assert.equal(countDelta(4, undefined, '세션').direction, 'none');
  assert.equal(rateDelta(0.5, null).direction, 'none');
});

test('unresolved ranking, supply order and AI warnings follow the contract fields', () => {
  assert.deepEqual(unresolvedRows(summary({ unresolvedCategoryDistribution: { assets: 24, rewinning_restriction: 31, subscription_account: 18, income: 0 } }))
    .map(row => `${row.label} ${row.count}`), ['재당첨 제한 31', '자산 24', '청약통장 18']);
  assert.deepEqual(supplyRows(summary({ supplyTypeDistribution: { GENERAL: 4, YOUTH: 1, MYSTERY_TYPE: 2 } })).map(row => `${row.label}:${row.count}`),
    ['청년:1', '신혼부부:0', '신생아:0', '생애최초:0', '일반:4', '기타 공급유형:2']);
  const calm = buildAiQuality(summary({ copilotUsage: 20, aiModeDistribution: { deterministic: 10, llm: 9, fallback: 1 }, fallbackDistribution: { unknown: 1 } }));
  assert.deepEqual(calm.warnings, []);
  const hot = buildAiQuality(summary({ copilotUsage: 20, aiModeDistribution: { deterministic: 6, llm: 6, fallback: 8 }, fallbackDistribution: { provider_error: 3, timeout: 2, grounding_rejected: 3 } }));
  assert.deepEqual(hot.warnings.map(warning => warning.level), ['ERROR', 'WARNING', 'INFO']);
  assert.equal(buildAiQuality(summary({ copilotUsage: 2, aiModeDistribution: { fallback: 2 }, fallbackDistribution: { timeout: 1, unknown: 1 } })).warnings[0].level, 'ACTION_REQUIRED');
});

test('demo densities (0/20/100/500) are produced by the Codex aggregation and stay internally consistent', () => {
  for (const key of ANALYTICS_DEMO_KEYS) {
    const demo = analyticsDemo(key);
    const query = toQuery(filters({ period: '30d', ...demo.initialFilters }), demo.now)!;
    const result = demo.load(query);
    assert.ok(result.assessmentsCompleted <= result.assessmentsStarted, key);
    assert.ok(result.completionRate === null || (result.completionRate >= 0 && result.completionRate <= 1), key);
  }
  const sessions = (key: 'qa0' | 'qa20' | 'qa100' | 'qa500') => {
    const demo = analyticsDemo(key);
    return demo.load(toQuery(filters({ period: '30d', environment: 'staging', trafficType: 'qa' }), demo.now)!).sessionsStarted;
  };
  assert.equal(sessions('qa0'), 0);
  assert.ok(sessions('qa20') <= 20 && sessions('qa20') >= 15);
  assert.ok(sessions('qa500') >= 450);
  const prelaunch = analyticsDemo('prelaunch');
  assert.equal(launchState(prelaunch.notices, prelaunch.now).launched, false);
  const live = analyticsDemo('live');
  assert.equal(launchState(live.notices, live.now).launched, true);
  assert.equal(live.load(toQuery(filters(), live.now)!).query.trafficType, 'real');
});

test('operator copy never calls anonymous sessions people and never prints raw JSON', () => {
  for (const file of ['app/admin/console/analytics.tsx', 'features/adminConsole/analyticsModel.ts', 'app/admin/console/index.tsx']) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').split('\n').filter(line => !line.includes('BANNED_TERMS = ')).join('\n');
    for (const term of BANNED_TERMS) assert.ok(!source.includes(term), `${file} contains "${term}"`);
    if (file.endsWith('.tsx')) assert.ok(!/JSON\.stringify\([^)]*summary/.test(source), `${file} renders raw summary JSON`);
  }
});
