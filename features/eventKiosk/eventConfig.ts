import { assertDatasetBindings } from './frozen/engine/batch.ts';
import type { FrozenListingDataset, Listing } from './frozen/domain/rules.ts';

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
      landingTitle: '제주에서 나에게 맞는 청약을 찾아보세요.',
      landingSubtitle: '한 번 입력하면 공식 제주 공고 5개와 공급유형 9개를 한눈에 비교해요.',
      landingCta: '체험 시작하기',
      introSteps: ['가구와 신청자 정보를 입력하고', '검수 완료된 제주 공고 9개 공급을 분석한 뒤', '자격·순위·공식 배점·완판e 추천을 나눠 비교합니다.'],
    },
    idleResetSeconds: 150,
    idleWarningSeconds: 20,
    shareBaseUrl: null,
    listings,
  };
  return { config, dataset, listingsById: new Map(listings.map(listing => [listing.listingId, listing])) };
}
