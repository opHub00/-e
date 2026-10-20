import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assessApplication } from '../engine.ts';
import { knownField, createMinimalApplicantProfile } from '../../profile/domain.ts';
import { validateImportPackage } from './importPackage.ts';
import { buildAssessmentReviewSeed } from '../../assessmentRuleReview/seed/buildAssessmentReviewSeed.ts';
import { decodeReviewSeedAnnotation } from '../../assessmentRuleReview/seed/annotations.ts';
import type { AssessmentInput, SupplyType } from '../types.ts';

const load = (name: string) => JSON.parse(readFileSync(new URL(`../../../data/assessment-rules/${name}`, import.meta.url), 'utf8'));
const oldPackage = load('lh-jeju-ildo-samdo-happy-20260918.json');
const v2Package = load('lh-jeju-ildo-samdo-happy-20260918.v2.json');
const v1 = validateImportPackage(oldPackage).rules;
const v2 = validateImportPackage(v2Package).rules;
const annotations = decodeReviewSeedAnnotation(load('lh-jeju-ildo-samdo-happy-20260918.v2.review-annotations.json'));
const diff = load('lh-jeju-ildo-samdo-happy-20260918.v2.review-diff.json');
const reviewCandidate = load('lh-jeju-ildo-samdo-happy-20260918.v2.review-candidate.json');

function input(overrides: Partial<AssessmentInput['details']> = {}): AssessmentInput {
  const profile = createMinimalApplicantProfile({ name:'검수용', age:30, currentRegion:'제주특별자치도', preferredRegions:['제주특별자치도'] });
  profile.family.marriageStatus = knownField('single');
  profile.housing.currentOwnership = knownField('no-home');
  profile.housing.householdHasHome = knownField(false);
  profile.household.memberCount = knownField(1);
  return { profile, details: {
    birthDate:'1996-09-18', currentResidence:'제주특별자치도', incomeSourceRegion:'제주특별자치도',
    children:[], incomeHouseholdSize:1, householdIncome:4_000_000, monthlyIncome:4_000_000,
    totalAssets:100_000_000, applicantTotalAssets:100_000_000,
    vehicleValue:0, applicantVehicleValue:0, applicantOwnsVehicle:false, isHouseholdHead:true,
    applicantCanProveSubscriptionByMoveIn:true, spouseCanProveSubscriptionByMoveIn:false,
    canProveSubscriptionByMoveIn:true, adultOrMinorHouseholdHeadException:true,
    noPublicRentalSubletRestriction:true, singleHouseholdApplicationClear:true,
    specialExceptions:[], ...overrides,
  } };
}
function result(supply: SupplyType, assessment: AssessmentInput) {
  const found = assessApplication(v2, assessment, v2.listingId).find(item => item.supplyType === supply);
  assert.ok(found);
  return found;
}

test('v1 is immutable and v2 is a separate official-source review candidate', () => {
  assert.notEqual(v2Package.ruleSet.id, oldPackage.ruleSet.id);
  assert.notEqual(v2Package.document.id, oldPackage.document.id);
  assert.equal(v2Package.document.sha256, oldPackage.document.sha256);
  assert.equal(v2Package.document.isOfficial, true);
  assert.equal(v2Package.ruleSet.sourceStatus, 'OFFICIAL_VERIFIED');
  assert.equal(v2Package.rules.length, 44);
  assert.equal(diff.previousRuleSetVersion, oldPackage.ruleSet.version);
  assert.equal(diff.activation, 'PROHIBITED_UNTIL_AUTHENTICATED_REVIEW_APPROVAL');
  assert.equal(buildAssessmentReviewSeed(v2Package, annotations).rules.length, 44);
  assert.equal(reviewCandidate.status, 'REVIEW_CANDIDATE');
  assert.equal(reviewCandidate.approved, false);
  assert.equal(reviewCandidate.active, false);
});

test('review candidate exhausts all 9 manual parameters, 22 warnings and 18 changed rules', () => {
  assert.equal(reviewCandidate.source.sha256, v2Package.document.sha256);
  assert.deepEqual(reviewCandidate.manualParameters.map((item: {parameterId:string}) => item.parameterId).sort(),
    load('lh-jeju-ildo-samdo-happy-20260918.v2.parameter-audit.json').findings.map((item: {key:string}) => item.key).sort());
  assert.equal(reviewCandidate.warnings.length, 22);
  assert.ok(reviewCandidate.warnings.every((item: {classification:string; recommendedAction:string}) => item.classification && item.recommendedAction));
  assert.deepEqual(reviewCandidate.semanticChanges.map((item: {ruleId:string}) => item.ruleId), diff.changedRuleIds);
  assert.equal(reviewCandidate.unresolved.decision, 'UNRESOLVED_BLOCKER');
});

