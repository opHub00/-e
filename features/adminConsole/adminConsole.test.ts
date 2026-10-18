import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { auditDiff, buildDashboard, filterAi, percent } from './consoleModel.ts';
import { CONSOLE_DEMO_SNAPSHOT } from './demoData.ts';
import { handleProductV3ConsoleRequest } from './server/consoleApi.ts';
import { parseConsolePageQuery } from './server/pagination.ts';

test('dashboard counts come only from the snapshot (no invented numbers)', () => {
  const model = buildDashboard(CONSOLE_DEMO_SNAPSHOT);
  assert.equal(model.kpis.activeNotices, CONSOLE_DEMO_SNAPSHOT.notices.filter(notice => notice.status === 'ACTIVE').length);
  assert.equal(model.kpis.assessmentsToday, Object.values(CONSOLE_DEMO_SNAPSHOT.assessments.byStatus).reduce((a, b) => a + b, 0));
  const todayAi = CONSOLE_DEMO_SNAPSHOT.ai.filter(event => event.at.startsWith(CONSOLE_DEMO_SNAPSHOT.assessments.date));
  assert.equal(model.kpis.aiToday, todayAi.length);
  assert.equal(model.kpis.fallbackRate, todayAi.filter(event => event.mode === 'fallback').length / todayAi.length);
  assert.equal(model.kpis.groundingFailures, todayAi.filter(event => event.groundingRejected).length);
  // 검토 필요 = REVIEW_REQUIRED 공고 + 승인 대기 규칙이 있는 공고(중복 없이)
  assert.equal(model.kpis.reviewRequired, 1);
  assert.equal(model.health.ok, false, 'fallback ≥30% and grounding failures surface as issues');
  assert.ok(model.health.issues.some(issue => issue.includes('근거 검증 실패')));
  assert.deepEqual(model.blockers.map(item => item.count), [...model.blockers.map(item => item.count)].sort((a, b) => b - a));
});

test('empty AI day shows — instead of 0% (no false comfort)', () => {
  const model = buildDashboard({ ...CONSOLE_DEMO_SNAPSHOT, ai: [] });
  assert.equal(model.kpis.fallbackRate, null);
  assert.equal(percent(model.kpis.fallbackRate), '—');
});

test('AI filters: mode, grounding rejected, provider error', () => {
  const all = CONSOLE_DEMO_SNAPSHOT.ai;
  assert.equal(filterAi(all, 'all').length, all.length);
  assert.ok(filterAi(all, 'fallback').every(event => event.mode === 'fallback'));
  assert.ok(filterAi(all, 'grounding').every(event => event.groundingRejected));
  assert.ok(filterAi(all, 'provider').every(event => event.providerError));
});

test('audit diff shows only changed fields, with added/removed/changed kinds', () => {
  const [u1, , , u4] = CONSOLE_DEMO_SNAPSHOT.audit;
  assert.deepEqual(auditDiff(u1).map(line => [line.key, line.kind]), [['ragVersion', 'changed'], ['chunks', 'changed']]);
  assert.ok(auditDiff(u4).every(line => line.kind === 'added'));
  assert.deepEqual(auditDiff({ ...u1, before: { a: 1 }, after: { a: 1 } }), []);
});

