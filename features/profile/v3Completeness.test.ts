import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyApplicantProfileV3 } from './v3.ts';
import {
  deriveApplicantProfileV3Lifecycle,
  initialProfileRequiredFields,
  isInitialApplicantProfileComplete,
  missingInitialProfileFields,
  profileFieldForAssessmentFact,
  profileFieldValue,
  updateApplicantProfileV3Field,
} from './v3Completeness.ts';

test('minimum profile is based on cross-listing facts and skips known fields', () => {
  let profile = createEmptyApplicantProfileV3();
  assert.deepEqual(missingInitialProfileFields(profile).map(field => field.id), initialProfileRequiredFields.map(field => field.id));
  profile = updateApplicantProfileV3Field(profile, 'birthDate', '1995-01-01');
  profile = updateApplicantProfileV3Field(profile, 'currentRegion', '제주특별자치도');
  profile = updateApplicantProfileV3Field(profile, 'hasSubscriptionAccount', true);
  profile = updateApplicantProfileV3Field(profile, 'marriageStatus', 'single');
  profile = updateApplicantProfileV3Field(profile, 'currentOwnership', 'no-home');
  assert.equal(isInitialApplicantProfileComplete(profile), true);
  assert.equal(profileFieldValue(profile, 'birthDate'), '1995-01-01');
});

test('not-applicable account details are skipped when user has no account', () => {
  const profile = updateApplicantProfileV3Field(createEmptyApplicantProfileV3(), 'hasSubscriptionAccount', false);
  assert.equal(profile.subscriptionAccount.openedAt.state, 'NOT_APPLICABLE');
  assert.equal(profile.subscriptionAccount.recognizedPaymentCount.state, 'NOT_APPLICABLE');
});

test('portfolio missing facts map to reusable V3 facts but not announcement-only facts', () => {
  assert.equal(profileFieldForAssessmentFact('input:subscriptionAccountOpenedAt')?.id, 'subscriptionAccountOpenedAt');
  assert.equal(profileFieldForAssessmentFact('monthlyIncome')?.id, 'monthlyApplicantIncome');
  assert.equal(profileFieldForAssessmentFact('incomeHouseholdSize')?.id, 'householdMemberCount');
  assert.equal(profileFieldForAssessmentFact('accountKindEligible')?.id, 'subscriptionAccountKind');
  assert.equal(profileFieldForAssessmentFact('householdNoWinningFiveYears'), null);
  assert.equal(profileFieldForAssessmentFact('plannedMarriageWithinDeadline'), null);
});

test('lifecycle distinguishes fallback persistence, conflict and ready V3', () => {
  let profile = createEmptyApplicantProfileV3();
  for (const [field, value] of [
    ['birthDate', '1995-01-01'], ['currentRegion', '제주특별자치도'],
    ['hasSubscriptionAccount', true], ['marriageStatus', 'single'], ['currentOwnership', 'no-home'],
  ] as const) profile = updateApplicantProfileV3Field(profile, field, value);
  const base = { authHydrated: true, userId: 'user', status: 'ready' as const, profile };
  assert.equal(deriveApplicantProfileV3Lifecycle({ ...base, source: 'V2_FALLBACK', record: null }), 'PROFILE_INCOMPLETE');
  assert.equal(deriveApplicantProfileV3Lifecycle({ ...base, status: 'conflict', source: 'V3', record: null }), 'PROFILE_CONFLICT');
  assert.equal(deriveApplicantProfileV3Lifecycle({ ...base, source: 'V3', record: { revision: 1 } as never }), 'PROFILE_READY');
});
