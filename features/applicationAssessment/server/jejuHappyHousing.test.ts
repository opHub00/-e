import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assessApplication } from '../engine.ts';
import { knownField, createMinimalApplicantProfile } from '../../profile/domain.ts';
import { validateImportPackage } from './importPackage.ts';
import type { AssessmentInput, SupplyType } from '../types.ts';

const packageJson = JSON.parse(readFileSync(new URL('../../../data/assessment-rules/lh-jeju-ildo-samdo-happy-20260918.json', import.meta.url), 'utf8'));
const rules = validateImportPackage(packageJson).rules;
const listingId = rules.listingId;

function input(overrides: Partial<AssessmentInput['details']> = {}): AssessmentInput {
  const profile = createMinimalApplicantProfile({ name:'제주 행복주택 테스트', age:30, currentRegion:'제주특별자치도', preferredRegions:['제주특별자치도'] });
  profile.family.marriageStatus = knownField('single');
  profile.housing.currentOwnership = knownField('no-home');
  profile.housing.householdHasHome = knownField(false);
  profile.household.memberCount = knownField(1);
  return { profile, details:{
    birthDate:'1996-09-18', currentResidence:'제주특별자치도', incomeSourceRegion:'제주특별자치도',
    children:[], incomeHouseholdSize:1, householdIncome:4_000_000, totalAssets:100_000_000, vehicleValue:0,
    canProveSubscriptionByMoveIn:true, adultOrMinorHouseholdHeadException:true,
    noPublicRentalSubletRestriction:true, singleHouseholdApplicationClear:true,
    specialExceptions:[], ...overrides,
  } };
}

const result = (supply: SupplyType, assessment: AssessmentInput) => {
  const found = assessApplication(rules, assessment, listingId).find(item => item.supplyType === supply);
  assert.ok(found);
  return found;
};

test('Jeju Ildo/Samdo source package preserves document identity, evidence and schedule', () => {
  assert.equal(packageJson.document.sha256, '76c89334fb042564569d9856acd073c85a84c425f124474891bdb01303d6404e');
  assert.equal(rules.supplies.length, 5);
  assert.deepEqual(rules.supplies.map(item => item.type), ['student','youth','newlywed','senior','housingBenefit']);
  assert.equal(rules.parameters['announcement.applicationStartsAt'], '2026-10-01T10:00:00+09:00');
  assert.equal(rules.parameters['announcement.winnerAt'], '2026-12-28T16:00:00+09:00');
  assert.ok(rules.supplies.flatMap(s => s.eligibility).every(rule => rule.evidence.locator?.sha256 === packageJson.document.sha256));
});

test('representative youth is eligible in rank 1 and uses announcement thresholds', () => {
  const assessed = result('youth', input());
  assert.equal(assessed.status, 'ELIGIBLE');
  assert.equal(assessed.stage, 'PRIORITY');
  assert.equal(assessed.stageLabel, '1순위');
  assert.equal(assessed.scoring, 'NOT_APPLICABLE');
  assert.equal(assessed.failedConditions.length, 0);
});

test('representative student, senior and housing-benefit paths use the same engine', () => {
  const student = result('student', input({ educationStatus:'ENROLLED_OR_INCOMING', parentApplicantMonthlyIncome:4_000_000, schoolRegion:'제주특별자치도' }));
  assert.equal(student.status, 'ELIGIBLE');
  assert.equal(student.stageLabel, '1순위');

  const seniorInput = input({ birthDate:'1950-01-01' });
  seniorInput.profile.family.marriageStatus = knownField('married');
  assert.equal(result('senior', seniorInput).status, 'ELIGIBLE');

  const benefitInput = input({ housingBenefitRecipient:true });
  assert.equal(result('housingBenefit', benefitInput).status, 'ELIGIBLE');
  assert.equal(result('housingBenefit', benefitInput).stageLabel, '추첨');
});

test('newlywed future household, ineligible home owner and missing income stay distinct', () => {
  const newlywedInput = input({
    familyCategory:'engaged', plannedMarriageWithinDeadline:true, incomeHouseholdSize:2,
    householdIncome:6_000_000, dualIncome:false, totalAssets:200_000_000, vehicleValue:20_000_000,
  });
  assert.equal(result('newlywed', newlywedInput).status, 'ELIGIBLE');

  const ownsHome = input();
  ownsHome.profile.housing.currentOwnership = knownField('owns-home');
  assert.equal(result('youth', ownsHome).status, 'INELIGIBLE');

  const missing = input({ householdIncome:undefined });
  const needs = result('youth', missing);
  assert.equal(needs.status, 'NEEDS_MORE_INFORMATION');
  assert.ok(needs.missingInformation.includes('input:householdIncome'));
});

test('unknown threshold combinations fail closed rather than inventing a limit', () => {
  const missing = input({ incomeHouseholdSize:7 });
  const assessed = result('youth', missing);
  assert.equal(assessed.status, 'NEEDS_MORE_INFORMATION');
  assert.ok(assessed.missingInformation.includes('rule:threshold.youth.income.7.100'));
});