test('all five supplies have unique, connected rules with hash-bound locators', () => {
  const keys = v2Package.rules.map((rule: {ruleKey:string}) => rule.ruleKey);
  assert.equal(new Set(keys).size, 44);
  assert.equal(new Set(v2Package.rules.map((rule: {supplyType:string}) => rule.supplyType)).size, 5);
  const connected = new Set(v2.supplies.flatMap(supply => [
    ...supply.eligibility.map(rule => rule.id),
    ...supply.stages.flatMap(stage => [...stage.conditions, ...(stage.scores ?? [])].map(rule => rule.id)),
  ]));
  assert.ok(keys.every((key: string) => connected.has(key)));
  assert.ok(v2Package.rules.every((rule: {evidence:{documentId:string;locator:{sha256:string}}}) =>
    rule.evidence.documentId === v2Package.document.id && rule.evidence.locator.sha256 === v2Package.document.sha256));
  assert.ok(annotations.safetyBlockers.length > 0);
  assert.equal(buildAssessmentReviewSeed(v2Package, annotations).rules.find(rule => rule.ruleId === 'newlywed.income')?.candidateStatus, 'REVIEW_REQUIRED');
});

test('rank-1 evidence cites the correct official PDF table cells', () => {
  const youth = v2Package.rules.find((rule: {ruleKey:string}) => rule.ruleKey === 'youth.rank1');
  const newlywed = v2Package.rules.find((rule: {ruleKey:string}) => rule.ruleKey === 'newlywed.rank1');
  assert.equal(youth.evidence.pageNumber, 5);
  assert.equal(youth.evidence.locator.tables[0].id, 't00019');
  assert.match(youth.evidence.textExcerpt, /소득 근거지/);
  assert.equal(newlywed.evidence.pageNumber, 6);
  assert.equal(newlywed.evidence.locator.tables[0].id, 't00021');
  assert.match(newlywed.evidence.textExcerpt, /예비배우자/);
});

test('student applicant-plus-parents income size and applicant-only property are not inferred', () => {
  const missing = result('student', input({ educationStatus:'ENROLLED_OR_INCOMING', parentApplicantMonthlyIncome:7_000_000 }));
  assert.equal(missing.status, 'NEEDS_MORE_INFORMATION');
  assert.ok(missing.missingInformation.includes('input:parentApplicantIncomeHouseholdSize'));
  const known = result('student', input({ educationStatus:'ENROLLED_OR_INCOMING', parentApplicantMonthlyIncome:7_000_000,
    parentApplicantIncomeHouseholdSize:3, schoolRegion:'제주특별자치도' }));
  assert.equal(known.status, 'ELIGIBLE');
});

test('youth household member uses own income/assets/vehicle, head uses household amounts', () => {
  const member = input({ isHouseholdHead:false, monthlyIncome:4_000_000, householdIncome:20_000_000,
    applicantTotalAssets:100_000_000, totalAssets:500_000_000, applicantVehicleValue:0, vehicleValue:60_000_000 });
  assert.equal(result('youth', member).status, 'ELIGIBLE');
  member.details.isHouseholdHead = true;
  assert.equal(result('youth', member).status, 'INELIGIBLE');
  member.details.isHouseholdHead = undefined;
  const unknown = result('youth', member);
  assert.equal(unknown.status, 'NEEDS_MORE_INFORMATION');
  assert.ok(unknown.missingInformation.includes('input:isHouseholdHead'));
});

test('youth one-person income threshold is inclusive at the official table cell', () => {
  const applicant = input({ isHouseholdHead:false, monthlyIncome:4_576_036,
    householdIncome:20_000_000, applicantTotalAssets:100_000_000, applicantVehicleValue:0 });
  assert.equal(result('youth', applicant).status, 'ELIGIBLE');
  applicant.details.monthlyIncome = 4_576_037;
  assert.equal(result('youth', applicant).status, 'INELIGIBLE');
});

