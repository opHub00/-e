import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMinimalApplicantProfile, knownField } from '../profile/domain.ts';
import { assessApplication } from './engine.ts';
import { validateImportPackage } from './server/importPackage.ts';
import { decodeReviewSeedAnnotation } from '../assessmentRuleReview/seed/annotations.ts';
import { buildAssessmentReviewSeed } from '../assessmentRuleReview/seed/buildAssessmentReviewSeed.ts';
import { sourceFixtureHash } from '../assessmentRuleReview/fixtures/provenance.ts';
import { SAMDO_REVIEW_SEED_PROVENANCE, SAMDO_STAGING_REVIEW_SEED } from '../assessmentRuleReview/fixtures/samdoReviewSeed.generated.ts';
import { literalAppears } from '../../scripts/build-import-package.mjs';
import type { AssessmentInput } from './types.ts';
import { factsUsedByRules } from './ruleFacts.ts';
import { announcementResidenceRegion } from './ruleRegion.ts';

// 두 번째 실제 공고: 힐스테이트 고덕엘리스트 A65BL 공공분양주택 (청약홈 2026000438, 공식 첨부 PDF).
const read = (name: string) => JSON.parse(readFileSync(new URL(`../../data/assessment-rules/${name}`, import.meta.url), 'utf8'));
const godeokPackage = read('lh-godeok-a65bl-2026000438.json');
const godeok = validateImportPackage(godeokPackage).rules;
const samdoPackage = read('samdo-2026-v1.7.json');
const samdo = validateImportPackage(samdoPackage).rules;
const annotation = decodeReviewSeedAnnotation(read('lh-godeok-a65bl-2026000438.review-annotations.json'));
const expectations = read('lh-godeok-a65bl-2026000438.literal-expectations.json');

function applicant(overrides: AssessmentInput['details'] = {}): AssessmentInput {
  const profile = createMinimalApplicantProfile({ name: '검증용 신청자', age: 32, currentRegion: '경기도', preferredRegions: [] });
  profile.family.marriageStatus = knownField('married');
  profile.housing.currentOwnership = knownField('no-home');
  profile.housing.previousOwnership = knownField(false);
  profile.housing.householdHasHome = knownField(false);
  profile.housing.householdDisqualifyingPreviousOwnership = knownField(false);
  profile.housing.hasSpecialSupplyRestriction = knownField(false);
  profile.subscriptionAccount.hasAccount = knownField(true);
  profile.income.incomeTaxPaymentYears = knownField(6);
  profile.income.workOrBusinessIncomeEligible = knownField(true);
  profile.household.memberCount = knownField(3);
  return { profile, details: {
    birthDate: '1994-03-01', familyCategory: 'married', marriageDate: '2024-09-11', firstMarriageDate: '2024-09-11', everMarried: true,
    children: [{ birthDate: '2022-05-01', unborn: false }], residenceStartDate: '2022-01-01', currentResidence: '경기도', overseasStayHistory: [],
    subscriptionAccountOpenedAt: '2023-01-01', recognizedPaymentCount: 30, recognizedDepositAmount: 7_000_000, accountKindEligible: true,
    householdIncome: 7_000_000, incomeHouseholdSize: 3, dualIncome: false, realEstateAssets: 0, vehicleValue: 20_000_000,
    specialSupplyHistory: false, reWinningRestriction: false, specialExceptions: [], unmarriedChildInHousehold: true, ...overrides,
  } };
}
const result = (rules: typeof godeok, supply: 'newlywed' | 'firstHome', input: AssessmentInput) =>
  assessApplication(rules, input, rules.listingId).find(item => item.supplyType === supply)!;

