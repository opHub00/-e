import assert from 'node:assert/strict';
import test from 'node:test';
import { assessApplication } from './engine.ts';
import { portfolioEntryFromAssessment, unavailablePortfolioEntry } from './portfolio.ts';
import { buildPersistedAssessmentResult, markAssessmentResultStale } from './resultPersistence.ts';
import { samdoReferenceRules } from './reference/samdoReferenceRules.ts';
import { samdoApplicant } from './server/samdoProfiles.test-data.ts';
import type { ApplicationAssessmentResult } from './types.ts';
import { assessmentInputFromApplicantProfileV3 } from './v3Adapter.ts';
import { knownProfileFact, migrateApplicantProfileV2ToV3 } from '../profile/v3.ts';

test('V3 adapter produces deterministic engine parity for the same announcement details', () => {
  const original = samdoApplicant('youth');
  const v3 = migrateApplicantProfileV2ToV3(original.profile, { source: 'PERSISTED_USER' });
  const adapted = assessmentInputFromApplicantProfileV3(v3, {
    announcementDate: samdoReferenceRules.announcementDate,
    announcementDetails: original.details,
  });
  const before = assessApplication(samdoReferenceRules, original);
  const after = assessApplication(samdoReferenceRules, adapted);
  const summary = (results: ApplicationAssessmentResult[]) => results.map(item => ({
    status: item.status, stage: item.stage, score: item.score, missing: item.missingInformation,
  }));
  assert.deepEqual(summary(after), summary(before));
});

test('V3 raw facts map to AssessmentInput without approximate values', () => {
  const original = samdoApplicant('firstHome');
  const v3 = migrateApplicantProfileV2ToV3(original.profile, { source: 'PERSISTED_USER' });
  v3.residence.startedAt = knownProfileFact({ value: '2024-09-14', precision: 'DAY' });
  v3.subscriptionAccount.openedAt = knownProfileFact({ value: '2024-01-01', precision: 'DAY' });
  v3.subscriptionAccount.kind = knownProfileFact('HOUSING_SUBSCRIPTION');
  v3.subscriptionAccount.recognizedPaymentCount = knownProfileFact(24);
  v3.subscriptionAccount.recognizedDepositAmount = knownProfileFact(6_000_000);
  v3.income.monthlyApplicantIncome = knownProfileFact(2_669_354);
  v3.assets.totalApplicantAssets = knownProfileFact(100_000_000);
  v3.household.memberCount = knownProfileFact(3);
  const input = assessmentInputFromApplicantProfileV3(v3, { announcementDate: '2026-09-14' });
  assert.equal(input.details.residenceStartDate, '2024-09-14');
  assert.equal(input.details.subscriptionAccountOpenedAt, '2024-01-01');
  assert.equal(input.details.accountKindEligible, true);
  assert.equal(input.details.incomeHouseholdSize, 3);
  assert.equal(input.details.recognizedPaymentCount, 24);
  assert.equal(input.details.recognizedDepositAmount, 6_000_000);
  assert.equal(input.details.monthlyIncome, 2_669_354);
  assert.equal(input.details.totalAssets, 100_000_000);
});

test('V3 account kind mapping fails closed for unknown and rejects OTHER deterministically', () => {
  const v3 = migrateApplicantProfileV2ToV3(samdoApplicant('youth').profile, { source: 'PERSISTED_USER' });
  assert.equal(assessmentInputFromApplicantProfileV3(v3).details.accountKindEligible, undefined);
  v3.subscriptionAccount.kind = knownProfileFact('OTHER');
  assert.equal(assessmentInputFromApplicantProfileV3(v3).details.accountKindEligible, false);
});

const result = (status: ApplicationAssessmentResult['status'], missingInformation: string[] = []): ApplicationAssessmentResult => ({
  rulesId: 'rules-1', rulesVersion: '1.0.0', listingId: 'listing-1', supplyType: 'youth',
  status, eligible: status === 'ELIGIBLE' ? true : status === 'INELIGIBLE' ? false : null,
  stage: status === 'ELIGIBLE' ? 'PRIORITY' : null, stageExplanation: '', inputDates: {},
  scoring: 'PENDING', satisfiedConditions: [], failedConditions: [], unknownConditions: [],
  stageConditions: [], warnings: [], requiredDocuments: [], evidence: [], missingInformation,
});

test('portfolio maps complete, user-input, ineligible and unavailable states separately', () => {
  assert.equal(portfolioEntryFromAssessment(result('ELIGIBLE')).status, 'COMPLETE');
  assert.equal(portfolioEntryFromAssessment(result('INELIGIBLE')).status, 'INELIGIBLE');
  const needs = portfolioEntryFromAssessment(result('NEEDS_MORE_INFORMATION', ['input:birthDate']));
  assert.equal(needs.status, 'NEEDS_USER_INPUT');
  assert.deepEqual(needs.missingUserFields, ['input:birthDate']);
  const unavailable = portfolioEntryFromAssessment(result('NEEDS_MORE_INFORMATION', ['parameter:incomeLimit']));
  assert.equal(unavailable.status, 'UNAVAILABLE');
  assert.deepEqual(unavailable.missingAnnouncementFields, ['parameter:incomeLimit']);
  assert.equal(unavailablePortfolioEntry({ listingId: 'x', supplyType: 'youth', reason: 'NO_ACTIVE_RULE_SET' }).status, 'UNAVAILABLE');
});

test('persistence contract records provenance and explicit staleness', () => {
  const entry = portfolioEntryFromAssessment(result('ELIGIBLE'));
  const persisted = buildPersistedAssessmentResult(entry, {
    id: 'assessment-1', userId: 'user-1', announcementId: 'announcement-1',
    sourceStatus: 'DRAFT_SOURCE_VERIFIED', sourceDocumentId: 'document-1',
    sourceDocumentHash: 'sha256:abc', profileRevision: 7, engineVersion: 'assessment-engine-v1',
    inputHash: 'sha256:def', calculatedAt: '2026-10-01T00:00:00.000Z',
  });
  assert.equal(persisted.ruleSetId, 'rules-1');
  assert.equal(persisted.profileRevision, 7);
  assert.equal(persisted.stale.isStale, false);
  assert.deepEqual(markAssessmentResultStale(persisted, 'PROFILE_CHANGED', '2026-10-02T00:00:00.000Z').stale, {
    isStale: true, reason: 'PROFILE_CHANGED', detectedAt: '2026-10-02T00:00:00.000Z',
  });
});
