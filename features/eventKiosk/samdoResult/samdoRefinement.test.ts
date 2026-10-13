import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { kioskEvent } from '../kioskEvent.ts';
import { doesNotKnowPersona, evaluatePhase4Personas } from '../phase4Personas.ts';
import { containsRawKey } from '../presentation.ts';
import { samdoRawRecommendationForAnswers } from './samdoEvaluate.ts';
import {
  applySamdoResolvedFact,
  buildSamdoResolutionCenter,
  simulateSamdoRecommendation,
  type SamdoSimulationOverrides,
} from './samdoRefinement.ts';

const load = kioskEvent();
if (!load.ok) throw new Error(load.error);
const personas = evaluatePhase4Personas(load.event);
const answersOf = (id: string) => structuredClone(personas.find(item => item.personaId === id)!.finalAnswers);

test('resolution center deduplicates unresolved user facts and exposes only presentation labels', () => {
  const recommendation = samdoRawRecommendationForAnswers(doesNotKnowPersona.answers);
  const items = buildSamdoResolutionCenter(recommendation, doesNotKnowPersona.answerStates);
  assert.equal(new Set(items.map(item => item.id)).size, items.length);
  assert.ok(items.some(item => item.id === 'parentAssets' && item.currentState === 'DOES_NOT_KNOW'));
  assert.ok(items.some(item => item.id === 'specialSupplyHistory'));
  assert.ok(items.every(item => item.affectedSupplyLabels.length > 0));
  for (const item of items) {
    for (const text of [item.label, item.currentLabel, item.reason, item.help, ...item.affectedSupplyLabels]) {
      assert.equal(containsRawKey(text), false, text);
    }
  }
});

test('a confirmed resolution updates the existing answer fact and leaves the source object untouched', () => {
  const answers = answersOf('YOUNG_SINGLE');
  answers.household.parentAssets = null;
  answers.household.parentInformationStatus = 'DOES_NOT_KNOW';
  const before = structuredClone(answers);
  const resolved = applySamdoResolvedFact(answers, 'parentAssets', 300_000_000);
  assert.deepEqual(answers, before);
  assert.equal(resolved.answers.household.parentAssets, 300_000_000);
  assert.equal(resolved.answers.household.parentInformationStatus, 'KNOWN');
  assert.deepEqual(resolved.answerKeys, ['household.parentInformationStatus', 'household.parentAssets']);
  assert.equal(samdoRawRecommendationForAnswers(resolved.answers).evaluations.find(item => item.supplyType === 'YOUTH')?.eligibility, 'ELIGIBLE');
});

type Scenario = {
  id: string;
  answers: ReturnType<typeof answersOf>;
  overrides: SamdoSimulationOverrides;
  verify: (result: ReturnType<typeof simulateSamdoRecommendation>) => void;
};

const scenarios = (): Scenario[] => {
  const parentUnknown = answersOf('YOUNG_SINGLE');
  parentUnknown.household.parentAssets = null;
  parentUnknown.household.parentInformationStatus = 'DOES_NOT_KNOW';

  const paymentUnknown = answersOf('YOUNG_SINGLE');
  paymentUnknown.subscription.paymentCount = null;

  const oneYearResident = answersOf('NEWLYWED_ONE_CHILD');
  oneYearResident.applicant.residenceMonths = 12;

  const child = answersOf('NEWLYWED_ONE_CHILD');

  const overIncome = answersOf('YOUNG_SINGLE');
  overIncome.applicant.monthlyIncome = 10_000_000;
  overIncome.household.householdIncome = 10_000_000;

  return [
    {
      id: 'parent assets unknown to below-threshold assumption', answers: parentUnknown, overrides: { parentAssets: 300_000_000 },
      verify: result => {
        assert.equal(result.baseline.evaluations.find(item => item.supplyType === 'YOUTH')?.eligibility, 'CONDITIONAL');
        assert.equal(result.simulatedResult.evaluations.find(item => item.supplyType === 'YOUTH')?.eligibility, 'ELIGIBLE');
        assert.equal(result.diffs.recommendedType.after, '청년 특별공급');
      },
    },
    {
      id: 'payment count unknown to 24 assumption', answers: paymentUnknown, overrides: { paymentCount: 24 },
      verify: result => {
        assert.equal(result.baseline.evaluations.find(item => item.supplyType === 'YOUTH')?.eligibility, 'CONDITIONAL');
        assert.equal(result.simulatedResult.evaluations.find(item => item.supplyType === 'YOUTH')?.eligibility, 'ELIGIBLE');
        assert.equal(result.diffs.officialScore.after, '9/9점');
      },
    },
    {
      id: 'one-year residence to two-year assumption', answers: oneYearResident, overrides: { residenceMonths: 24 },
      verify: result => {
        assert.equal(result.diffs.recommendedType.before, '신생아 특별공급');
        assert.equal(result.diffs.recommendedType.after, '신생아 특별공급');
        assert.deepEqual(result.diffs.officialScore, { before: '9/12점', after: '10/12점', changed: true });
      },
    },
    {
      id: 'newlywed child date assumption', answers: child, overrides: { childBirthDate: '2020-01-01' },
      verify: result => {
        assert.equal(result.diffs.recommendedType.before, '신생아 특별공급');
        assert.equal(result.diffs.recommendedType.after, '생애최초 특별공급');
        assert.ok(result.diffs.noLongerEligibleTypes.includes('신생아 특별공급'));
      },
    },
    {
      id: 'over-income to below-threshold assumption', answers: overIncome, overrides: { monthlyIncome: 2_500_000, householdIncome: 2_500_000 },
      verify: result => {
        assert.equal(result.baseline.recommendedType, null);
        assert.equal(result.diffs.recommendedType.after, '청년 특별공급');
        assert.ok(result.diffs.newlyEligibleTypes.includes('청년 특별공급'));
      },
    },
  ];
};

test('five required simulations preserve baseline, use the same evaluator, and reset exactly', () => {
  for (const scenario of scenarios()) {
    const original = structuredClone(scenario.answers);
    const result = simulateSamdoRecommendation(scenario.answers, scenario.overrides);
    assert.deepEqual(scenario.answers, original, `${scenario.id}: baseline answers mutated`);
    assert.deepEqual(result.overrides, scenario.overrides);
    scenario.verify(result);
    const reset = simulateSamdoRecommendation(scenario.answers, {});
    assert.deepEqual(reset.simulatedResult, reset.baseline, `${scenario.id}: reset did not restore baseline`);
    assert.deepEqual(reset.baseline, result.baseline, `${scenario.id}: baseline changed after simulation`);
  }
});