test('the second announcement package is official, evidence-linked and Samdo-free', () => {
  assert.equal(godeokPackage.ruleSet.sourceStatus, 'OFFICIAL_VERIFIED');
  assert.equal(godeokPackage.document.isOfficial, true);
  assert.equal(godeokPackage.document.sha256, 'be9fc0f60a274236b5de9391bf4279dce90252821009735a60e969eada768542');
  assert.equal(godeokPackage.rules.length, 46);
  assert.deepEqual(godeok.supplies.map(s => s.type), ['newlywed', 'firstHome']);
  for (const rule of godeokPackage.rules) {
    assert.equal(rule.evidence.documentId, godeokPackage.document.id, rule.ruleKey);
    assert.ok(rule.evidence.textExcerpt?.length > 10, rule.ruleKey);
    assert.equal(rule.evidence.locator.sha256, godeokPackage.document.sha256, rule.ruleKey);
    assert.ok(rule.evidence.locator.blocks.length > 0, rule.ruleKey);
  }
  const text = JSON.stringify(godeokPackage);
  assert.doesNotMatch(text, /제주|삼도|[Ss]amdo|bade0617/);
  // 전국 거주자 신청 가능: 거주지역 자격 규칙을 두지 않는다.
  assert.equal(godeokPackage.rules.some((rule: { config: { expression?: unknown } }) => JSON.stringify(rule.config.expression ?? '').includes('"residence"')), false);
});

test('announcement literal expectations are the values the package actually uses', () => {
  const params = Object.values(godeokPackage.ruleSet.config.parameters).filter(v => typeof v === 'number') as number[];
  const excerpts = godeokPackage.rules.map((r: { evidence: { textExcerpt: string } }) => r.evidence.textExcerpt).join('\n');
  for (const [role, spec] of Object.entries(expectations.exact) as [string, { values: number[] }][]) {
    for (const value of spec.values) assert.ok(literalAppears(value, excerpts) || params.includes(value), `${role}=${value}`);
  }
  for (const [role, values] of Object.entries(expectations.income) as [string, number[]][]) {
    for (const value of values) assert.ok(params.includes(value), `${role}=${value}`);
  }
});

test('A. obvious ELIGIBLE: newlywed priority stage with the announcement score table', () => {
  const r = result(godeok, 'newlywed', applicant());
  assert.equal(r.status, 'ELIGIBLE');
  assert.equal(r.stage, 'PRIORITY');
  assert.equal(r.scoring, 'AVAILABLE');
  // 가구소득 0(80% 초과) + 자녀 1 + 평택시 거주 3 + 납입 3 + 혼인 3 + 한부모 항목 해당 없음(0, 최대점에서 제외)
  assert.equal(r.score?.total, 10);
  assert.equal(r.score?.max, 13);
  assert.ok(r.evidence.every(e => e.id.startsWith('godeok.a65bl.')));
  assert.ok(r.warnings.some(w => w.includes('1순위')), 'newlywed rank warning');
  const first = result(godeok, 'firstHome', applicant());
  assert.equal(first.status, 'ELIGIBLE');
  assert.equal(first.stage, 'PRIORITY');
  assert.equal(first.scoring, 'NOT_APPLICABLE');
  assert.equal(first.score, undefined);
  assert.ok(!first.warnings.some(w => w.includes('신혼부부 특별공급은 1순위')), 'newlywed-only warning stays on newlywed');
});

test('B. obvious INELIGIBLE: real estate above the announcement limit', () => {
  const r = result(godeok, 'newlywed', applicant({ realEstateAssets: 300_000_000 }));
  assert.equal(r.status, 'INELIGIBLE');
  assert.deepEqual(r.failedConditions.map(c => c.ruleId), ['newlywed.realEstate']);
  const tax = result(godeok, 'firstHome', applicant());
  assert.equal(tax.status, 'ELIGIBLE');
  const noTax = applicant(); noTax.profile.income.incomeTaxPaymentYears = knownField(3);
  assert.equal(result(godeok, 'firstHome', noTax).status, 'INELIGIBLE');
});

test('C. NEEDS_MORE_INFORMATION: vehicle value unknown, and childbirth relaxation needs review', () => {
  const missing = result(godeok, 'newlywed', applicant({ vehicleValue: undefined }));
  assert.equal(missing.status, 'NEEDS_MORE_INFORMATION');
  assert.ok(missing.missingInformation.includes('input:vehicleValue'));
  const relaxed = result(godeok, 'newlywed', applicant({ children: [{ birthDate: '2025-06-01', unborn: false }] }));
  assert.equal(relaxed.status, 'NEEDS_MORE_INFORMATION');
  assert.ok(relaxed.unknownConditions.some(c => c.ruleId === 'newlywed.childbirth'));
});

