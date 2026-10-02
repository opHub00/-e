import assert from 'node:assert/strict';
import test from 'node:test';
import { samdoReferenceRules } from './reference/samdoReferenceRules.ts';
import { samdoApplicant } from './server/samdoProfiles.test-data.ts';
import { migrateApplicantProfileV2ToV3 } from '../profile/v3.ts';
import { executeTrustedAssessment, staleReasonToUiState, trustedAssessmentInputHash } from './serverExecution.ts';

test('trusted server execution preserves deterministic assessment semantics and provenance', async () => {
  const input = samdoApplicant('youth');
  const profile = migrateApplicantProfileV2ToV3(input.profile, { source: 'PERSISTED_USER' });
  profile.revision = 3;
  const result = await executeTrustedAssessment({
    userId: '11111111-1111-4111-8111-111111111111',
    announcementId: '22222222-2222-4222-8222-222222222222',
    profileRevision: 3, profile, rules: samdoReferenceRules, supplyType: 'youth',
    announcementDetails: input.details, sourceDocumentHash: null,
    now: '2026-10-01T00:00:00.000Z', id: '33333333-3333-4333-8333-333333333333',
  });
  assert.equal(result.engineResult?.supplyType, 'youth');
  assert.equal(result.profileRevision, 3);
  assert.match(result.inputHash, /^[a-f0-9]{64}$/);
  assert.equal(result.scoringStatus, result.engineResult?.scoring === 'AVAILABLE' ? 'SCORED' : result.engineResult?.scoring);
});

test('input hash is canonical and stale reasons map to UI contracts', async () => {
  const profile = migrateApplicantProfileV2ToV3(samdoApplicant('youth').profile, { source: 'PERSISTED_USER' });
  const base = {
    listingId: 'listing', supplyType: 'youth' as const, profileRevision: 1, profile,
    ruleSetId: 'rules', ruleSetVersion: '1', sourceDocumentHash: null,
  };
  assert.equal(
    await trustedAssessmentInputHash({ ...base, announcementDetails: { recognizedPaymentCount: 24, monthlyIncome: 1 } }),
    await trustedAssessmentInputHash({ ...base, announcementDetails: { monthlyIncome: 1, recognizedPaymentCount: 24 } }),
  );
  assert.equal(staleReasonToUiState('PROFILE_CHANGED'), 'STALE_PROFILE');
  assert.equal(staleReasonToUiState('RULE_SET_CHANGED'), 'STALE_RULE');
  assert.equal(staleReasonToUiState('SOURCE_DOCUMENT_CHANGED'), 'STALE_DOCUMENT');
  assert.equal(staleReasonToUiState('ENGINE_CHANGED'), 'STALE_ENGINE');
});
