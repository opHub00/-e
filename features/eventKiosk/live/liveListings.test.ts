import assert from 'node:assert/strict';
import test from 'node:test';
import datasetJson from '../../../data/events/jeju-event-2026-10-v1.json' with { type: 'json' };
import reference from '../../../data/events/jeju-live-reference-2026-10-09.json' with { type: 'json' };
import type { FrozenListingDataset } from '../frozen/domain/rules.ts';
import {
  buildFrozenReferenceListings,
  buildServiceListingPortfolio,
  deduplicateListings,
  emptyListingMedia,
  imageFailureFallback,
  listingMedia,
  normalizeApplyHomeListing,
} from './portfolio.ts';
import { fetchOfficialJejuListings } from './source.ts';

const dataset = datasetJson as FrozenListingDataset;
const raw = reference.records[0] as Readonly<Record<string, unknown>>;
const NOW = '2026-10-09T09:00:00.000+09:00';

test('official ApplyHome record becomes an information-only Jeju listing', () => {
  const listing = normalizeApplyHomeListing(raw, reference.fetchedAt, NOW);
  assert.ok(listing);
  assert.equal(listing.title, '제주시 이도이동 아이린8차 아파트');
  assert.equal(listing.applicationStatus, 'UPCOMING');
  assert.equal(listing.lifecycle, 'RULE_PENDING');
  assert.equal(listing.assessmentAvailability, 'INFORMATION_ONLY');
  assert.equal(listing.units[0]?.households, 45);
});

test('provider plus notice id deduplicates repeated source rows', () => {
  const listing = normalizeApplyHomeListing(raw, reference.fetchedAt, NOW)!;
  const newer = { ...listing, fetchedAt: '2026-10-09T00:00:00.000Z' };
  const deduped = deduplicateListings([listing, newer]);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]?.fetchedAt, newer.fetchedAt);
});

test('source failure can return the complete frozen reference dataset', () => {
  const portfolio = buildServiceListingPortfolio({
    now: NOW,
    fetchedAt: reference.fetchedAt,
    liveRecords: [],
    liveSourceStatus: 'FAILED',
    frozenDataset: dataset,
  });
  assert.equal(portfolio.usedFrozenFallback, true);
  assert.equal(portfolio.listings.length, 5);
  assert.equal(portfolio.listings.every(listing => listing.origin === 'FROZEN_REFERENCE'), true);
});

test('expired live notices are archived without becoming assessable', () => {
  const listing = normalizeApplyHomeListing(raw, reference.fetchedAt, '2026-10-20T00:00:00.000Z');
  assert.equal(listing?.lifecycle, 'ARCHIVED');
  assert.equal(listing?.assessmentAvailability, 'INFORMATION_ONLY');
});

test('only APPROVED_FOR_EVENT frozen listings bind to approved rule packages', () => {
  const listings = buildFrozenReferenceListings(dataset, NOW);
  assert.equal(listings.length, 5);
  assert.equal(listings.every(listing => listing.assessmentAvailability === 'ASSESSABLE'), true);
  assert.equal(listings.every(listing => Boolean(listing.rulePackageId)), true);
});

test('the exact LH frozen notice uses one official media contract for card, detail and story', () => {
  const frozen = buildFrozenReferenceListings(dataset, NOW);
  const listing = frozen.find(item => item.sourceId === 'lh:pan:2015122300020804');
  assert.ok(listing);
  assert.equal(listing.media.gallery.length, 3);
  assert.equal(listing.media.primary?.sourceLabel, 'LH청약플러스');
  assert.equal(listing.media.primary?.sourceUrl, listing.sourceUrl);
  assert.match(listing.media.primary?.uri ?? '', /^https:\/\/apply\.lh\.or\.kr\/upload\//);
  assert.equal(listing.media.primary?.kind, 'render');
});

test('media keeps official provenance and broken images collapse to housing fallback', () => {
  const media = listingMedia([{
    uri: 'https://official.example/housing.jpg',
    alt: '테스트 주택 전경',
    sourceUrl: 'https://official.example/project',
    sourceLabel: '공식 단지 홈페이지',
    attribution: '공식 제공',
    license: null,
    kind: 'photo',
    primary: true,
  }], '테스트 주택');
  assert.equal(media.primary?.uri, 'https://official.example/housing.jpg');
  assert.deepEqual(imageFailureFallback(media), emptyListingMedia('테스트 주택'));
  assert.equal(listingMedia([{ ...media.primary!, uri: 'http://unsafe.example/image.jpg' }], '테스트').primary, null);
});

test('structured source fetch filters non-Jeju records and does not require HTML scraping', async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({
    records: [raw, { ...raw, PBLANC_NO: 'other', SUBSCRPT_AREA_CODE_NM: '서울', HSSPLY_ADRES: '서울특별시' }],
    fetchedAt: reference.fetchedAt,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  const result = await fetchOfficialJejuListings({
    now: new Date('2026-10-09T00:00:00.000Z'),
    fetcher,
    env: { EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon' },
  });
  assert.equal(result.transport, 'EXISTING_OFFICIAL_PROXY');
  assert.equal(result.records.length, 1);
});
