import type { FrozenListingDataset, Listing, SourceDocument } from '../frozen/domain/rules.ts';
import { listingMedia } from '../media/listingMedia.ts';
import { officialListingMediaImages } from '../media/officialListingMedia.ts';
import { locationFromOfficialRecord } from './location.ts';
import { generateListingHighlights } from './nearby.ts';
export { emptyListingMedia, imageFailureFallback, listingMedia } from '../media/listingMedia.ts';
import type {
  ListingApplicationStatus,
  ListingMediaImage,
  OfficialCatalogListing,
  ListingPortfolioOptions,
  ServiceListing,
  ServiceListingPortfolio,
} from './types.ts';

const text = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';

const date = (value: unknown): string | null => {
  const raw = text(value);
  const normalized = raw.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) && Number.isFinite(Date.parse(normalized)) ? normalized : null;
};

const number = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(text(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

function safeHttps(value: unknown): string | null {
  try {
    const parsed = new URL(text(value));
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : null;
  } catch {
    return null;
  }
}

function stablePart(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '');
}

export function canonicalListingKey(provider: string, noticeId: string): string {
  const providerPart = stablePart(provider);
  const noticePart = stablePart(noticeId);
  if (!providerPart || !noticePart) throw new Error('LISTING_IDENTITY_REQUIRED');
  return `${providerPart}:${noticePart}`;
}

export function applicationStatus(
  start: string | null,
  end: string | null,
  now: string,
): ListingApplicationStatus {
  const today = now.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return 'UNKNOWN';
  if (start && today < start) return 'UPCOMING';
  if (end && today > end) return 'CLOSED';
  if (start && end) return 'OPEN';
  return 'UNKNOWN';
}

export function normalizeApplyHomeListing(
  raw: Readonly<Record<string, unknown>>,
  fetchedAt: string,
  now: string,
  images?: readonly ListingMediaImage[],
): ServiceListing | null {
  const region = text(raw.SUBSCRPT_AREA_CODE_NM);
  const address = text(raw.HSSPLY_ADRES);
  if (!region.includes('제주') && !address.includes('제주')) return null;

  const houseManageNo = text(raw.HOUSE_MANAGE_NO);
  const pblancNo = text(raw.PBLANC_NO);
  const operation = text(raw.__applyHomeOperation) || 'getAPTLttotPblancDetail';
  const title = text(raw.HOUSE_NM);
  const sourceUrl = safeHttps(raw.PBLANC_URL);
  const announcementDate = date(raw.RCRIT_PBLANC_DE);
  if (!houseManageNo || !pblancNo || !title || !sourceUrl || !announcementDate) return null;

  const provider = '한국부동산원 청약홈';
  const noticeId = `${operation}:${houseManageNo}:${pblancNo}`;
  const canonicalKey = canonicalListingKey(provider, noticeId);
  const applicationStart = date(raw.RCEPT_BGNDE ?? raw.SUBSCRPT_RCEPT_BGNDE);
  const applicationEnd = date(raw.RCEPT_ENDDE ?? raw.SUBSCRPT_RCEPT_ENDDE);
  const status = applicationStatus(applicationStart, applicationEnd, now);
  const specialStart = date(raw.SPSPLY_RCEPT_BGNDE);
  const supplyTypes = applyHomeSupplyTypes(operation, Boolean(specialStart));
  const households = number(raw.TOT_SUPLY_HSHLDCO);

  const listing: ServiceListing = {
    canonicalKey,
    origin: 'LIVE',
    source: 'APPLYHOME',
    sourceUrl,
    provider,
    noticeId,
    sourceId: `applyhome:${noticeId}`,
    title,
    housingName: title,
    region: '제주특별자치도',
    address: address || '제주특별자치도',
    location: locationFromOfficialRecord(raw, address),
    announcementDate,
    applicationStart,
    applicationEnd,
    resultDate: date(raw.PRZWNER_PRESNATN_DE),
    supplyTypes,
    units: [{ label: '전체 공급', households, areaSquareMeters: null }],
    eligibilitySource: sourceUrl,
    originalDocuments: [{ url: sourceUrl, label: '청약홈 공식 공고', sha256: null }],
    lifecycle: status === 'CLOSED' ? 'ARCHIVED' : 'RULE_PENDING',
    applicationStatus: status,
    assessmentAvailability: 'INFORMATION_ONLY',
    assessmentListingId: null,
    rulePackageId: null,
    media: listingMedia(images, title),
    nearbyPois: [],
    sellingPoints: [],
    locationCautions: [],
    fetchedAt,
  };
  const generated = generateListingHighlights(listing, []);
  return { ...listing, sellingPoints: generated.sellingPoints, locationCautions: generated.cautions };
}

function applyHomeSupplyTypes(operation: string, hasSpecialSupply: boolean): string[] {
  if (operation === 'getUrbtyOfctlLttotPblancDetail') return ['오피스텔·도시형생활주택·민간임대'];
  if (operation === 'getRemndrLttotPblancDetail') return ['무순위·잔여세대'];
  if (operation === 'getPblPvtRentLttotPblancDetail') return ['공공지원민간임대'];
  if (operation === 'getOPTLttotPblancDetail') return ['임의공급'];
  return hasSpecialSupply ? ['특별공급', '일반공급'] : ['일반공급'];
}

function sourceKind(sourceId: string): ServiceListing['source'] {
  if (sourceId.startsWith('lh:')) return 'LH';
  if (sourceId.startsWith('jpdc:')) return 'JPDC';
  return 'OFFICIAL_OTHER';
}

function frozenDocuments(listing: Listing, documents: readonly SourceDocument[]) {
  const byId = new Map(documents.map(document => [document.id, document]));
  return listing.sourceDocumentIds.flatMap(id => {
    const document = byId.get(id);
    return document ? [{ url: document.officialUrl, label: document.fileName, sha256: document.sha256 }] : [];
  });
}

export function buildFrozenReferenceListings(
  dataset: FrozenListingDataset,
  now: string,
  mediaByCanonicalKey: Readonly<Record<string, readonly ListingMediaImage[]>> = {},
): ServiceListing[] {
  const packages = new Map(dataset.rulePackages.map(rulePackage => [rulePackage.listingId, rulePackage]));
  return dataset.listings.map(listing => {
    const provider = listing.publisher;
    const noticeId = listing.sourceId;
    const canonicalKey = canonicalListingKey(provider, noticeId);
    const rulePackage = packages.get(listing.id);
    const status = applicationStatus(listing.applicationStartDate, listing.applicationEndDate, now);
    const serviceListing: ServiceListing = {
      canonicalKey,
      origin: 'FROZEN_REFERENCE',
      source: sourceKind(listing.sourceId),
      sourceUrl: listing.officialUrl,
      provider,
      noticeId,
      sourceId: listing.sourceId,
      title: listing.title,
      housingName: listing.title,
      region: listing.region,
      address: listing.locations.join(' · '),
      location: locationFromOfficialRecord({}, listing.locations.join(' · ')),
      announcementDate: listing.announcementDate,
      applicationStart: listing.applicationStartDate,
      applicationEnd: listing.applicationEndDate,
      resultDate: null,
      supplyTypes: listing.supplyTypes,
      units: [],
      eligibilitySource: listing.officialUrl,
      originalDocuments: frozenDocuments(listing, dataset.sourceDocuments),
      lifecycle: status === 'CLOSED' ? 'ARCHIVED' : 'ASSESSABLE',
      applicationStatus: status,
      assessmentAvailability: listing.reviewStatus === 'APPROVED_FOR_EVENT' ? 'ASSESSABLE' : 'INFORMATION_ONLY',
      assessmentListingId: listing.reviewStatus === 'APPROVED_FOR_EVENT' ? listing.id : null,
      rulePackageId: rulePackage?.reviewStatus === 'APPROVED_FOR_EVENT' ? rulePackage.id : null,
      media: listingMedia(mediaByCanonicalKey[canonicalKey] ?? officialListingMediaImages(listing.sourceId), listing.title),
      nearbyPois: [],
      sellingPoints: [],
      locationCautions: [],
      fetchedAt: dataset.frozenAt,
    };
    const generated = generateListingHighlights(serviceListing, []);
    return { ...serviceListing, sellingPoints: generated.sellingPoints, locationCautions: generated.cautions };
  });
}

export function buildOfficialCatalogListings(
  catalog: readonly OfficialCatalogListing[],
  now: string,
  mediaByCanonicalKey: Readonly<Record<string, readonly ListingMediaImage[]>> = {},
): ServiceListing[] {
  return catalog.map(record => {
    const canonicalKey = canonicalListingKey(record.provider, record.noticeId);
    const status = applicationStatus(record.applicationStart, record.applicationEnd, now);
    const listing: ServiceListing = {
      canonicalKey,
      origin: 'LIVE',
      source: record.source,
      sourceUrl: record.sourceUrl,
      provider: record.provider,
      noticeId: record.noticeId,
      sourceId: record.sourceId,
      title: record.title,
      housingName: record.housingName,
      region: '제주특별자치도',
      address: record.address,
      location: locationFromOfficialRecord({}, record.address),
      announcementDate: record.announcementDate,
      applicationStart: record.applicationStart,
      applicationEnd: record.applicationEnd,
      resultDate: record.resultDate,
      supplyTypes: [...record.supplyTypes],
      units: record.units.map(unit => ({ ...unit })),
      eligibilitySource: record.sourceUrl,
      originalDocuments: record.originalDocuments.map(document => ({ ...document })),
      lifecycle: status === 'CLOSED' ? 'ARCHIVED' : 'RULE_PENDING',
      applicationStatus: status,
      assessmentAvailability: 'INFORMATION_ONLY',
      assessmentListingId: null,
      rulePackageId: null,
      media: listingMedia(mediaByCanonicalKey[canonicalKey] ?? officialListingMediaImages(record.sourceId), record.title),
      nearbyPois: [],
      sellingPoints: [],
      locationCautions: [],
      fetchedAt: record.fetchedAt,
    };
    const generated = generateListingHighlights(listing, []);
    return { ...listing, sellingPoints: generated.sellingPoints, locationCautions: generated.cautions };
  });
}

export function deduplicateListings(listings: readonly ServiceListing[]): ServiceListing[] {
  const unique = new Map<string, ServiceListing>();
  for (const listing of listings) {
    const prior = unique.get(listing.canonicalKey);
    if (!prior) {
      unique.set(listing.canonicalKey, listing);
      continue;
    }
    const priorAssessable = prior.assessmentAvailability === 'ASSESSABLE';
    const nextAssessable = listing.assessmentAvailability === 'ASSESSABLE';
    if ((nextAssessable && !priorAssessable) || (nextAssessable === priorAssessable && listing.fetchedAt > prior.fetchedAt)) {
      unique.set(listing.canonicalKey, listing);
    }
  }
  return [...unique.values()];
}

export function buildServiceListingPortfolio(options: ListingPortfolioOptions): ServiceListingPortfolio {
  const frozen = buildFrozenReferenceListings(options.frozenDataset, options.now, options.mediaByCanonicalKey);
  const catalog = buildOfficialCatalogListings(options.officialCatalog ?? [], options.now, options.mediaByCanonicalKey);
  const live = options.liveRecords.flatMap(raw => {
    const normalized = normalizeApplyHomeListing(raw, options.fetchedAt, options.now);
    return normalized ? [normalized] : [];
  });
  const listings = deduplicateListings([...live, ...catalog, ...frozen]);
  return {
    schemaVersion: 1,
    generatedAt: options.now,
    listings,
    coverage: listingCoverage(listings, options.now),
    sources: [
      { source: '한국부동산원 청약홈 분양정보', status: options.liveSourceStatus, fetchedAt: options.fetchedAt, recordCount: live.length },
      { source: 'LH·JPDC 공식 공고 catalog', status: 'STALE_REFERENCE', fetchedAt: options.fetchedAt, recordCount: catalog.length },
      { source: 'jeju-event-2026-10-v1', status: 'STALE_REFERENCE', fetchedAt: options.frozenDataset.frozenAt, recordCount: frozen.length },
    ],
    usedFrozenFallback: options.liveSourceStatus !== 'LIVE',
  };
}

export function frozenOnlyPortfolio(
  dataset: FrozenListingDataset,
  now: string,
  message: string,
  officialCatalog: readonly OfficialCatalogListing[] = [],
): ServiceListingPortfolio {
  const listings = buildFrozenReferenceListings(dataset, now);
  const catalog = buildOfficialCatalogListings(officialCatalog, now);
  const combined = deduplicateListings([...catalog, ...listings]);
  return {
    schemaVersion: 1,
    generatedAt: now,
    listings: combined,
    coverage: listingCoverage(combined, now),
    sources: [
      { source: '한국부동산원 청약홈 분양정보', status: 'FAILED', fetchedAt: now, recordCount: 0, message },
      { source: 'LH·JPDC 공식 공고 catalog', status: 'STALE_REFERENCE', fetchedAt: now, recordCount: catalog.length },
      { source: 'jeju-event-2026-10-v1', status: 'STALE_REFERENCE', fetchedAt: dataset.frozenAt, recordCount: listings.length },
    ],
    usedFrozenFallback: true,
  };
}

export function listingCoverage(listings: readonly ServiceListing[], now: string): ServiceListingPortfolio['coverage'] {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - 180);
  const cutoffDate = Number.isFinite(cutoff.getTime()) ? cutoff.toISOString().slice(0, 10) : '0000-00-00';
  const byProvider: Record<string, number> = {};
  for (const listing of listings) byProvider[listing.source] = (byProvider[listing.source] ?? 0) + 1;
  return {
    total: listings.length,
    active: listings.filter(listing => listing.applicationStatus === 'OPEN').length,
    upcoming: listings.filter(listing => listing.applicationStatus === 'UPCOMING').length,
    recent: listings.filter(listing => listing.applicationStatus === 'CLOSED' && listing.announcementDate >= cutoffDate).length,
    unknown: listings.filter(listing => listing.applicationStatus === 'UNKNOWN').length,
    assessable: listings.filter(listing => listing.assessmentAvailability === 'ASSESSABLE').length,
    informationOnly: listings.filter(listing => listing.assessmentAvailability === 'INFORMATION_ONLY').length,
    byProvider,
  };
}
