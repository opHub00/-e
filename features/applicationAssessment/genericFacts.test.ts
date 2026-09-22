import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMinimalApplicantProfile, knownField } from '../profile/domain.ts';
import { buildFacts } from './facts.ts';
import { score as decodeScore } from './data/validation.ts';
import { DeterministicConsultationInterpreter } from './consultation/interpreter.ts';
import type { AssessmentInput } from './types.ts';

// 공고와 무관한 범용 사실·배점 규칙. 수치는 설명용이며 어떤 공고의 값도 아니다.
const profile = () => {
  const p = createMinimalApplicantProfile({ name: '검증용', age: 30, currentRegion: '서울특별시', preferredRegions: [] });
  p.family.marriageStatus = knownField('married');
  return p;
};
const facts = (details: AssessmentInput['details'], parameters = {}) => buildFacts({ profile: profile(), details }, '2026-01-01', null, parameters);

test('income score eligibility reads the announcement percentages and fails closed without them', () => {
  const params = { 'income.3.80': 5_000_000, 'income.3.100': 6_000_000, 'incomeScore.singlePercent': 80, 'incomeScore.dualPercent': 100 };
  assert.equal(facts({ incomeHouseholdSize: 2, householdIncome: 4_900_000, dualIncome: false }, params).householdIncomeScoreEligible, 1);
  assert.equal(facts({ incomeHouseholdSize: 2, householdIncome: 5_100_000, dualIncome: false }, params).householdIncomeScoreEligible, 0);
  assert.equal(facts({ incomeHouseholdSize: 3, householdIncome: 5_900_000, dualIncome: true }, params).householdIncomeScoreEligible, 1);
  assert.equal(facts({ incomeHouseholdSize: 3, householdIncome: 4_000_000, dualIncome: false }, {}).householdIncomeScoreEligible, undefined, 'no percentage, no guess');
  assert.equal(facts({ incomeHouseholdSize: 3, householdIncome: 4_000_000 }, params).householdIncomeScoreEligible, undefined, 'dual income unknown');
});

test('family-type score items are -1 when not applicable and unknown when the family type is unknown', () => {
  const married = facts({ familyCategory: 'married', marriageDate: '2023-01-01', children: [{ birthDate: '2024-01-01', unborn: false }] });
  assert.equal(married.newlywedMarriageScoreMonths, 36);
  assert.equal(married.singleParentChildScoreMonths, -1);
  const single = facts({ familyCategory: 'singleParent', children: [{ birthDate: '2024-01-01', unborn: false }] });
  assert.equal(single.newlywedMarriageScoreMonths, -1);
  assert.equal(single.singleParentChildScoreMonths, 24);
  const engaged = facts({ familyCategory: 'engaged' });
  assert.equal(engaged.newlywedMarriageScoreMonths, -1);
  assert.equal(engaged.singleParentChildScoreMonths, -1);
  const unknownProfile = createMinimalApplicantProfile({ name: '검증용', age: 30, currentRegion: '서울특별시', preferredRegions: [] });
  const unknown = buildFacts({ profile: unknownProfile, details: {} }, '2026-01-01');
  assert.equal(unknown.newlywedMarriageScoreMonths, undefined);
  assert.equal(unknown.singleParentChildScoreMonths, undefined);
});

test('real estate and vehicle value are separate integer-won facts', () => {
  const f = facts({ realEstateAssets: 100_000_000, vehicleValue: 0 }, { 'amounts.integerWon': true });
  assert.equal(f.realEstateAssets, 100_000_000);
  assert.equal(f.vehicleValue, 0);
  assert.equal(facts({ realEstateAssets: 1.5 }, { 'amounts.integerWon': true }).realEstateAssets, undefined);
  assert.equal(facts({ vehicleValue: -1 }).vehicleValue, undefined, 'negative amounts are never a sentinel');
});

test('a notApplicable band must score 0 and is kept by the decoder', () => {
  const evidence = { id: 'e', source: 's', section: 's', label: 'l' };
  const decoded = decodeScore('x.PRIORITY.item', { label: 'item', fact: 'newlywedMarriageScoreMonths', bands: [{ min: -1, max: -1, points: 0, notApplicable: true }, { min: 0, points: 2 }] }, evidence);
  assert.deepEqual(decoded.bands?.[0], { min: -1, max: -1, points: 0, notApplicable: true });
  assert.throws(() => decodeScore('x', { label: 'item', fact: 'newlywedMarriageScoreMonths', bands: [{ min: -1, max: -1, points: 1, notApplicable: true }] }, evidence), /notApplicable/);
  assert.throws(() => decodeScore('x', { label: 'item', fact: 'newlywedMarriageScoreMonths', bands: [{ min: -1, max: -1, points: 0, notApplicable: false }] }, evidence), /notApplicable/);
});

test('consultation reads real estate and vehicle amounts without folding them into total assets', async () => {
  const interpreter = new DeterministicConsultationInterpreter();
  const fields = async (message: string) => (await interpreter.interpret({ message })).updates;
  const a = await fields('부동산은 1억 2천만원이고 차량가액은 3천만원이에요');
  assert.ok(a.some(u => u.field === 'realEstateAssets' && u.value === 120_000_000));
  assert.ok(a.some(u => u.field === 'vehicleValue' && u.value === 30_000_000));
  assert.equal(a.some(u => u.field === 'totalAssets'), false);
  const b = await fields('차는 없어요. 부동산도 없어요.');
  assert.ok(b.some(u => u.field === 'vehicleValue' && u.value === 0));
  assert.ok(b.some(u => u.field === 'realEstateAssets' && u.value === 0));
  assert.equal((await fields('차 사면 불리해요?')).some(u => u.field === 'vehicleValue'), false);
  assert.equal((await fields('자동차는 대충 2천만원 정도예요')).some(u => u.field === 'vehicleValue'), false);
  assert.ok((await fields('총자산은 2억원입니다')).some(u => u.field === 'totalAssets' && u.value === 200_000_000));
});
