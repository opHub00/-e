import { assertDatasetBindings } from './frozen/engine/batch.ts';
import type { FrozenListingDataset, Listing } from './frozen/domain/rules.ts';
import type { ListingMedia } from './media/listingMedia.ts';
import { officialListingMedia } from './media/officialListingMedia.ts';
import { SAMDO_EVENT_COPY } from './samdoEventScope.ts';

export type RecruitmentStatus = 'open' | 'upcoming' | 'closed' | 'unknown';

export type EventListing = {
  listingId: string;
  sourceId: string;
  title: string;
  district: string;
  housingType: string;
  publisher: string;
  address: string;
  households: number | null;
  announcementDate: string;
  recruitment: { status: RecruitmentStatus; startDate: string; endDate: string };
  winnerAnnouncementDate: null;
  sourceUrl: string;
  sourceNote: string;
  reviewStatus: Listing['reviewStatus'];
  sourceDocumentIds: string[];
  origin: 'FROZEN_REFERENCE';
  assessmentAvailability: 'ASSESSABLE';
  media: ListingMedia;
};

export type EventConfig = {
  id: string;
  datasetVersion: string;
  frozenAt: string;
  fingerprint: string;
  sourceFingerprint: string;
  regionLabel: string;
  residenceRegion: string;
  copy: {
    brand: string;
    landingTitle: string;
    landingSubtitle: string;
    landingCta: string;
    introSteps: string[];
  };
  idleResetSeconds: number;
  idleWarningSeconds: number;
  shareBaseUrl: string | null;
  listings: EventListing[];
};

export type LoadedEvent = {
  config: EventConfig;
  dataset: FrozenListingDataset;
  listingsById: Map<string, EventListing>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function recruitmentStatus(listing: Listing, eventDate: string): RecruitmentStatus {
  if (eventDate < listing.applicationStartDate) return 'upcoming';
  if (eventDate > listing.applicationEndDate) return 'closed';
  return 'open';
}

function housingLabel(kind: Listing['housingKind']): string {
  return kind === 'PUBLIC_RENTAL' ? '행복주택 · 공공임대' : '매입임대';
}

function districtOf(listing: Listing): string {
  const location = listing.locations[0] ?? '제주특별자치도';
  if (location.includes('서귀포')) return '서귀포시';
  if (location.includes('제주')) return '제주시';
  return '제주특별자치도';
}

function eventListing(listing: Listing, dataset: FrozenListingDataset): EventListing {
  return {
    listingId: listing.id,
    sourceId: listing.sourceId,
    title: listing.title,
    district: districtOf(listing),
    housingType: housingLabel(listing.housingKind),
    publisher: listing.publisher,
    address: listing.locations.join(' · '),
    households: null,
    announcementDate: listing.announcementDate,
    recruitment: {
      status: recruitmentStatus(listing, dataset.eventDate),
      startDate: listing.applicationStartDate,
      endDate: listing.applicationEndDate,
    },
    winnerAnnouncementDate: null,
    sourceUrl: listing.officialUrl,
    sourceNote: `공식 원문 검수 완료 · 행사 데이터 ${dataset.datasetVersion}`,
    reviewStatus: listing.reviewStatus,
    sourceDocumentIds: [...listing.sourceDocumentIds],
    origin: 'FROZEN_REFERENCE',
    assessmentAvailability: 'ASSESSABLE',
    media: officialListingMedia(listing.sourceId, listing.title),
  };
}

export function loadEvent(raw: unknown): LoadedEvent {
  if (!isRecord(raw)) throw new Error('EVENT_DATASET_INVALID:root');
  const dataset = raw as unknown as FrozenListingDataset;
  assertDatasetBindings(dataset);
  if (dataset.eventId !== 'wanpan-jeju-event-2026-10') throw new Error('EVENT_DATASET_INVALID:eventId');
  if (dataset.datasetVersion !== '2026.10.0-rc1') throw new Error('EVENT_DATASET_INVALID:datasetVersion');
  if (dataset.fingerprint !== 'sha256:51aeeb22999594de30b2d032e2c885f3395cf18fb9dea2f43dacbb156fa0f5c8') {
    throw new Error('EVENT_DATASET_INVALID:fingerprint');
  }
  const listings = dataset.listings.map(listing => eventListing(listing, dataset));
  const config: EventConfig = {
    id: dataset.eventId,
    datasetVersion: dataset.datasetVersion,
    frozenAt: dataset.frozenAt,
    fingerprint: dataset.fingerprint,
    sourceFingerprint: dataset.sourceFingerprint,
    regionLabel: '제주',
    residenceRegion: dataset.region,
    copy: {
      brand: '완판e',
      landingTitle: SAMDO_EVENT_COPY.landingTitle,
      landingSubtitle: SAMDO_EVENT_COPY.landingSubtitle,
      landingCta: SAMDO_EVENT_COPY.landingCta,
      introSteps: [...SAMDO_EVENT_COPY.introSteps],
    },
    idleResetSeconds: 150,
    idleWarningSeconds: 20,
    shareBaseUrl: null,
    listings,
  };
  return { config, dataset, listingsById: new Map(listings.map(listing => [listing.listingId, listing])) };
}
