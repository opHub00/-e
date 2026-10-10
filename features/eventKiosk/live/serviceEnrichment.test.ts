import assert from 'node:assert/strict';
import test from 'node:test';
import reference from '../../../data/events/jeju-live-reference-2026-10-09.json' with { type: 'json' };
import { enrichListingLocations, MemoryListingLocationCache, normalizeListingAddress } from './location.ts';
import { enrichNearbyPois, MemoryNearbyPoiCache } from './nearby.ts';
import { normalizeApplyHomeListing } from './portfolio.ts';

const NOW = '2026-10-09T09:00:00.000+09:00';
const base = normalizeApplyHomeListing(reference.records[0]!, reference.fetchedAt, NOW)!;

test('location normalization is Jeju-specific and provider-neutral', () => {
  assert.equal(normalizeListingAddress(' 제주시  이도이동 1045-3번지 '), '제주특별자치도 제주시 이도이동 1045-3번지');
  assert.equal(normalizeListingAddress('서울특별시 강남구'), null);
});

test('location geocoding uses a TTL cache and preserves missing coordinates', async () => {
  let calls = 0;
  const provider = { id: 'TEST', geocode: async () => { calls += 1; return { latitude: 33.5, longitude: 126.53, precision: 'ROAD_ADDRESS' as const }; } };
  const cache = new MemoryListingLocationCache();
  const first = await enrichListingLocations([base], provider, cache);
  const second = await enrichListingLocations([base], provider, cache);
  assert.equal(calls, 1);
  assert.equal(first[0]?.location.status, 'RESOLVED');
  assert.equal(first[0]?.location.precision, 'ROAD_ADDRESS');
  assert.deepEqual(first[0]?.location, second[0]?.location);

  const failed = await enrichListingLocations([base], { id: 'FAIL', geocode: async () => { throw new Error('down'); } });
  assert.equal(failed[0]?.location.status, 'FAILED');
});

test('POI cache is reused, missing coordinates skip calls, and provider failure degrades safely', async () => {
  const located = { ...base, location: { normalizedAddress: base.address, latitude: 33.5, longitude: 126.53, status: 'RESOLVED' as const, source: 'OFFICIAL_SOURCE' as const } };
  let calls = 0;
  const provider = {
    id: 'TEST_POI',
    search: async () => {
      calls += 1;
      return [{ id: 'bus-1', name: '중앙로 버스정류장', category: 'TRANSIT' as const, latitude: 33.5008, longitude: 126.53, routeDistanceMeters: null, source: '공식 지도', sourceUrl: null }];
    },
  };
  const cache = new MemoryNearbyPoiCache();
  const first = await enrichNearbyPois([located], provider, cache);
  const second = await enrichNearbyPois([located], provider, cache);
  assert.equal(calls, 1);
  assert.equal(first[0]?.nearbyPois.length, 1);
  assert.match(first[0]?.sellingPoints[0]?.text ?? '', /버스정류장/);
  assert.deepEqual(first[0]?.nearbyPois, second[0]?.nearbyPois);

  const missing = await enrichNearbyPois([base], provider, cache);
  assert.equal(calls, 1);
  assert.equal(missing[0]?.nearbyPois.length, 0);

  const failed = await enrichNearbyPois([located], { id: 'FAIL', search: async () => { throw new Error('down'); } });
  assert.match(failed[0]?.locationCautions.at(-1)?.text ?? '', /불러오지 못해/);
});
