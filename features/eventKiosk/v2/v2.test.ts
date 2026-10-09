import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import reference from '../../../data/events/jeju-live-reference-2026-10-09.json' with { type: 'json' };
import { evaluateEvent } from '../evaluate.ts';
import { evidenceOnlyFacts, explainOutcome } from '../experience/explain.ts';
import { kioskEvent } from '../kioskEvent.ts';
import { DENSITY, densityFor, type Density } from '../layout/density.ts';
import { normalizeApplyHomeListing } from '../live/portfolio.ts';
import { featuresOf, normalizeListingFeatures } from '../location/listingFeatures.ts';
import { externalMapUrl, formatDistance, locationOf, nearbyHighlights, normalizeListingLocation, normalizeNearbyPlaces } from '../location/locationModel.ts';
import { evaluatePhase4Personas } from '../phase4Personas.ts';
import { containsRawKey } from '../presentation.ts';
import { cardModelFromOutcome, cardModelFromServiceListing } from './listingCardModel.ts';
import { buildRecommendationSummary } from './recommendationSummary.ts';

const load = kioskEvent();
if (!load.ok) throw new Error(load.error);
const event = load.event;
const evidenceOnly = evidenceOnlyFacts(event.dataset);
const persona = evaluatePhase4Personas(event).find(item => item.personaId === 'NEWLYWED_ONE_CHILD')!;
const evaluation = evaluateEvent(event, persona.finalAnswers);

test('density: desktop compact, iPad comfortable, phone touch; big touch screens stay comfortable', () => {
  assert.equal(densityFor(1440), 'compact');
  assert.equal(densityFor(1280), 'compact');
  assert.equal(densityFor(1194), 'comfortable', 'iPad Pro 11 landscape');
  assert.equal(densityFor(1024), 'comfortable');
  assert.equal(densityFor(768), 'comfortable');
  assert.equal(densityFor(390), 'touch');
  assert.equal(densityFor(1920, { coarsePointer: true }), 'comfortable');
  assert.equal(densityFor(0), 'comfortable', 'before the page is attached: same as the static render');
});

test('density tokens: every control is at least 44px, desktop is denser than iPad, iPad keeps today’s size', () => {
  for (const name of Object.keys(DENSITY) as Density[]) {
    assert.ok(DENSITY[name].control >= 44, name);
    assert.ok(DENSITY[name].controlLarge >= DENSITY[name].control, name);
  }
  const { compact, comfortable } = DENSITY;
  assert.ok(compact.control < comfortable.control && compact.cardPadding < comfortable.cardPadding && compact.sectionGap < comfortable.sectionGap);
  assert.ok(compact.cardBasis * 3 + compact.gridGap * 2 <= compact.contentMax, 'three cards per row fit on desktop');
  assert.equal(comfortable.control, 64, 'iPad/kiosk keeps the large touch control');
});

