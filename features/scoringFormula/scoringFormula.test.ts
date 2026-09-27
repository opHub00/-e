import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  calculateScore, componentMax, formulaMax, interpretationFor, isServiceReady, matchBand, publishedFormulaFor,
  runTestCases, summarizeFormula, validateFormula, type ScoringComponent, type ScoringFormula,
} from './domain.ts';
import { loadFormulas, scoringFormula } from './registry.ts';
import {
  activationChecks, addBand, canActivate, clearDraft, editBand, removeBand, removeTestCase, setStatus,
  upsertTestCase, withDraft, writeDraft,
} from './draftStore.ts';
import { SCORING_RPC, scoringErrorMessage } from './repository.ts';
import { buildScoringSeedPackage, verifyScoringSeedPackage } from './seedPackage.ts';

const component = (over: Partial<ScoringComponent> = {}): ScoringComponent => ({
  id: 'period', label: '무주택 기간', description: '', unit: '개월', fact: 'noHomeMonths', order: 1,
  bands: [
    { max: 11, points: 2, label: '1년 미만' },
    { min: 12, max: 23, points: 4, label: '1년 이상 2년 미만' },
    { min: 24, points: 6, label: '2년 이상' },
  ],
  ...over,
});

const formula = (over: Partial<ScoringFormula> = {}): ScoringFormula => ({
  id: 'f1', name: '테스트 산식', description: '', targets: ['generalPrivate'], version: '1.0.0',
  status: 'ACTIVE', publishedToUsers: true, legalBasis: '테스트 근거',
  components: [component()],
  interpretations: [
    { minTotal: 5, headline: '높아요', detail: '' },
    { minTotal: 0, headline: '낮아요', detail: '' },
  ],
  testCases: [{ id: 't1', label: '2년', inputs: { period: 24 }, expectedTotal: 6 }],
  history: [], updatedAt: '2026-09-27',
  ...over,
});

test('구간을 찾아 점수를 더한다', () => {
  const result = calculateScore(formula(), { period: 18 });
  assert.equal(result.total, 4);
  assert.equal(result.max, 6);
  assert.equal(result.breakdown[0].bandLabel, '1년 이상 2년 미만');
  assert.equal(result.problems.length, 0);
});

test('경계값은 구간 안에 든다', () => {
  assert.equal(calculateScore(formula(), { period: 11 }).total, 2);
  assert.equal(calculateScore(formula(), { period: 12 }).total, 4);
  assert.equal(calculateScore(formula(), { period: 23 }).total, 4);
  assert.equal(calculateScore(formula(), { period: 24 }).total, 6);
});

test('값을 모르면 0 점으로 세지 않고 총점을 비운다', () => {
  const result = calculateScore(formula(), {});
  assert.equal(result.total, null, '모르는 값을 0 점으로 세면 거짓말이 된다');
  assert.equal(result.breakdown[0].points, null);
  assert.match(result.problems[0], /값이 아직 없어요/);
  assert.equal(result.interpretation, null, '총점이 없으면 해석도 없다');
});

test('구간이 겹치거나 비면 점수를 고르지 않는다', () => {
  const overlapping = formula({ components: [component({ bands: [
    { max: 20, points: 2, label: 'A' }, { min: 10, points: 4, label: 'B' },
  ] })] });
  const result = calculateScore(overlapping, { period: 15 });
  assert.equal(result.total, null);
  assert.match(result.problems[0], /겹쳐/);

  const gapped = formula({ components: [component({ bands: [
    { max: 10, points: 2, label: 'A' }, { min: 30, points: 4, label: 'B' },
  ] })] });
  assert.equal(calculateScore(gapped, { period: 20 }).total, null);
  assert.match(calculateScore(gapped, { period: 20 }).problems[0], /어느 구간에도 들지 않아요/);
});

test('해석 문구는 총점 이하의 가장 높은 기준을 고른다', () => {
  assert.equal(interpretationFor(formula(), 6)?.headline, '높아요');
  assert.equal(interpretationFor(formula(), 4)?.headline, '낮아요');
  assert.equal(interpretationFor(formula({ interpretations: [{ minTotal: 10, headline: 'x', detail: '' }] }), 4), null);
});

