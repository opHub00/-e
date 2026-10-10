import type { FrozenListingDataset } from '../frozen/domain/rules.ts';
import type { ListingMedia, ListingMediaImage } from '../media/listingMedia.ts';
export type { ListingMedia, ListingMediaImage } from '../media/listingMedia.ts';

export type LiveListingLifecycle = 'LISTED' | 'RULE_PENDING' | 'ASSESSABLE' | 'ARCHIVED';
export type ListingAssessmentAvailability = 'ASSESSABLE' | 'INFORMATION_ONLY';
export type ListingApplicationStatus = 'OPEN' | 'UPCOMING' | 'CLOSED' | 'UNKNOWN';
export type ListingLocationStatus = 'RESOLVED' | 'MISSING' | 'FAILED';
export type ListingLocationSource = 'OFFICIAL_SOURCE' | 'KAKAO_LOCAL' | 'UNAVAILABLE';
export type ListingLocationPrecision = 'OFFICIAL' | 'ROAD_ADDRESS' | 'PARCEL_ADDRESS' | 'UNKNOWN';
export type NearbyPoiCategory = 'TRANSIT' | 'EDUCATION' | 'HOSPITAL' | 'SHOPPING' | 'PARK' | 'GOVERNMENT' | 'LANDMARK';

export type ListingLocation = {
  normalizedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  status: ListingLocationStatus;
  source: ListingLocationSource;
  precision?: ListingLocationPrecision;
};

export type NearbyPoi = {
  id: string;
  name: string;
  category: NearbyPoiCategory;
  latitude: number;
  longitude: number;
  straightDistanceMeters: number;
  routeDistanceMeters: number | null;
  source: string;
  sourceUrl: string | null;
};

export type ListingHighlightEvidence = {
  kind: 'POI' | 'OFFICIAL_LISTING';
  source: string;
  sourceUrl: string | null;
  poiId: string | null;
  distanceMeters: number | null;
};

export type ListingHighlight = {
  category: 'TRANSPORT' | 'EDUCATION' | 'MEDICAL' | 'CONVENIENCE' | 'GREEN' | 'AREA' | 'CAUTION';
  text: string;
  evidence: ListingHighlightEvidence;
};

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
  location: ListingLocation;
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
  nearbyPois: NearbyPoi[];
  sellingPoints: ListingHighlight[];
  locationCautions: ListingHighlight[];
  fetchedAt: string;
};

export type OfficialCatalogListing = {
  source: ServiceListing['source'];
  sourceUrl: string;
  provider: string;
  noticeId: string;
  sourceId: string;
  title: string;
  housingName: string;
  address: string;
  announcementDate: string;
  applicationStart: string | null;
  applicationEnd: string | null;
  resultDate: string | null;
  supplyTypes: string[];
  units: ListingUnitInformation[];
  originalDocuments: Array<{ url: string; label: string; sha256: string | null }>;
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
  coverage: {
    total: number;
    active: number;
    upcoming: number;
    recent: number;
    unknown: number;
    assessable: number;
    informationOnly: number;
    byProvider: Record<string, number>;
  };
  sources: ListingSourceDiagnostic[];
  usedFrozenFallback: boolean;
};

export type ListingPortfolioOptions = {
  now: string;
  fetchedAt: string;
  liveRecords: readonly Readonly<Record<string, unknown>>[];
  liveSourceStatus: ListingSourceDiagnostic['status'];
  frozenDataset: FrozenListingDataset;
  officialCatalog?: readonly OfficialCatalogListing[];
  mediaByCanonicalKey?: Readonly<Record<string, readonly ListingMediaImage[]>>;
};
