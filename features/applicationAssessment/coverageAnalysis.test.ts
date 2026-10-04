import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateCoverageMissingFields,
  aggregatePortfolioRuns,
  buildCoverageFunnel,
  coverageOperationsMetrics,
  isTestFixtureAnnouncement,
  type CoveragePortfolioRun,
} from './coverageAnalysis.ts';

test('runtime announcements and explicit fixtures remain separate', () => {
  assert.equal(isTestFixtureAnnouncement({ id: '1', source: 'LOCAL_DRAFT', externalId: 'samdo-real', title: '삼도 공고', status: 'PUBLISHED' }), false);
  assert.equal(isTestFixtureAnnouncement({ id: '2', source: 'TEST_FIXTURE', externalId: 'fixture-1', title: '테스트 공고', status: 'PUBLISHED' }), true);
});

test('funnel keeps unavailable parse/extraction measurements honest', () => {
  const funnel = buildCoverageFunnel({ total: 2, documents: 2, parsing: null, extraction: null, ruleSets: 2,
    reviewed: 2, activePublicApproved: 2, listingBindings: 1, deterministic: 1, portfolioExposable: 1 });
  assert.equal(funnel.PARSING.measured, false);
  assert.equal(funnel.PARSING.totalRate, null);
  assert.equal(funnel.LISTING_BINDING.previousDropRate, 0.5);
  assert.match(funnel.EXTRACTION.methodology, /NOT_MEASURED/);
});

test('portfolio status and missing facts distinguish system failures from user input', () => {
  const runs: CoveragePortfolioRun[] = [
    { profileId: 'full', listingId: 'a', supplyType: 'youth', status: 'COMPLETE', missingUserFields: [], missingAnnouncementFields: [] },
    { profileId: 'partial', listingId: 'a', supplyType: 'youth', status: 'NEEDS_USER_INPUT', missingUserFields: ['input:accountMonths'], missingAnnouncementFields: [] },
    { profileId: 'partial', listingId: 'b', supplyType: 'newlywed', status: 'NEEDS_USER_INPUT', missingUserFields: ['input:accountMonths', 'input:householdIncome'], missingAnnouncementFields: [] },
    { profileId: 'full', listingId: 'c', supplyType: 'firstHome', status: 'INELIGIBLE', missingUserFields: [], missingAnnouncementFields: [] },
    { profileId: 'full', listingId: 'd', supplyType: 'firstHome', status: 'UNAVAILABLE', missingUserFields: [], missingAnnouncementFields: ['rule:income'], unavailableReason: 'INVALID_RULE_SET' },
  ];
  const distribution = aggregatePortfolioRuns(runs);
  assert.equal(distribution.interpreted, 4);
  assert.equal(distribution.statuses.UNAVAILABLE, 1);
  assert.equal(distribution.unavailableListings, 1);
  assert.deepEqual(distribution.unavailableByReason, { INVALID_RULE_SET: 1 });
  const missing = aggregateCoverageMissingFields(runs);
  assert.deepEqual(missing[0], { field: 'accountMonths', affectedListings: 2, affectedResults: 2,
    supplyTypes: ['newlywed', 'youth'], becomesCalculableCount: 1 });
  const metrics = coverageOperationsMetrics({ funnel: buildCoverageFunnel({ total: 4, documents: 4, parsing: null,
    extraction: null, ruleSets: 3, reviewed: 3, activePublicApproved: 3, listingBindings: 3, deterministic: 3,
    portfolioExposable: 3 }), portfolio: distribution, missing });
  assert.equal(metrics.assessmentSuccessRate, 0.8);
  assert.equal(metrics.staleResultCount, null, 'no user result table is read by the coverage audit');
});
