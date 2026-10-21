import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildJejuV2RegistrationPlan } from './jejuV2RegistrationPlan.ts';

test('offline preflight keeps v1 separate and never claims candidate activation or a Staging write', () => {
  const plan = buildJejuV2RegistrationPlan();
  assert.equal(plan.mode, 'OFFLINE_DRY_RUN'); assert.equal(plan.contactedStaging, false);
  assert.equal(plan.mutationPerformed, false);
  assert.equal(plan.candidate.announcementId, plan.existingV1.announcementId);
  assert.notEqual(plan.candidate.documentId, plan.existingV1.documentId);
  assert.notEqual(plan.candidate.ruleSetId, plan.existingV1.ruleSetId);
  assert.equal(plan.candidate.sourceVerificationState, 'SOURCE_VERIFIED');
  assert.equal(plan.candidate.reviewStatus, 'IN_REVIEW');
  assert.equal(plan.candidate.publicationStatus, 'INACTIVE');
  assert.equal(plan.candidate.approved, false); assert.equal(plan.candidate.active, false);
  assert.equal(plan.candidate.ruleCount, 44); assert.equal(plan.candidate.warningCount, 22);
  assert.equal(plan.candidate.notInSourceCount, 5); assert.equal(plan.candidate.blockerCount, 1);
  assert.ok(plan.writeBlockedReasons.includes('ORIGINAL_DOCUMENT_BYTES_NOT_VERIFIED'));
  assert.equal(plan.originalDocument.verified, false);
});

test('provided source bytes must match pinned document hash; matching hash alone does not clear remote gates', () => {
  const initial = buildJejuV2RegistrationPlan();
  assert.throws(() => buildJejuV2RegistrationPlan('0'.repeat(64)), /JEJU_V2_ORIGINAL_HASH_MISMATCH/);
  const verified = buildJejuV2RegistrationPlan(initial.originalDocument.expectedHash);
  assert.equal(verified.originalDocument.verified, true);
  assert.ok(verified.writeBlockedReasons.includes('STAGING_IDENTITY_AND_EXISTING_ROWS_NOT_INSPECTED'));
  assert.ok(verified.writeBlockedReasons.includes('TYPED_DECISION_AUDIT_SCHEMA_NOT_VERIFIED'));
});