test('표의 빈틈·겹침·잘못된 점수를 저장 전에 알려준다', () => {
  assert.deepEqual(validateFormula(formula()), []);

  const gap = validateFormula(formula({ components: [component({ bands: [
    { max: 10, points: 2, label: 'A' }, { min: 30, points: 4, label: 'B' },
  ] })] }));
  assert.ok(gap.some(problem => /빈틈/.test(problem.message)));

  const overlap = validateFormula(formula({ components: [component({ bands: [
    { max: 20, points: 2, label: 'A' }, { min: 10, points: 4, label: 'B' },
  ] })] }));
  assert.ok(overlap.some(problem => /겹쳐/.test(problem.message)));

  const negative = validateFormula(formula({ components: [component({ bands: [{ points: -1, label: 'A' }] })] }));
  assert.ok(negative.some(problem => /0 이상/.test(problem.message)));

  const noBasis = validateFormula(formula({ legalBasis: '' }));
  assert.ok(noBasis.some(problem => /근거/.test(problem.message)), '근거 없는 산식은 막는다');
});

test('저장해 둔 예시를 한 번에 돌려 본다', () => {
  const runs = runTestCases(formula());
  assert.equal(runs.length, 1);
  assert.equal(runs[0].passed, true);

  const broken = runTestCases(formula({ testCases: [{ id: 't', label: 'x', inputs: { period: 24 }, expectedTotal: 99 }] }));
  assert.equal(broken[0].passed, false);
  assert.equal(broken[0].actualTotal, 6);
});

test('활성이어도 표나 예시가 어긋나면 서비스에 쓰지 않는다', () => {
  assert.equal(isServiceReady(formula()), true);
  assert.equal(isServiceReady(formula({ status: 'REVIEW' })), false);
  assert.equal(isServiceReady(formula({ testCases: [{ id: 't', label: 'x', inputs: { period: 24 }, expectedTotal: 99 }] })), false);
  assert.equal(isServiceReady(formula({ legalBasis: '' })), false);
});

test('사용자 화면에는 공개된 산식만 내보낸다', () => {
  assert.equal(publishedFormulaFor([formula()], 'generalPrivate')?.id, 'f1');
  assert.equal(publishedFormulaFor([formula({ publishedToUsers: false })], 'generalPrivate'), null);
  assert.equal(publishedFormulaFor([formula()], 'newlywed'), null);
});

test('목록에 쓸 요약을 만든다', () => {
  const summary = summarizeFormula(formula());
  assert.equal(summary.maxScore, 6);
  assert.equal(summary.componentCount, 1);
  assert.equal(summary.testsPassed, 1);
  assert.equal(summary.testsTotal, 1);
  assert.equal(summary.problemCount, 0);
  assert.equal(componentMax(component()), 6);
  assert.equal(formulaMax(formula()), 6);
  assert.equal(matchBand(component(), 18)?.points, 4);
});

test('등록된 법정 배점표가 84점 만점으로 맞는다', () => {
  const formulas = loadFormulas();
  assert.equal(formulas.length >= 1, true);
  const standard = scoringFormula('general-private-standard');
  assert.ok(standard, '민영 일반공급 산식이 있어야 한다');
  assert.equal(formulaMax(standard!), 84);
  assert.deepEqual(validateFormula(standard!), [], '법정 배점표에 빈틈이나 겹침이 없어야 한다');
  assert.ok(runTestCases(standard!).every(run => run.passed), '저장된 예시가 모두 맞아야 한다');
  assert.ok(standard!.legalBasis.includes('주택공급에 관한 규칙'));

  // 항목별 만점은 법령 배점과 같아야 한다.
  const maxOf = (id: string) => componentMax(standard!.components.find(item => item.id === id)!);
  assert.equal(maxOf('noHomePeriod'), 32);
  assert.equal(maxOf('dependents'), 35);
  assert.equal(maxOf('accountPeriod'), 17);
});

test('84점 산식의 모든 경계값과 unknown을 검증한다', () => {
  const standard = scoringFormula('general-private-standard')!;
  for (const component of standard.components) {
    for (const band of component.bands) {
      for (const candidate of [band.min, band.max].filter((item): item is number => item !== undefined)) {
        assert.equal(matchBand(component, candidate)?.points, band.points, `${component.id} ${candidate}`);
        if (candidate > 0) assert.ok(matchBand(component, candidate - 1), `${component.id} ${candidate - 1}`);
        assert.ok(matchBand(component, candidate + 1), `${component.id} ${candidate + 1}`);
      }
    }
  }
  assert.equal(calculateScore(standard, { noHomePeriod: null, dependents: 6, accountPeriod: 180 }).total, null);
  assert.equal(calculateScore(standard, { noHomePeriod: 999, dependents: 99, accountPeriod: 999 }).total, 84);
  assert.equal(calculateScore(standard, { noHomeMonths: 999, dependentCount: 99, subscriptionMonths: 999 }).total, 84, 'canonical fact keys work');
  assert.equal(calculateScore(standard, { noHomePeriod: 0, dependents: 0, accountPeriod: 0 }).total, 8);
});

