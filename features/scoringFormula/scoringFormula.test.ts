import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateScore, componentMax, formulaMax, interpretationFor, isServiceReady, matchBand, publishedFormulaFor,
  runTestCases, summarizeFormula, validateFormula, type ScoringComponent, type ScoringFormula,
} from './domain.ts';
import { loadFormulas, scoringFormula } from './registry.ts';

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

test('검수 전 산식은 사용자에게 내보내지 않는다', () => {
  const standard = scoringFormula('general-private-standard')!;
  assert.equal(standard.status, 'REVIEW', '사람이 검수하기 전에는 활성이 아니다');
  assert.equal(standard.publishedToUsers, false);
  assert.equal(publishedFormulaFor(loadFormulas(), 'generalPrivate'), null, '아직 서비스에 연결되지 않았다');
});
