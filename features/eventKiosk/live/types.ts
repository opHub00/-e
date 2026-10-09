import type { FrozenListingDataset } from '../frozen/domain/rules.ts';
import type { ListingMedia, ListingMediaImage } from '../media/listingMedia.ts';
export type { ListingMedia, ListingMediaImage } from '../media/listingMedia.ts';

export type LiveListingLifecycle = 'LISTED' | 'RULE_PENDING' | 'ASSESSABLE' | 'ARCHIVED';
export type ListingAssessmentAvailability = 'ASSESSABLE' | 'INFORMATION_ONLY';
export type ListingApplicationStatus = 'OPEN' | 'UPCOMING' | 'CLOSED' | 'UNKNOWN';

export type ListingUnitInformation = {
  label: string;
  households: number | null;
  areaSquareMeters: number | null;
};

export type ServiceListing = {
  canonicalKey: string;
  origin: 'LIVE' | 'FROZEN_REFERENCE';
  source: 'APPLYHOME' | 'LH' | 'JPDC' | 'OFFICIAL_OTHER';
  sourceUrl: string;
  provider: string;
  noticeId: string;
  sourceId: string;
  title: string;
  housingName: string;
  region: '제주특별자치도';
  address: string;
  announcementDate: string;
  applicationStart: string | null;
  applicationEnd: string | null;
  resultDate: string | null;
  supplyTypes: string[];
  units: ListingUnitInformation[];
  eligibilitySource: string;
  originalDocuments: Array<{ url: string; label: string; sha256: string | null }>;
  lifecycle: LiveListingLifecycle;
  applicationStatus: ListingApplicationStatus;
  assessmentAvailability: ListingAssessmentAvailability;
  assessmentListingId: string | null;
  rulePackageId: string | null;
  media: ListingMedia;
  fetchedAt: string;
};

export type ListingSourceDiagnostic = {
  source: string;
  status: 'LIVE' | 'STALE_REFERENCE' | 'FAILED';
  fetchedAt: string;
  recordCount: number;
  message?: string;
};

export type ServiceListingPortfolio = {
  schemaVersion: 1;
  generatedAt: string;
  listings: ServiceListing[];
  sources: ListingSourceDiagnostic[];
  usedFrozenFallback: boolean;
};

export type ListingPortfolioOptions = {
  now: string;
  fetchedAt: string;
  liveRecords: readonly Readonly<Record<string, unknown>>[];
  liveSourceStatus: ListingSourceDiagnostic['status'];
  frozenDataset: FrozenListingDataset;
  mediaByCanonicalKey?: Readonly<Record<string, readonly ListingMediaImage[]>>;
};