test('시드 패키지는 결정적이고 IN_REVIEW·비공개로 고정된다', () => {
  const standard = scoringFormula('general-private-standard')!;
  const first = buildScoringSeedPackage(standard), second = buildScoringSeedPackage(structuredClone(standard));
  assert.equal(first.sourcePackageHash, second.sourcePackageHash);
  assert.equal(first.formula.status, 'IN_REVIEW');
  assert.equal(first.formula.publishedToUsers, false);
  assert.doesNotThrow(() => verifyScoringSeedPackage(first));
  assert.throws(() => verifyScoringSeedPackage({ ...first, sourcePackageHash: '0'.repeat(64) }), /STALE_SCORING_SEED_PACKAGE/);
});

test('검수 전 산식은 사용자에게 내보내지 않는다', () => {
  const standard = scoringFormula('general-private-standard')!;
  assert.equal(standard.status, 'REVIEW', '사람이 검수하기 전에는 활성이 아니다');
  assert.equal(standard.publishedToUsers, false);
  assert.equal(publishedFormulaFor(loadFormulas(), 'generalPrivate'), null, '아직 서비스에 연결되지 않았다');
});

test('초안은 배포본을 덮어쓰지 않고 브라우저에만 남는다', () => {
  const base = scoringFormula('general-private-standard')!;
  clearDraft(base.id);
  assert.equal(withDraft(base).isDraft, false, '초안이 없으면 배포본 그대로다');

  const edited = setStatus(base, 'DRAFT');
  writeDraft(edited);
  const loaded = withDraft(base);
  assert.equal(loaded.isDraft, true);
  assert.equal(loaded.formula.status, 'DRAFT');
  assert.equal(scoringFormula('general-private-standard')!.status, 'REVIEW', '배포본은 그대로여야 한다');

  clearDraft(base.id);
  assert.equal(withDraft(base).isDraft, false);
});

test('구간을 더하고 고치고 지울 수 있다', () => {
  const base = scoringFormula('general-private-standard')!;
  const added = addBand(base, 'dependents');
  const component = added.components.find(item => item.id === 'dependents')!;
  assert.equal(component.bands.length, base.components.find(item => item.id === 'dependents')!.bands.length + 1);
  assert.equal(component.bands.at(-1)!.label, '새 구간');
  assert.ok(added.history.length > base.history.length, '무엇을 바꿨는지 이력에 남는다');

  const fixed = editBand(added, 'dependents', component.bands.length - 1, { points: 40, label: '7명 이상' });
  assert.equal(fixed.components.find(item => item.id === 'dependents')!.bands.at(-1)!.points, 40);

  const removed = removeBand(fixed, 'dependents', component.bands.length - 1);
  assert.equal(removed.components.find(item => item.id === 'dependents')!.bands.length, component.bands.length - 1);
});

test('예시를 운영자가 직접 더하고 지울 수 있다', () => {
  const base = scoringFormula('general-private-standard')!;
  const added = upsertTestCase(base, {
    id: 'case-new', label: '무주택 10년 / 부양 3명 / 통장 10년',
    inputs: { noHomePeriod: 120, dependents: 3, accountPeriod: 120 }, expectedTotal: 22 + 20 + 12,
  });
  assert.equal(added.testCases.length, base.testCases.length + 1);
  assert.ok(runTestCases(added).every(run => run.passed), '법정 배점표로 계산한 기대값이 맞아야 한다');

  const changed = upsertTestCase(added, { ...added.testCases.at(-1)!, expectedTotal: 1 });
  assert.equal(changed.testCases.length, added.testCases.length, '같은 id 는 덮어쓴다');
  assert.equal(runTestCases(changed).some(run => !run.passed), true);

  assert.equal(removeTestCase(changed, 'case-new').testCases.length, base.testCases.length);
});

