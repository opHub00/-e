import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import officialCatalog from '../../../data/events/jeju-official-listing-catalog-2026-10-09.json' with { type: 'json' };
import liveReference from '../../../data/events/jeju-live-reference-2026-10-09.json' with { type: 'json' };
import { evaluateEvent } from '../evaluate.ts';
import { evidenceOnlyFacts, explainOutcome } from '../experience/explain.ts';
import { kioskEvent } from '../kioskEvent.ts';
import { DENSITY, densityFor, type Density } from '../layout/density.ts';
import { buildRecommendationPortfolio } from '../live/recommendation.ts';
import { buildServiceListingPortfolio } from '../live/portfolio.ts';
import type { OfficialCatalogListing } from '../live/types.ts';
import { evaluatePhase4Personas } from '../phase4Personas.ts';
import { containsRawKey } from '../presentation.ts';
import { cardModelFromOutcome, cardModelFromServiceListing } from './listingCardModel.ts';

const load = kioskEvent();
if (!load.ok) throw new Error(load.error);
const event = load.event;
const evidenceOnly = evidenceOnlyFacts(event.dataset);
const persona = evaluatePhase4Personas(event).find(item => item.personaId === 'NEWLYWED_ONE_CHILD')!;
const evaluation = evaluateEvent(event, persona.finalAnswers);
const servicePortfolio = buildServiceListingPortfolio({
  now: '2026-10-10T09:00:00.000+09:00', fetchedAt: liveReference.fetchedAt,
  liveRecords: liveReference.records, liveSourceStatus: 'LIVE', frozenDataset: event.dataset,
  officialCatalog: officialCatalog.records as OfficialCatalogListing[],
});

test('density: desktop compact, iPad comfortable, phone touch; big touch screens stay comfortable', () => {
  assert.equal(densityFor(1440), 'compact');
  assert.equal(densityFor(1280), 'compact');
  assert.equal(densityFor(1194), 'comfortable');
  assert.equal(densityFor(1024), 'comfortable');
  assert.equal(densityFor(768), 'comfortable');
  assert.equal(densityFor(390), 'touch');
  assert.equal(densityFor(1920, { coarsePointer: true }), 'comfortable');
  assert.equal(densityFor(0), 'comfortable');
});

test('density tokens keep controls accessible and fit three desktop cards', () => {
  for (const name of Object.keys(DENSITY) as Density[]) {
    assert.ok(DENSITY[name].control >= 44, name);
    assert.ok(DENSITY[name].controlLarge >= DENSITY[name].control, name);
  }
  const { compact, comfortable } = DENSITY;
  assert.ok(compact.control < comfortable.control && compact.cardPadding < comfortable.cardPadding);
  assert.ok(compact.cardBasis * 3 + compact.gridGap * 2 <= compact.contentMax);
  assert.equal(comfortable.control, 64);
});

test('V2 cards consume the current ServiceListing contract without duplicating location models', () => {
  for (const outcome of evaluation.outcomes) {
    const serviceListing = servicePortfolio.listings.find(item => item.assessmentListingId === outcome.listing.listingId) ?? null;
    const model = cardModelFromOutcome(outcome, explainOutcome(outcome, evidenceOnly), serviceListing);
    assert.equal(model.rank, outcome.rank);
    assert.equal(model.status.tone, outcome.bucket);
    assert.ok(model.recommendation);
    assert.ok(!/\d/.test(model.recommendation!.label));
    assert.ok(model.officialScore);
    if (!model.officialScore!.available) assert.ok(!/\d/.test(model.officialScore!.title));
    for (const text of [model.title, model.subtitle ?? '', model.stage ?? '', ...model.advantages, ...model.cautions]) assert.ok(!containsRawKey(text), text);
  }
  const informationOnly = servicePortfolio.listings.find(item => item.assessmentAvailability === 'INFORMATION_ONLY')!;
  const liveModel = cardModelFromServiceListing(informationOnly);
  assert.equal(liveModel.status.label, '공고 정보만 제공');
  assert.equal(liveModel.recommendation, null);
  assert.equal(liveModel.officialScore, null);
});

test('responsive summary uses the current 19-item deterministic recommendation portfolio', () => {
  const portfolio = buildRecommendationPortfolio({ listings: servicePortfolio, evaluation, favoriteIds: [evaluation.outcomes[0]!.id] });
  assert.equal(servicePortfolio.listings.length, 11);
  assert.equal(portfolio.items.length, 19);
  assert.equal(portfolio.items.filter(item => item.assessmentStatus === 'INFORMATION_ONLY').length, 10);
  assert.ok(portfolio.items.some(item => item.favorite));
  assert.ok(portfolio.items.every((item, index) => item.rank === index + 1));
  assert.ok(portfolio.items.filter(item => item.assessmentStatus === 'INFORMATION_ONLY').every(item => item.wanpanRecommendation.level === 'unavailable'));
});