test('demo data is labelled and isolated; console source gates demo behind ?demo=1', () => {
  assert.ok(CONSOLE_DEMO_SNAPSHOT.notices.every(notice => notice.title.startsWith('[예시]')));
  assert.ok(CONSOLE_DEMO_SNAPSHOT.ai.every(event => event.question.startsWith('[예시]')));
  const source = readFileSync(new URL('source.ts', import.meta.url), 'utf8');
  assert.match(source, /demoParam === '1' && isDemoModeEnabled\(\)/);
  assert.match(source, /fetcher\('\/admin-api\/product-v3'/);
  assert.match(source, /authorization: `Bearer \$\{accessToken\}`/);
  // 개인정보로 읽힐 값이 예시 데이터에 없다
  assert.ok(!/\d{6}-\d{7}|010-\d{4}|@[a-z]+\./.test(JSON.stringify(CONSOLE_DEMO_SNAPSHOT)));
});

test('connected console is server-authorized, read-only and returns only its injected snapshot', async () => {
  const authorized = { authorize: async (token: string) => token === 'test-token' ? 'reviewer' as const : null,
    loadSnapshot: async () => ({ ...CONSOLE_DEMO_SNAPSHOT, notices: CONSOLE_DEMO_SNAPSHOT.notices.map(notice => ({ ...notice, title: notice.title.replace('[예시]', '') })), errors: [] }) };
  assert.equal((await handleProductV3ConsoleRequest({ method: 'GET' }, authorized)).status, 401);
  assert.equal((await handleProductV3ConsoleRequest({ method: 'GET', headers: { authorization: 'Bearer invalid' } }, authorized)).status, 403);
  assert.equal((await handleProductV3ConsoleRequest({ method: 'POST', headers: { authorization: 'Bearer test-token' } }, authorized)).status, 405);
  const result = await handleProductV3ConsoleRequest({ method: 'GET', headers: { authorization: 'Bearer test-token' } }, authorized);
  assert.equal(result.status, 200);
  const snapshot = result.body as typeof CONSOLE_DEMO_SNAPSHOT;
  assert.ok(snapshot.notices.every(notice => !notice.title.startsWith('[예시]')));
  assert.deepEqual(snapshot.errors, []);
  const unavailable = await handleProductV3ConsoleRequest({ method: 'GET', headers: { authorization: 'Bearer test-token' } }, {
    authorize: authorized.authorize, loadSnapshot: async () => { throw new Error('service-key-or-db-detail'); },
  });
  assert.deepEqual(unavailable, { status: 503, body: { error: 'ADMIN_STAGING_DATA_UNAVAILABLE' } });
});

test('server pagination validates filters, search and cursor after authorization', async () => {
  const deps = { authorize: async (token: string) => token === 'admin' ? 'admin' as const : null,
    loadSnapshot: async () => CONSOLE_DEMO_SNAPSHOT };
  const headers = { authorization: 'Bearer admin' };
  const response = await handleProductV3ConsoleRequest({ method: 'GET', headers, query: { collection: 'ai', filter: 'fallback', limit: 1 } }, deps);
  assert.equal(response.status, 200);
  const page = response.body as { items: typeof CONSOLE_DEMO_SNAPSHOT.ai; total: number; nextCursor: string | null };
  assert.equal(page.items.length, 1);
  assert.ok(page.items.every(item => item.mode === 'fallback'));
  assert.equal(page.nextCursor, page.total > 1 ? '1' : null);
  assert.equal((await handleProductV3ConsoleRequest({ method: 'GET', headers, query: { collection: 'notices', search: '없는 공고' } }, deps)).status, 200);
  assert.equal((await handleProductV3ConsoleRequest({ method: 'GET', headers, query: { collection: 'audit', cursor: '-1' } }, deps)).status, 400);
  assert.equal((await handleProductV3ConsoleRequest({ method: 'GET', query: { collection: 'ai' } }, deps)).status, 401);
  assert.equal(parseConsolePageQuery({ collection: 'ai', limit: 101 }), null);
});

/* ── Admin Operations UX (V3 real-data states) ───────────────────────────── */

type Ready = { kind: 'READY'; snapshot: typeof CONSOLE_DEMO_SNAPSHOT };

test('alert hierarchy: ERROR > ACTION_REQUIRED > WARNING > INFO and the required mappings', async () => {
  const { buildAlerts } = await import('./consoleModel.ts');
  const { demoScenario, demoClock } = await import('./demoScenarios.ts');
  const large = demoScenario('large') as Ready;
  assert.equal(large.kind, 'READY');
  const alerts = buildAlerts(large.snapshot, demoClock());
  const rank = { ERROR: 0, ACTION_REQUIRED: 1, WARNING: 2, INFO: 3 } as const;
  assert.deepEqual(alerts.map(alert => rank[alert.level]), [...alerts.map(alert => rank[alert.level])].sort((a, b) => a - b), 'sorted by level');
  // provider outage = ERROR, rule validation fail = ACTION_REQUIRED, fallback 증가 = WARNING
  assert.equal(alerts.find(alert => alert.id === 'ai-outage')?.level, 'ERROR');
  assert.equal(alerts.find(alert => alert.id === 'rule-fail')?.level, 'ACTION_REQUIRED');
  assert.equal(alerts.find(alert => alert.id === 'fallback')?.level, 'WARNING');
  assert.equal(alerts.find(alert => alert.id === 'needs-input')?.level, 'WARNING');
  assert.ok(alerts.find(alert => alert.id === 'needs-input')?.detail.includes('가장 많이 막히는 항목'));
  // 기본 예시: 단일 시간 초과는 장애가 아니라 주의
  const base = buildAlerts(CONSOLE_DEMO_SNAPSHOT, demoClock());
  assert.equal(base.find(alert => alert.id === 'ai-outage'), undefined);
  assert.equal(base.find(alert => alert.id === 'ai-provider')?.level, 'WARNING');
});

test('states: partial shows "not collected" (not 0), stale is flagged, empty has a specific sentence', async () => {
  const { buildAlerts } = await import('./consoleModel.ts');
  const { collected, emptyCopy, isStale, missingSections } = await import('./consoleState.ts');
  const { demoScenario, demoClock } = await import('./demoScenarios.ts');
  const partial = demoScenario('partial') as Ready;
  assert.deepEqual(missingSections(partial.snapshot), ['assessments', 'ai']);
  assert.equal(collected(partial.snapshot.coverage, 'ai'), false);
  assert.match(emptyCopy('ai', false).title, /수집이 아직 연결되지 않았어요/);
  assert.equal(emptyCopy('ai', true).title, '아직 수집된 상담 로그가 없습니다');
  assert.equal(buildAlerts(partial.snapshot, demoClock()).find(alert => alert.category === 'data')?.level, 'INFO');
  const stale = demoScenario('stale') as Ready;
  assert.equal(isStale(stale.snapshot.generatedAt, demoClock()), true);
  assert.equal(isStale(CONSOLE_DEMO_SNAPSHOT.generatedAt, demoClock()), false);
  assert.equal(buildAlerts(stale.snapshot, demoClock()).find(alert => alert.id === 'stale')?.level, 'WARNING');
});

test('load errors are classified with distinct copy (no generic error sentence)', async () => {
  const { classifyResponse, LOAD_ERROR_COPY } = await import('./consoleState.ts');
  const { connectedSnapshot } = await import('./source.ts');
  assert.equal(classifyResponse(401), 'UNAUTHORIZED');
  assert.equal(classifyResponse(403), 'FORBIDDEN');
  assert.equal(classifyResponse(503, 'ADMIN_AUTH_UNAVAILABLE'), 'AUTH_UNAVAILABLE');
  assert.equal(classifyResponse(504), 'TIMEOUT');
  assert.equal(classifyResponse(500), 'SERVER');
  const titles = Object.values(LOAD_ERROR_COPY).map(copy => copy.title);
  assert.equal(new Set(titles).size, titles.length);
  assert.ok(!titles.some(title => /에러가 발생/.test(title)));
  assert.equal(LOAD_ERROR_COPY.FORBIDDEN.title, '권한이 없습니다');
  assert.equal(LOAD_ERROR_COPY.TIMEOUT.title, '운영 데이터 연결이 지연되고 있어요');
  const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  const kindIs = (kind: string) => (error: unknown) => (error as { kind?: string }).kind === kind;
  await assert.rejects(connectedSnapshot('t', reply(403, { error: 'FORBIDDEN' })), kindIs('FORBIDDEN'));
  await assert.rejects(connectedSnapshot('t', reply(401, { error: 'AUTH_REQUIRED' })), kindIs('UNAUTHORIZED'));
  await assert.rejects(connectedSnapshot('t', reply(503, { error: 'ADMIN_AUTH_UNAVAILABLE' })), kindIs('AUTH_UNAVAILABLE'));
  await assert.rejects(connectedSnapshot('t', (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch), kindIs('NETWORK'));
  const hang = ((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
  await assert.rejects(connectedSnapshot('t', hang, 20), kindIs('TIMEOUT'));
});

test('PII is masked again in the UI, locators and audit values are never shown as raw JSON', async () => {
  const { formatLocator, maskPii, readableAuditDiff } = await import('./consoleModel.ts');
  const masked = maskPii('연락처 010-1234-5678, 메일 a.b@example.com, 주민 900101-1234567, 계좌 1002-345-678901');
  assert.equal(masked.masked, true);
  assert.ok(!/010-1234|example\.com|900101|678901/.test(masked.text), masked.text);
  assert.equal(maskPii('59㎡ 토지임대료 비교해 줘').masked, false, 'ordinary numbers stay');
  assert.equal(formatLocator('{"page":5,"table":2,"row":3}'), '쪽 5 · 표 2 · 행 3');
  assert.equal(formatLocator('p.5 · 표 2'), 'p.5 · 표 2');
  assert.ok(!/[{}"]/.test(formatLocator('{"documentId":"d1","section":{"heading":"3. 신청자격","line":4}}')));
  const [u1, , u3] = CONSOLE_DEMO_SNAPSHOT.audit;
  const lines = readableAuditDiff(u3);
  assert.ok(lines.some(line => line.field === '상태' && line.before === '검토 필요' && line.after === '승인'), JSON.stringify(lines));
  assert.ok(readableAuditDiff(u1).every(line => !/[{}]/.test(`${line.before}${line.after}`)));
});

test('AI log filters include timeout and provider error separately; rule filters cover search/validation/evidence/supply/changed', async () => {
  const { changeDataAvailable, DEFAULT_RULE_FILTERS, evidenceMissing, filterAiLog, filterRules } = await import('./consoleModel.ts');
  const { demoScenario } = await import('./demoScenarios.ts');
  const large = (demoScenario('large') as Ready).snapshot;
  assert.equal(large.ai.length, 100);
  assert.equal(large.notices.length, 100);
  assert.equal(large.audit.length, 100);
  assert.ok(filterAiLog(large.ai, 'timeout').every(event => event.fallbackReason === 'timeout'));
  assert.ok(filterAiLog(large.ai, 'provider').every(event => event.fallbackReason === 'provider_error'));
  assert.ok(filterAiLog(large.ai, 'timeout').length > 0 && filterAiLog(large.ai, 'provider').length > 0);
  const rules = large.rules.filter(rule => rule.noticeId === large.rules[0].noticeId);
  assert.ok(filterRules(rules, { ...DEFAULT_RULE_FILTERS, evidence: 'MISSING' }).every(evidenceMissing));
  assert.ok(filterRules(rules, { ...DEFAULT_RULE_FILTERS, validation: 'FAIL' }).every(rule => rule.validation.status === 'FAIL'));
  assert.ok(filterRules(rules, { ...DEFAULT_RULE_FILTERS, changedOnly: true }).every(rule => rule.changed === true));
  assert.ok(filterRules(rules, { ...DEFAULT_RULE_FILTERS, supply: '우선' }).every(rule => rule.supplyType === '우선'));
  assert.ok(filterRules(rules, { ...DEFAULT_RULE_FILTERS, query: '기준 1' }).length > 0);
  assert.equal(changeDataAvailable(rules), true);
  assert.equal(changeDataAvailable(rules.map(rule => ({ ...rule, changed: undefined }))), false, 'changed-only is disabled without comparison data');
});

test('assessment insights turn the distribution into actions, worst first', async () => {
  const { assessmentInsights } = await import('./consoleModel.ts');
  const { demoScenario } = await import('./demoScenarios.ts');
  const insights = assessmentInsights((demoScenario('large') as Ready).snapshot.assessments);
  assert.equal(insights[0].status, 'NEEDS_USER_INPUT');
  assert.equal(insights[0].level, 'WARNING', '31.8% ≥ 30%');
  assert.match(insights[0].action, /재당첨·부적격 당첨 제한/);
  // 기본 예시(29.6%)는 기준 미만이라 경고하지 않는다
  assert.equal(assessmentInsights(CONSOLE_DEMO_SNAPSHOT.assessments)[0].level, null);
  assert.equal(insights.find(item => item.status === 'UNAVAILABLE')?.level, 'ACTION_REQUIRED');
});

test('demo scenarios stay generic and isolated', async () => {
  const { DEMO_STATES, demoScenario } = await import('./demoScenarios.ts');
  for (const state of DEMO_STATES) {
    const result = demoScenario(state);
    if (result.kind !== 'READY') continue;
    assert.ok(result.snapshot.notices.every(notice => notice.title.startsWith('[예시]')), state);
    assert.ok(result.snapshot.ai.every(event => event.question.startsWith('[예시]')), state);
  }
  const shell = readFileSync(new URL('ConsoleShell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /const demo = attached && consoleSource\(params\.demo\)\.status === 'DEMO'/);
  assert.match(shell, /const scenario = demo \? demoScenario/);
});
