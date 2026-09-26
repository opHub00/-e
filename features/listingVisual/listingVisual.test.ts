import assert from 'node:assert/strict';
import { mockListingRecords } from '../discovery/data/mockListingRecords.ts';
import { normalizeListingRecord } from '../discovery/data/normalizeListing.ts';
import {
  getListingVisualErrorFallback,
  isVerifiedImageCandidate,
  selectListingVisual,
} from './selectListingVisual.ts';

const listing = normalizeListingRecord(mockListingRecords[0], {
  source: { id: 'listing-visual-test', kind: 'fixture', label: 'Listing visual test' },
  fetchedAt: '2026-09-11T00:00:00+09:00',
  referenceDate: new Date('2026-09-11T00:00:00+09:00'),
}).listing;
assert.ok(listing, 'fixture listing should normalize');
const mapPreview = selectListingVisual(listing);
assert.equal(mapPreview.kind, 'map_preview');
if (mapPreview.kind === 'map_preview') {
  assert.equal(mapPreview.latitude, listing.latitude);
  assert.equal(mapPreview.longitude, listing.longitude);
  assert.equal(mapPreview.provenance, 'existing_listing_coordinate');
}

const withoutCoordinates = { ...listing, latitude: null, longitude: null };
assert.deepEqual(selectListingVisual(withoutCoordinates), { kind: 'none', reason: 'missing_coordinates' });

const licensed = {
  url: 'https://images.example.com/listing.jpg',
  source: { name: '공식 공급기관', pageUrl: 'https://example.com/listing' },
  attribution: '공식 공급기관 제공',
  reusePermission: {
    basis: 'written-permission' as const,
    referenceUrl: 'https://example.com/permission',
  },
};
const verified = selectListingVisual(listing, licensed);
assert.equal(verified.kind, 'verified_image');
if (verified.kind === 'verified_image') {
  assert.equal(verified.fallback.kind, 'map_preview');
  assert.equal(getListingVisualErrorFallback(verified).kind, 'map_preview');
}

assert.equal(isVerifiedImageCandidate({ ...licensed, url: 'http://example.com/image.jpg' }), false);
assert.equal(isVerifiedImageCandidate({
  ...licensed,
  reusePermission: { ...licensed.reusePermission, referenceUrl: '' },
}), false);
assert.deepEqual(getListingVisualErrorFallback(mapPreview), { kind: 'none', reason: 'preview_unavailable' });

// 손으로 등록한 사진이 없어도, 공식 홈페이지에서 찾아 검증을 통과한 공고는 화면에 이미지가 실린다.
const sourced = selectListingVisual({ ...listing, id: 'apt-2026000404-2026000404' });
assert.equal(sourced.kind, 'sourced_image');
if (sourced.kind === 'sourced_image') {
  assert.match(sourced.url, /^https:\/\//);
  // 재사용 허가를 주장하지 않는다. verified_image 와 섞이면 안 된다.
  assert.equal('reusePermission' in sourced, false);
  assert.ok(sourced.attribution.includes('공식 분양 홈페이지'));
  // 이미지를 못 불러오면 기존 대체 표현으로 돌아간다.
  assert.equal(getListingVisualErrorFallback(sourced).kind, 'map_preview');
}

// 검증을 통과하지 못한 공고는 기존 fallback 을 그대로 쓴다.
for (const id of ['apt-2026000438-2026000438', 'apt-2026000446-2026000446']) {
  assert.equal(selectListingVisual({ ...listing, id }).kind, 'map_preview', `${id}: fallback 이어야 한다`);
}

console.log('Listing visual enrichment tests passed.');
