import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyApplicantProfileV3, knownProfileFact } from './v3.ts';
import { compareApplicantProfileV3Conflict } from './v3Conflict.ts';

test('profile conflict separates safe local edits from competing server edits', () => {
  const base = createEmptyApplicantProfileV3();
  const local = structuredClone(base);
  const server = structuredClone(base);
  local.identity.birthDate = knownProfileFact({ value: '1995-01-01', precision: 'DAY' }, { source: 'USER' });
  local.residence.currentRegion = knownProfileFact('제주', { source: 'USER' });
  server.identity.birthDate = knownProfileFact({ value: '1996-01-01', precision: 'DAY' }, { source: 'USER' });
  server.preferences.regions = ['제주'];
  const comparison = compareApplicantProfileV3Conflict({ base, local, server, serverRevision: 4 });
  assert.deepEqual(comparison.requiresUserChoiceFields, ['identity.birthDate.value.value']);
  assert.ok(comparison.autoMergeSafeFields.includes('residence.currentRegion.value'));
  assert.ok(comparison.autoMergeSafeFields.includes('preferences.regions'));
  assert.equal(comparison.serverRevision, 4);
});
