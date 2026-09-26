import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { validateImportPackage } from './importPackage.ts';
import { assessApplication } from '../engine.ts';
import { createMinimalApplicantProfile, knownField, type ApplicantProfileV2 } from '../../profile/domain.ts';

/**
 * 검암역 B-1BL 대표 판정.
 *
 * gate 보완(예비신혼부부·한부모·생애최초 자녀 범위·출산가구 완화·3단계)이 실제 판정에서
 * 어떻게 나오는지 경계로 고정한다. PASS/FAIL/UNKNOWN 이 의도대로 갈리는지가 핵심이다.
 */
const rules = validateImportPackage(JSON.parse(readFileSync(new URL('../../../data/assessment-rules/ico-geomam-b1bl-2026000404.json', import.meta.url), 'utf8'))).rules;

function baseProfile(): ApplicantProfileV2 {
  const profile = createMinimalApplicantProfile({ name: '시연', age: 33, currentRegion: '인천광역시', preferredRegions: [] });
  profile.basic.birthDate = knownField('1993-05-05');
  profile.housing.currentOwnership = knownField('no-home');
  profile.housing.householdHasHome = knownField(false);
  profile.housing.hasSpecialSupplyRestriction = knownField(false);
  profile.subscriptionAccount.hasAccount = knownField(true);
  profile.household.memberCount = knownField(3);
  return profile;
}
const baseDetails = {
  accountKindEligible: true, subscriptionAccountOpenedAt: '2019-01-10', recognizedPaymentCount: 40,
  householdIncome: 7_000_000, dualIncome: false, incomeHouseholdSize: 3,
  realEstateAssets: 0, vehicleValue: 0, currentResidence: '인천광역시',
  specialSupplyHistory: false, reWinningRestriction: false, overseas: [],
  exceptions: [], children: [],
};
const assess = (profile: ApplicantProfileV2, details: Record<string, unknown>, supply: 'newlywed' | 'firstHome') =>
  assessApplication(rules, { profile, details: details as never }, rules.listingId).find(r => r.supplyType === supply)!;

test('신혼부부(기혼): 자격 충족이면 1단계 우선공급으로 판정된다', () => {
  const profile = baseProfile();
  profile.family.marriageStatus = knownField('married');
  const result = assess(profile, { ...baseDetails, familyCategory: 'married', marriageDate: '2023-06-01', specialExceptions: [], overseasStayHistory: [] }, 'newlywed');
  assert.equal(result.status, 'ELIGIBLE', result.unknownConditions.map(c => c.ruleId).join(','));
  assert.equal(result.stage, 'PRIORITY');
  assert.equal(result.failedConditions.length, 0);
});

test('예비신혼부부: 혼인 예정 증명이 되면 자격이 열린다 — 이전에는 아예 빠져 있던 경로', () => {
  const profile = baseProfile();
  profile.family.marriageStatus = knownField('single');
  const result = assess(profile, { ...baseDetails, familyCategory: 'engaged', plannedMarriageWithinDeadline: true, specialExceptions: [], overseasStayHistory: [] }, 'newlywed');
  assert.ok(result.satisfiedConditions.some(c => c.ruleId === 'newlywed.family'), '예비신혼부부가 가족 요건을 통과해야 한다');
  assert.equal(result.failedConditions.length, 0);
});

test('한부모: 만 7세 미만 자녀와 증명이 있으면 자격이 열린다', () => {
  const profile = baseProfile();
  profile.family.marriageStatus = knownField('single');
  const result = assess(profile, {
    ...baseDetails, familyCategory: 'singleParent', singleParentQualified: true,
    children: [{ birthDate: '2022-04-01', unborn: false }], specialExceptions: [], overseasStayHistory: [],
  }, 'newlywed');
  assert.ok(result.satisfiedConditions.some(c => c.ruleId === 'newlywed.family'));
  assert.equal(result.failedConditions.length, 0);
});

test('혼인 8년차에 어린 자녀도 없으면 가족 요건에서 막힌다', () => {
  const profile = baseProfile();
  profile.family.marriageStatus = knownField('married');
  const result = assess(profile, { ...baseDetails, familyCategory: 'married', marriageDate: '2017-01-01', specialExceptions: [], overseasStayHistory: [] }, 'newlywed');
  assert.ok(result.failedConditions.some(c => c.ruleId === 'newlywed.family'));
  assert.equal(result.status, 'INELIGIBLE');
});

test('소득이 오르면 단계가 1 → 2 → 3으로 내려간다', () => {
  const profile = baseProfile();
  profile.family.marriageStatus = knownField('married');
  const run = (householdIncome: number, dualIncome: boolean) =>
    assess(profile, { ...baseDetails, householdIncome, dualIncome, familyCategory: 'married', marriageDate: '2023-06-01', specialExceptions: [], overseasStayHistory: [] }, 'newlywed');
  assert.equal(run(7_000_000, false).stage, 'PRIORITY', '100% 이하');
  assert.equal(run(9_500_000, false).stage, 'GENERAL', '130% 이하');
  assert.equal(run(14_000_000, true).stage, 'LOTTERY', '맞벌이 200% 이하');
  const over = run(30_000_000, false);
  assert.equal(over.status, 'INELIGIBLE', '자격 소득 상한을 넘으면 단계 이전에 막힌다');
});

test('생애최초: 임신 중인 자녀도 자녀 범위에 들어간다', () => {
  const profile = baseProfile();
  profile.family.marriageStatus = knownField('single');
  // 과거 주택소유·소득세 납부기간은 프로필에서 오는 사실이다.
  profile.housing.previousOwnership = knownField(false);
  profile.housing.householdDisqualifyingPreviousOwnership = knownField(false);
  profile.income.workOrBusinessIncomeEligible = knownField(true);
  profile.income.incomeTaxPaymentYears = knownField(7);
  const result = assess(profile, {
    ...baseDetails, isHouseholdHead: true,
    recognizedDepositAmount: 12_000_000, subscriptionAccountOpenedAt: '2018-01-10', recognizedPaymentCount: 40,
    unmarriedChildInHousehold: true, children: [{ birthDate: '2026-12-01', unborn: true }],
    specialExceptions: [], overseasStayHistory: [],
  }, 'firstHome');
  assert.ok(result.satisfiedConditions.some(c => c.ruleId === 'firstHome.family'), '임신 자녀가 가족 요건을 통과해야 한다');
  assert.ok(result.satisfiedConditions.some(c => c.ruleId === 'firstHome.tax'), '소득세 5년 요건이 판정에 들어가야 한다');
});

test('출산가구 완화는 자동으로 통과시키지 않고 추가 확인으로 남긴다', () => {
  const profile = baseProfile();
  profile.family.marriageStatus = knownField('married');
  const result = assess(profile, { ...baseDetails, familyCategory: 'married', marriageDate: '2023-06-01', specialExceptions: [], overseasStayHistory: [] }, 'newlywed');
  const childbirth = [...result.satisfiedConditions, ...result.unknownConditions, ...result.failedConditions]
    .find(c => c.ruleId === 'newlywed.childbirth');
  assert.ok(childbirth, '출산가구 완화 규칙이 판정에 들어 있어야 한다');
});