test('engaged couple uses future household, not present household, and spouse can satisfy rank', () => {
  const engaged = input({ familyCategory:'engaged', plannedMarriageWithinDeadline:true,
    incomeHouseholdSize:1, householdIncome:20_000_000, totalAssets:500_000_000, vehicleValue:60_000_000,
    futureHouseholdNoHome:true, futureHouseholdIncomeSize:2, futureHouseholdIncome:6_000_000,
    futureHouseholdDualIncome:false, futureHouseholdTotalAssets:200_000_000, futureHouseholdVehicleValue:0,
    currentResidence:'서울특별시', incomeSourceRegion:'서울특별시', spouseResidence:'제주특별자치도' });
  engaged.profile.housing.householdHasHome = knownField(true);
  const assessed = result('newlywed', engaged);
  assert.equal(assessed.status, 'ELIGIBLE');
  assert.equal(assessed.stage, 'PRIORITY');
  engaged.details.futureHouseholdIncome = undefined;
  const unknown = result('newlywed', engaged);
  assert.equal(unknown.status, 'NEEDS_MORE_INFORMATION');
  assert.ok(unknown.missingInformation.includes('input:futureHouseholdIncome'));
});

test('single-parent applicant cannot borrow a spouse account', () => {
  const parent = input({ familyCategory:'singleParent', singleParentQualified:true,
    children:[{birthDate:'2024-01-01',unborn:false}], incomeHouseholdSize:2, householdIncome:6_000_000,
    applicantCanProveSubscriptionByMoveIn:false, spouseCanProveSubscriptionByMoveIn:true });
  assert.equal(result('newlywed', parent).status, 'INELIGIBLE');
  parent.details.applicantCanProveSubscriptionByMoveIn = undefined;
  assert.equal(result('newlywed', parent).status, 'NEEDS_MORE_INFORMATION');
});

test('a missing official newlywed one-person income cell cannot inherit a default percentage', () => {
  const engaged = input({ familyCategory:'engaged', plannedMarriageWithinDeadline:true,
    futureHouseholdNoHome:true, futureHouseholdIncomeSize:1, futureHouseholdIncome:4_000_000,
    futureHouseholdDualIncome:false, futureHouseholdTotalAssets:100_000_000,
    futureHouseholdVehicleValue:0 });
  const assessed = result('newlywed', engaged);
  assert.equal(assessed.status, 'NEEDS_MORE_INFORMATION');
  assert.ok(assessed.missingInformation.includes('rule:threshold.newlywed.incomePercent.single.1'));
});

test('student no-car condition is ownership, not a zero-won vehicle ceiling', () => {
  for (const band of [0, 1, 2]) {
    assert.equal(v2Package.ruleSet.config.parameters[`threshold.student.vehicle.${band}`], null);
  }
  const applicant = input({ educationStatus:'ENROLLED_OR_INCOMING', parentApplicantMonthlyIncome:7_000_000,
    parentApplicantIncomeHouseholdSize:3, schoolRegion:'제주특별자치도', applicantVehicleValue:0 });
  assert.equal(result('student', applicant).status, 'ELIGIBLE');
  applicant.details.applicantVehicleValue = 0;
  applicant.details.applicantOwnsVehicle = true;
  assert.equal(result('student', applicant).status, 'INELIGIBLE');
  applicant.details.applicantOwnsVehicle = undefined;
  const unknown = result('student', applicant);
  assert.equal(unknown.status, 'NEEDS_MORE_INFORMATION');
  assert.ok(unknown.missingInformation.includes('input:applicantOwnsVehicle'));
});

