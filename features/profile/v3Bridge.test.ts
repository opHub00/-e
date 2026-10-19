import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplicantProfileFromLegacy } from './domain.ts';
import { createEmptyApplicantProfileV3, knownProfileFact } from './v3.ts';
import { mergeExplicitV2ProfileEditIntoV3, mergeReusableAssessmentDetailsIntoV3 } from './v3Bridge.ts';

test('explicit V2 editor changes do not invent exact V3 dates or amounts', () => {
  const current = createEmptyApplicantProfileV3();
  current.subscriptionAccount.openedAt = knownProfileFact({ value: '2024-01-02', precision: 'DAY' });
  const edited = createApplicantProfileFromLegacy({
    name: '사용자', age: 31, occupation: 'worker', region: '제주특별자치도',
    hasSubscriptionAccount: true, accountMonths: 24, monthlyPayment: 100_000,
    isNoHomeOwner: true,
  });
  const next = mergeExplicitV2ProfileEditIntoV3(current, edited, '2026-10-01T00:00:00.000Z');
  assert.deepEqual(next.subscriptionAccount.openedAt, current.subscriptionAccount.openedAt);
  assert.equal(next.subscriptionAccount.legacyAccountMonths.state, 'KNOWN');
  assert.equal(next.family.marriageDate.state, 'UNKNOWN');
  assert.equal(next.income.monthlyApplicantIncome.state, 'UNKNOWN');
});

test('questionnaire persists reusable facts and excludes announcement-only qualifiers', () => {
  const next = mergeReusableAssessmentDetailsIntoV3(createEmptyApplicantProfileV3(), {
    birthDate: '1995-05-01', subscriptionAccountOpenedAt: '2022-03-04',
    recognizedPaymentCount: 25, monthlyIncome: 3_000_000, totalAssets: 100_000_000,
    youthPriorityTarget: true, specialExceptions: ['공고 특례'], incomeHouseholdSize: 3,
  }, '2026-10-01T00:00:00.000Z');
  assert.equal(next.identity.birthDate.state, 'KNOWN');
  assert.equal(next.subscriptionAccount.recognizedPaymentCount.state, 'KNOWN');
  assert.equal(next.income.monthlyApplicantIncome.state, 'KNOWN');
  assert.equal(next.assets.totalApplicantAssets.state, 'KNOWN');
  assert.equal('youthPriorityTarget' in next, false);
  assert.equal('specialExceptions' in next, false);
  assert.equal('incomeHouseholdSize' in next.household, false);
});

test('rental qualification raw facts persist while announcement confirmations do not', () => {
  const next = mergeReusableAssessmentDetailsIntoV3(createEmptyApplicantProfileV3(), {
    educationStatus:'GRADUATED_OR_WITHDRAWN', graduationDate:'2026-02-10', schoolRegion:'제주특별자치도',
    incomeSourceRegion:'제주특별자치도', youthActivityCategory:'WORKER', totalIncomeWorkMonths:24,
    parentApplicantMonthlyIncome:4_000_000, housingBenefitRecipient:false,
    canProveSubscriptionByMoveIn:true, noPublicRentalSubletRestriction:true,
  }, '2026-10-19T00:00:00.000Z');
  assert.equal(next.education?.status.state, 'KNOWN');
  assert.equal(next.income.youthActivityCategory?.state, 'KNOWN');
  assert.equal(next.benefits?.housingBenefitRecipient.state, 'KNOWN');
  assert.equal('canProveSubscriptionByMoveIn' in next, false);
  assert.equal('noPublicRentalSubletRestriction' in next, false);
});
