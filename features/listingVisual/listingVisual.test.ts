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

console.log('Listing visual enrichment tests passed.');