test('v1/v2 boundary persona comparison preserves the reason for each changed outcome', () => {
  const youthMember = input({ isHouseholdHead:false, monthlyIncome:4_000_000, householdIncome:20_000_000,
    totalAssets:500_000_000, applicantTotalAssets:100_000_000, vehicleValue:60_000_000, applicantVehicleValue:0 });
  const studentOwnAssets = input({ educationStatus:'ENROLLED_OR_INCOMING', parentApplicantMonthlyIncome:7_000_000,
    parentApplicantIncomeHouseholdSize:3, incomeHouseholdSize:3, schoolRegion:'제주특별자치도',
    totalAssets:500_000_000, applicantTotalAssets:108_000_000 });
  const studentOwnCar = input({ educationStatus:'ENROLLED_OR_INCOMING', parentApplicantMonthlyIncome:7_000_000,
    parentApplicantIncomeHouseholdSize:3, incomeHouseholdSize:3, schoolRegion:'제주특별자치도', vehicleValue:0,
    applicantVehicleValue:0, applicantOwnsVehicle:true });
  const spouseAccount = input({ familyCategory:'married', marriageDate:'2025-01-01',
    canProveSubscriptionByMoveIn:false, applicantCanProveSubscriptionByMoveIn:false,
    spouseCanProveSubscriptionByMoveIn:true, incomeHouseholdSize:2, dualIncome:false });
  const futureHousehold = input({ familyCategory:'engaged', plannedMarriageWithinDeadline:true,
    householdIncome:20_000_000, totalAssets:500_000_000, vehicleValue:60_000_000,
    futureHouseholdNoHome:true, futureHouseholdIncomeSize:2, futureHouseholdIncome:6_000_000,
    futureHouseholdDualIncome:false, futureHouseholdTotalAssets:200_000_000,
    futureHouseholdVehicleValue:0 });
  futureHousehold.profile.housing.householdHasHome = knownField(true);
  const onePerson = input({ familyCategory:'married', marriageDate:'2025-01-01', incomeHouseholdSize:1,
    householdIncome:4_000_000, dualIncome:false });
  const spousePriority = input({ familyCategory:'married', marriageDate:'2025-01-01',
    currentResidence:'서울특별시', incomeSourceRegion:'서울특별시', spouseResidence:'제주특별자치도',
    incomeHouseholdSize:2, dualIncome:false });
  const minorException = input({ birthDate:'2010-01-01', adultOrMinorHouseholdHeadException:true,
    educationStatus:'ENROLLED_OR_INCOMING', parentApplicantMonthlyIncome:7_000_000,
    parentApplicantIncomeHouseholdSize:3, incomeHouseholdSize:3, schoolRegion:'제주특별자치도' });
  const scenarios = [
    ['youth-member', 'youth', youthMember], ['student-own-assets', 'student', studentOwnAssets],
    ['student-own-car', 'student', studentOwnCar], ['spouse-account', 'newlywed', spouseAccount],
    ['future-household', 'newlywed', futureHousehold], ['one-person-cell', 'newlywed', onePerson],
    ['spouse-priority', 'newlywed', spousePriority], ['minor-exception', 'student', minorException],
  ] as const;
  const observed = scenarios.map(([id, supply, assessment]) => {
    const prior = assessApplication(v1, assessment, v1.listingId).find(item => item.supplyType === supply)!;
    const next = result(supply, assessment);
    return { id, v1Status:prior.status, v2Status:next.status, v1Stage:prior.stage, v2Stage:next.stage };
  });
  assert.deepEqual(observed, [
    { id:'youth-member', v1Status:'INELIGIBLE', v2Status:'ELIGIBLE', v1Stage:null, v2Stage:'PRIORITY' },
    { id:'student-own-assets', v1Status:'INELIGIBLE', v2Status:'ELIGIBLE', v1Stage:null, v2Stage:'PRIORITY' },
    { id:'student-own-car', v1Status:'ELIGIBLE', v2Status:'INELIGIBLE', v1Stage:'PRIORITY', v2Stage:null },
    { id:'spouse-account', v1Status:'INELIGIBLE', v2Status:'ELIGIBLE', v1Stage:null, v2Stage:'PRIORITY' },
    { id:'future-household', v1Status:'INELIGIBLE', v2Status:'ELIGIBLE', v1Stage:null, v2Stage:'PRIORITY' },
    { id:'one-person-cell', v1Status:'ELIGIBLE', v2Status:'NEEDS_MORE_INFORMATION', v1Stage:'PRIORITY', v2Stage:null },
    { id:'spouse-priority', v1Status:'ELIGIBLE', v2Status:'ELIGIBLE', v1Stage:'GENERAL', v2Stage:'PRIORITY' },
    { id:'minor-exception', v1Status:'ELIGIBLE', v2Status:'ELIGIBLE', v1Stage:'PRIORITY', v2Stage:'PRIORITY' },
  ]);
  assert.deepEqual(reviewCandidate.boundaryComparisons.map((item: {id:string;v1Result:string;v2Result:string}) =>
    ({ id:item.id, v1Status:item.v1Result.split('/')[0], v2Status:item.v2Result.split('/')[0] })),
    observed.map(item => ({ id:item.id, v1Status:item.v1Status, v2Status:item.v2Status })));
});

test('student applicant asset ceiling is inclusive and parent asset estimates do not fill it', () => {
  const student = input({ educationStatus:'ENROLLED_OR_INCOMING', parentApplicantMonthlyIncome:7_000_000,
    parentApplicantIncomeHouseholdSize:3, schoolRegion:'제주특별자치도',
    totalAssets:900_000_000, applicantTotalAssets:108_000_000 });
  assert.equal(result('student', student).status, 'ELIGIBLE');
  student.details.applicantTotalAssets = 108_000_001;
  assert.equal(result('student', student).status, 'INELIGIBLE');
  student.details.applicantTotalAssets = undefined;
  assert.equal(result('student', student).status, 'NEEDS_MORE_INFORMATION');
});
