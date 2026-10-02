import assert from 'node:assert/strict';
import test from 'node:test';
import { createUserCentricAssessmentService } from './userCentricService.ts';
import type { PersistedUserAssessmentResult } from './resultPersistence.ts';

const result: PersistedUserAssessmentResult = {
  id: '11111111-1111-4111-8111-111111111111', userId: 'user', announcementId: 'announcement',
  listingId: 'listing', supplyType: 'youth', ruleSetId: 'rules', ruleSetVersion: '1',
  sourceStatus: 'DRAFT_SOURCE_VERIFIED', sourceDocumentId: null, sourceDocumentHash: null,
  profileRevision: 1, engineVersion: 'engine', inputHash: 'a'.repeat(64), portfolioStatus: 'COMPLETE',
  eligibilityStatus: 'ELIGIBLE', scoringStatus: 'PENDING', stage: 'PRIORITY', score: null,
  missingUserFields: [], missingAnnouncementFields: [], blockers: [], warnings: [], evidence: [],
  engineResult: null, calculatedAt: '2026-10-01T00:00:00.000Z', stale: { isStale: false },
};

test('client reads persistence then adopts only the trusted Edge response', async () => {
  let reads = 0; let invokes = 0;
  const service = createUserCentricAssessmentService({
    client: { functions: { invoke: async () => {
      invokes += 1;
      return { data: { result, reused: true, freshness: 'FRESH' }, error: null };
    } } } as never,
    results: {
      list: async () => { reads += 1; return [result]; },
      listStale: async () => [],
    },
  });
  const response = await service.loadOrRecalculate({
    userId: 'user', listingId: 'listing', supplyType: 'youth', announcementDetails: {},
  });
  assert.equal(reads, 1);
  assert.equal(invokes, 1);
  assert.equal(response.result.id, result.id);
});

test('stored stale reason is exposed without turning it into a score result', async () => {
  const stale = { ...result, stale: { isStale: true as const, reason: 'PROFILE_CHANGED' as const, detectedAt: '2026-10-02T00:00:00Z' } };
  const service = createUserCentricAssessmentService({
    client: {} as never,
    results: { list: async () => [stale], listStale: async () => [stale] },
  });
  assert.equal((await service.latest('user', 'listing', 'youth'))?.freshness, 'STALE_PROFILE');
});
