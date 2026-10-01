import assert from 'node:assert/strict';
import test from 'node:test';
import { detectAssessmentResultStaleness, type PersistedUserAssessmentResult } from './resultPersistence.ts';
import { createSupabaseAssessmentResultRepository } from './resultRepository.ts';

const result: PersistedUserAssessmentResult = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  announcementId: '33333333-3333-4333-8333-333333333333',
  listingId: 'listing-1', supplyType: 'youth', ruleSetId: null, ruleSetVersion: null,
  sourceStatus: 'REFERENCE', sourceDocumentId: null, sourceDocumentHash: null,
  profileRevision: 2, engineVersion: 'engine-v1', inputHash: 'a'.repeat(64),
  portfolioStatus: 'UNAVAILABLE', eligibilityStatus: null, scoringStatus: 'UNAVAILABLE',
  stage: null, score: null, missingUserFields: [], missingAnnouncementFields: [], blockers: [],
  warnings: [], evidence: [], engineResult: null, calculatedAt: '2026-10-01T00:00:00.000Z',
  stale: { isStale: false },
};

test('result repository adopts the RPC row snapshot', async () => {
  const row = {
    id: result.id, user_id: result.userId, result_snapshot: result,
    calculated_at: result.calculatedAt, stale_at: null, stale_reason: null,
  };
  const client = { rpc: async () => ({ data: row, error: null }) } as never;
  assert.deepEqual(await createSupabaseAssessmentResultRepository(client).save(result), result);
});

test('stale detection identifies all four provenance changes in priority order', () => {
  const current = {
    profileRevision: 2, ruleSetId: null, ruleSetVersion: null,
    sourceDocumentHash: null, engineVersion: 'engine-v1',
  };
  assert.equal(detectAssessmentResultStaleness(result, current), null);
  assert.equal(detectAssessmentResultStaleness(result, { ...current, profileRevision: 3 }), 'PROFILE_CHANGED');
  assert.equal(detectAssessmentResultStaleness(result, { ...current, ruleSetId: 'rules-2', ruleSetVersion: '2' }), 'RULE_SET_CHANGED');
  assert.equal(detectAssessmentResultStaleness(result, { ...current, sourceDocumentHash: 'b'.repeat(64) }), 'SOURCE_DOCUMENT_CHANGED');
  assert.equal(detectAssessmentResultStaleness(result, { ...current, engineVersion: 'engine-v2' }), 'ENGINE_CHANGED');
});
