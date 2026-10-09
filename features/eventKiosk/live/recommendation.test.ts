import assert from 'node:assert/strict';
import test from 'node:test';
import datasetJson from '../../../data/events/jeju-event-2026-10-v1.json' with { type: 'json' };
import reference from '../../../data/events/jeju-live-reference-2026-10-09.json' with { type: 'json' };
import officialCatalog from '../../../data/events/jeju-official-listing-catalog-2026-10-09.json' with { type: 'json' };
import { isValidResultSummary } from '../../../scripts/event-result-session-store.mjs';
import { evaluateEvent } from '../evaluate.ts';
import { loadEvent } from '../eventConfig.ts';
import type { FrozenListingDataset } from '../frozen/domain/rules.ts';
import { evaluatePhase4Personas } from '../phase4Personas.ts';
import { buildPortfolioSummary } from '../summary.ts';
import { isRenderableSummary } from '../experience/safeSummary.ts';
import { buildServiceListingPortfolio } from './portfolio.ts';
import { buildRecommendationPortfolio } from './recommendation.ts';
import type { OfficialCatalogListing } from './types.ts';

const dataset = datasetJson as FrozenListingDataset;
const event = loadEvent(dataset);
const persona = evaluatePhase4Personas(event).find(item => item.personaId === 'YOUNG_SINGLE')!;
const evaluation = evaluateEvent(event, persona.finalAnswers, new Date('2026-10-09T09:00:00+09:00'));
const listings = buildServiceListingPortfolio({
  now: '2026-10-09T09:00:00+09:00',
  fetchedAt: reference.fetchedAt,
  liveRecords: reference.records,
  liveSourceStatus: 'STALE_REFERENCE',
  frozenDataset: dataset,
  officialCatalog: officialCatalog.records as OfficialCatalogListing[],
});

test('recommendation ranking is deterministic and information-only listings never become COMPLETE', () => {
  const input = { listings, evaluation, favoriteIds: [evaluation.outcomes[0]!.id] };
  const first = buildRecommendationPortfolio(input);
  const second = buildRecommendationPortfolio(input);
  assert.deepEqual(first, second);
  assert.equal(first.items.filter(item => item.assessmentStatus === 'INFORMATION_ONLY').length, 10);
  assert.equal(first.items.filter(item => item.listing.assessmentAvailability === 'INFORMATION_ONLY').every(item => item.assessmentStatus === 'INFORMATION_ONLY'), true);
  assert.deepEqual(first.items.map(item => item.rank), first.items.map((_, index) => index + 1));
  assert.equal(first.items.some(item => item.favorite), true);
});

test('QR V2 is listing-centred, renderable by the session contract, and contains no private profile facts', () => {
  const portfolio = buildRecommendationPortfolio({ listings, evaluation, favoriteIds: [evaluation.outcomes[0]!.id] });
  const summary = buildPortfolioSummary({ eventId: event.config.id, portfolio });
  assert.equal(summary.v, 2);
  assert.equal(summary.household, null);
  assert.ok(summary.recommended.length > 0);
  assert.ok(summary.recommended.every(item => item.sourceUrl.startsWith('https://')));
  assert.equal(isValidResultSummary(summary), true);
  assert.equal(isRenderableSummary(summary), true);
  assert.doesNotMatch(JSON.stringify(summary), /displayName|birthDate|monthlyIncome|totalAssets|applicant|spouse/i);
});