test('활성화는 여섯 가지 검사를 모두 통과해야 열린다', () => {
  const base = scoringFormula('general-private-standard')!;
  const keys = activationChecks(base).map(check => check.key);
  assert.deepEqual(keys, ['basics', 'overlap', 'gap', 'negative', 'max', 'tests']);
  assert.equal(canActivate(base), true, '등록된 법정 배점표는 활성화할 수 있어야 한다');

  // 구간을 겹치게 만들면 활성화가 막힌다.
  const overlapping = editBand(base, 'dependents', 1, { min: 0 });
  assert.equal(canActivate(overlapping), false);
  assert.equal(activationChecks(overlapping).find(check => check.key === 'overlap')?.passed, false);

  // 점수를 음수로 만들어도 막힌다.
  const negative = editBand(base, 'dependents', 0, { points: -5 });
  assert.equal(activationChecks(negative).find(check => check.key === 'negative')?.passed, false);

  // 예시가 하나도 없으면 막힌다.
  const noTests = { ...base, testCases: [] };
  assert.equal(activationChecks(noTests).find(check => check.key === 'tests')?.passed, false);

  // 기대값이 틀린 예시가 있어도 막힌다.
  const badTest = upsertTestCase(base, { ...base.testCases[0], expectedTotal: 1 });
  assert.equal(canActivate(badTest), false);
});

test('산식 저장소 계약이 migration 과 같은 이름을 쓴다', async () => {
  const sql = await readFile(new URL('../../supabase/migrations/20260927120000_scoring_formulas.sql', import.meta.url), 'utf8');
  for (const name of Object.values(SCORING_RPC)) {
    assert.ok(sql.includes(`function public.${name}(`), `${name} 이 migration 에 없다`);
  }
  // 저장소가 돌려줄 수 있는 오류는 전부 운영자 말로 옮겨 둔다.
  for (const code of ['SCORING_VERSION_IMMUTABLE', 'SCORING_SCOPE_ALREADY_ACTIVE', 'SCORING_FORMULA_NOT_FOUND', 'SCORING_STALE_REVISION', 'SCORING_VALIDATION_FAILED', 'SCORING_TEST_CASE_FAILED']) {
    assert.ok(sql.includes(code), `${code} 를 내는 곳이 migration 에 없다`);
    assert.notEqual(scoringErrorMessage(code), `처리하지 못했어요 (${code}).`, `${code} 의 안내 문구가 없다`);
  }
  assert.match(scoringErrorMessage('UNKNOWN_CODE'), /처리하지 못했어요/);
});

test('migration 이 발행본 불변·적용범위당 활성 하나·감사 로그를 지킨다', async () => {
  const sql = await readFile(new URL('../../supabase/migrations/20260927120000_scoring_formulas.sql', import.meta.url), 'utf8');
  for (const table of ['scoring_formulas', 'scoring_formula_items', 'scoring_formula_bands', 'scoring_formula_test_cases', 'scoring_formula_audit_logs']) {
    assert.ok(sql.includes(`create table public.${table}`), `${table} 표가 없다`);
    assert.ok(sql.includes(`alter table public.${table} enable row level security`), `${table} 에 RLS 가 없다`);
  }
  assert.ok(sql.includes('guard_scoring_version_immutable'), '발행본 전체를 잠그는 트리거가 없다');
  assert.ok(sql.includes('scoring_one_active_scope_idx'), '동시성에도 안전한 partial unique index가 없다');
  assert.ok(sql.includes('guard_scoring_audit_append_only'), '감사 로그를 추가 전용으로 두는 트리거가 없다');
  // 권한은 새로 만들지 않고 기존 판정을 그대로 쓴다.
  assert.ok(sql.includes('assert_assessment_review_access'), '기존 권한 판정을 쓰지 않는다');
  // 사용자 앱에는 공개된 활성 버전만 보인다.
  assert.ok(sql.includes("using (status = 'ACTIVE' and published_to_users)"), '초안이 사용자에게 새어 나갈 수 있다');
  assert.ok(sql.includes("status in ('DRAFT','IN_REVIEW','ACTIVE','RETIRED')"));
  assert.ok(sql.includes("pg_advisory_xact_lock"), '활성화 경쟁을 직렬화하지 않는다');
  assert.ok(sql.includes("grant execute on function public.seed_scoring_formula_package(jsonb,boolean) to service_role"));
});