test('single-parent and engaged applicants get the not-applicable score items, not a guessed marriage length', () => {
  const single = applicant({ familyCategory: 'singleParent', marriageDate: undefined, singleParentQualified: true, children: [{ birthDate: '2022-05-01', unborn: false }] });
  single.profile.family.marriageStatus = knownField('single');
  const r = result(godeok, 'newlywed', single);
  const items = Object.fromEntries(r.score!.breakdown.map(b => [b.ruleId, b]));
  assert.equal(items['newlywed.PRIORITY.marriageScore'].points, 0);
  assert.equal(items['newlywed.PRIORITY.marriageScore'].max, 0);
  assert.equal(items['newlywed.PRIORITY.childAgeScore'].points, 2); // 52개월(만 4세): 2세 초과 4세 이하(만 5세 미만)
  assert.equal(r.score!.max, 13);
});

test('review seed for the new announcement covers every rule and approves nothing', () => {
  const seed = buildAssessmentReviewSeed(godeokPackage, annotation);
  assert.equal(seed.rules.length, godeokPackage.rules.length);
  assert.ok(seed.rules.every(rule => ['AUTO_SAFE_CANDIDATE', 'REVIEW_REQUIRED'].includes(rule.candidateStatus) && !('reviewStatus' in rule)));
  assert.equal(seed.rules.find(rule => rule.ruleId === 'newlywed.realEstate')?.originalCandidate.category, 'ASSET');
  assert.equal(seed.rules.find(rule => rule.ruleId === 'firstHome.vehicle')?.originalCandidate.scope, 'HOUSEHOLD');
  assert.equal(seed.unresolvedItems.length, 2);
  assert.doesNotMatch(JSON.stringify(seed), /제주|삼도|[Ss]amdo/);
});

test('isolation: each announcement is assessed only by its own rules', () => {
  const input = applicant();
  const samdoResults = assessApplication(samdo, input, samdo.listingId);
  const godeokResults = assessApplication(godeok, input, godeok.listingId);
  const samdoText = JSON.stringify(samdoResults), godeokText = JSON.stringify(godeokResults);
  assert.doesNotMatch(godeokText, /제주|samdo\.|삼도/);
  assert.doesNotMatch(samdoText, /godeok\.|고덕|평택/);
  assert.ok(godeokResults.every(r => r.rulesId === godeok.id && r.listingId === godeok.listingId));
  assert.ok(samdoResults.every(r => r.rulesId === samdo.id));
  assert.equal(godeokResults.some(r => r.supplyType === 'youth'), false);
  // 같은 신청자라도 삼도는 제주 거주 요건으로 판정한다.
  assert.ok(samdoResults.find(r => r.supplyType === 'newlywed')!.failedConditions.some(c => c.ruleId === 'newlywed.residence'));
});

test('adding the second announcement does not move the Samdo baseline', () => {
  assert.equal(sourceFixtureHash(samdoPackage), SAMDO_REVIEW_SEED_PROVENANCE.sourceFixtureHash);
  assert.equal(SAMDO_STAGING_REVIEW_SEED.rules.length, 75);
});

test('each announcement asks only for the facts its own rules read', () => {
  const g = factsUsedByRules(godeok), s = factsUsedByRules(samdo);
  assert.ok(g.has('realEstateAssets') && g.has('vehicleValue') && !g.has('totalAssets') && !g.has('residence'));
  assert.ok(s.has('totalAssets') && s.has('residence') && !s.has('realEstateAssets'));
  assert.equal(announcementResidenceRegion(godeok), null, 'nationwide announcement gets the neutral residence question');
  assert.equal(announcementResidenceRegion(samdo)?.profile, '제주특별자치도');
});