test('location and POI input is read defensively and sorted by distance', () => {
  assert.equal(normalizeListingLocation(null), null);
  assert.equal(normalizeListingLocation({ lat: 999, lng: 1 }), null, 'out-of-range coordinates without an address are dropped');
  const exact = normalizeListingLocation({ latitude: '33.5', longitude: '126.53', address: '주소', source: { label: '공고문', url: 'http://insecure' } })!;
  assert.deepEqual([exact.lat, exact.lng, exact.precision, exact.source], [33.5, 126.53, 'EXACT', { label: '공고문', url: null }]);
  assert.equal(normalizeListingLocation({ district: '어느 시' })!.precision, 'DISTRICT');

  const places = normalizeNearbyPlaces([
    { name: '마트', category: '마트', distance_m: 760 },
    { name: '정류장', category: 'bus', distanceMeters: 180 },
    { name: '학교', category: 'SCHOOL', distanceMeters: '520' },
    { name: '이름만' },
    { name: '음수', distanceMeters: -1 },
    'x',
  ]);
  assert.deepEqual(places.map(place => [place.name, place.category]), [['정류장', 'TRANSIT'], ['학교', 'SCHOOL'], ['마트', 'MART']]);
  assert.deepEqual(nearbyHighlights(places).map(place => place.name), ['정류장', '학교']);
  assert.deepEqual(formatDistance({ distanceMeters: 520, walkMinutes: null }), { primary: '도보 8분', secondary: '520m' });
  assert.deepEqual(formatDistance({ distanceMeters: 760, walkMinutes: 11 }), { primary: '도보 11분', secondary: '760m' });
  assert.deepEqual(formatDistance({ distanceMeters: 1900, walkMinutes: null }), { primary: '1.9km', secondary: null });
  assert.match(externalMapUrl(exact, '공고')!, /^https:\/\/map\.kakao\.com\/link\/map\//);
  assert.deepEqual(locationOf({}), { location: null, nearby: [] });
});

test('selling points without evidence are never shown', () => {
  const features = normalizeListingFeatures([
    { text: '근거 있는 특징', evidence: { label: '모집공고 2.', page: 3 }, kind: 'SUPPLY' },
    { text: '근거 없는 홍보 문구' },
    { label: '다른 필드 이름', sourceLabel: '공식 자료', sourceUrl: 'https://example.org/a' },
    { text: 'x'.repeat(120), evidence: { label: '너무 긴 문장' } },
  ]);
  assert.deepEqual(features.map(item => item.text), ['근거 있는 특징', '다른 필드 이름']);
  assert.equal(features[1].evidence.url, 'https://example.org/a');
  assert.deepEqual(featuresOf({}), []);
});

test('V2 card model keeps the existing card meaning and never leaks raw keys', () => {
  for (const outcome of evaluation.outcomes) {
    const model = cardModelFromOutcome(outcome, explainOutcome(outcome, evidenceOnly));
    assert.equal(model.rank, outcome.rank);
    assert.equal(model.status.tone, outcome.bucket);
    assert.ok(model.recommendation, 'wanpan recommendation stays qualitative');
    assert.ok(!/\d/.test(model.recommendation!.label));
    assert.ok(model.officialScore);
    if (!model.officialScore!.available) assert.ok(!/\d/.test(model.officialScore!.title), 'no score number when there is no official score');
    assert.ok(model.application, 'application dates come from the dataset');
    for (const text of [model.title, model.subtitle ?? '', model.stage ?? '', ...model.advantages, ...model.cautions]) assert.ok(!containsRawKey(text), text);
    assert.deepEqual(model.nearby, [], 'no POI data yet → no nearby line');
  }
});

test('V2 card model reads live information-only listings with a graceful fallback', () => {
  const listing = normalizeApplyHomeListing(reference.records[0] as Record<string, unknown>, reference.fetchedAt, '2026-10-09T09:00:00.000+09:00')!;
  const model = cardModelFromServiceListing(listing);
  assert.equal(model.status.label, '공고 정보만 제공');
  assert.equal(model.recommendation, null);
  assert.equal(model.officialScore, null);
  assert.ok(model.application?.label.startsWith('접수 '));
  assert.ok(model.note?.includes('판정'));
});

test('Recommendation Summary V2 leads with where to apply and keeps the profile secondary', () => {
  const favorites = [evaluation.outcomes[2].id, evaluation.outcomes[0].id];
  const summary = buildRecommendationSummary({ evaluation, favoriteIds: favorites, explain: outcome => explainOutcome(outcome, evidenceOnly), answers: persona.finalAnswers });
  const firstEligible = evaluation.outcomes.find(outcome => outcome.bucket === 'eligible')!;
  assert.equal(summary.top?.outcomeId, firstEligible.id);
  assert.deepEqual(summary.favorites.map(item => item.outcomeId), favorites);
  const shown = new Set([summary.top?.outcomeId, ...summary.favorites.map(item => item.outcomeId)]);
  assert.ok(summary.alsoReview.every(item => !shown.has(item.outcomeId) && item.tone !== 'difficult'));
  assert.ok(summary.alsoReview.length <= 3);
  assert.ok(summary.schedule.length >= 1);
  assert.equal(new Set(summary.schedule.map(item => item.listingId)).size, summary.schedule.length, 'one schedule row per listing');
  assert.ok(summary.why.length >= 1);
  assert.ok(summary.cautions.length <= 5);
  assert.equal(summary.profile.household, '자녀가 있는 가구');
  assert.ok(summary.profile.lines.every(line => !/\d{3,}|원/.test(line)), 'no income/asset numbers in the profile');
  for (const text of [...summary.why, ...summary.cautions, ...summary.schedule.map(item => item.label)]) assert.ok(!containsRawKey(text), text);
  const empty = buildRecommendationSummary({ evaluation: { ...evaluation, outcomes: evaluation.outcomes.filter(outcome => outcome.bucket !== 'eligible') }, favoriteIds: [], explain: outcome => explainOutcome(outcome, evidenceOnly), answers: null });
  assert.equal(empty.top, null);
  assert.deepEqual(empty.profile, { household: null, lines: [] });
});
