import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateMissingProfileFacts,
  freshnessForResult,
  mapWithConcurrency,
  portfolioItemFromResult,
  selectPortfolioCandidates,
  summarizeFreshness,
  type PortfolioCandidate,
} from './portfolioOrchestration.ts';
import type { AssessmentPortfolioItem } from './portfolioContract.ts';
import type { PersistedUserAssessmentResult } from './resultPersistence.ts';

const listing = (id: string, region: string | null, date = '2026-10-01') => ({
  listingId: id, announcementId: `announcement-${id}`, title: id, region, announcementDate: date,
});
const source = (id: string, region: string | null, supplyType: 'youth' | 'newlywed' | 'firstHome' = 'youth') => ({
  listing: listing(id, region), supplyType, ruleSetId: `rules-${id}`, ruleSetVersion: '1', sourceDocumentHash: `hash-${id}`,
});

test('portfolio candidate selection handles zero, one and bounded priority order', () => {
  assert.deepEqual(selectPortfolioCandidates({ candidates: [], savedListingIds: [], preferredRegions: [] }).candidates, []);
  assert.equal(selectPortfolioCandidates({ candidates: [source('one', '제주')], savedListingIds: [], preferredRegions: [] }).candidates.length, 1);
  const selected = selectPortfolioCandidates({
    candidates: [source('other', '서울'), source('region', '제주특별자치도'), source('saved', '부산'), source('saved', '부산')],
    savedListingIds: ['saved'], preferredRegions: ['제주'], limit: 2,
  });
  assert.deepEqual(selected.candidates.map(item => [item.listing.listingId, item.priority]), [
    ['saved', 'SAVED'], ['region', 'PREFERRED_REGION'],
  ]);
  assert.equal(selected.truncated, true);
  assert.equal(selected.total, 3);
});

const persisted = (overrides: Partial<PersistedUserAssessmentResult> = {}): PersistedUserAssessmentResult => ({
  id: 'result', userId: 'user', announcementId: 'announcement-listing', listingId: 'listing', supplyType: 'youth',
  ruleSetId: 'rules-listing', ruleSetVersion: '1', sourceStatus: 'DRAFT_SOURCE_VERIFIED',
  sourceDocumentId: null, sourceDocumentHash: 'hash-listing', profileRevision: 1,
  engineVersion: 'assessment-engine-v3-profile-1', inputHash: 'a'.repeat(64), portfolioStatus: 'NEEDS_USER_INPUT',
  eligibilityStatus: 'NEEDS_MORE_INFORMATION', scoringStatus: 'PENDING', stage: null, score: null,
  missingUserFields: ['input:subscriptionAccountOpenedAt'], missingAnnouncementFields: [], blockers: [], warnings: [], evidence: [],
  engineResult: null, calculatedAt: '2026-10-01T00:00:00.000Z', stale: { isStale: false }, ...overrides,
});
const candidate: PortfolioCandidate = { ...source('listing', '제주'), priority: 'SAVED' };

test('fresh result is reusable and profile revision changes only its freshness', () => {
  const result = persisted();
  const current = { profileRevision: 1, ruleSetId: result.ruleSetId, ruleSetVersion: result.ruleSetVersion,
    sourceDocumentHash: result.sourceDocumentHash, engineVersion: result.engineVersion };
  assert.equal(freshnessForResult(result, current), 'FRESH');
  assert.equal(freshnessForResult(result, { ...current, profileRevision: 2 }), 'STALE_PROFILE');
});

test('missing facts expose frequency and one-field completion impact', () => {
  const one = portfolioItemFromResult({ candidate, result: persisted(), freshness: 'FRESH' });
  const two = { ...one, listingId: 'listing-2', provenance: { ...one.provenance, resultId: 'result-2' },
    missingUserFields: ['input:subscriptionAccountOpenedAt', 'input:monthlyIncome'] } satisfies AssessmentPortfolioItem;
  const facts = aggregateMissingProfileFacts([one, two]);
  assert.deepEqual(facts[0], {
    field: 'subscriptionAccountOpenedAt', affectedListingCount: 2, affectedResultIds: ['result', 'result-2'],
    priority: 1002, completionImpact: { becomesCalculableCount: 1, reducesMissingCount: 2 },
  });
  assert.deepEqual(summarizeFreshness([one, { ...two, freshness: 'STALE_RULE' }]), {
    fresh: 1, stale: 1, byReason: { STALE_RULE: 1 },
  });
});

test('bounded batch isolates one listing failure', async () => {
  const outcomes = await mapWithConcurrency([1, 2, 3], 2, async value => {
    if (value === 2) throw new Error('RULE_LOAD_FAILED');
    return value * 2;
  });
  assert.deepEqual(outcomes.map(item => item.status), ['fulfilled', 'rejected', 'fulfilled']);
});

