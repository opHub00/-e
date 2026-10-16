import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { auditDiff, buildDashboard, filterAi, percent } from './consoleModel.ts';
import { CONSOLE_DEMO_SNAPSHOT } from './demoData.ts';

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
  assert.match(source, /export function connectedSnapshot\(\): ConsoleSnapshot \| null \{\s*return null;/);
  // 개인정보로 읽힐 값이 예시 데이터에 없다
  assert.ok(!/\d{6}-\d{7}|010-\d{4}|@[a-z]+\./.test(JSON.stringify(CONSOLE_DEMO_SNAPSHOT)));
});
