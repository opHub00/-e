import type { FrozenListingDataset, Listing, SourceDocument } from '../frozen/domain/rules.ts';
import type {
  ListingApplicationStatus,
  ListingMedia,
  ListingMediaImage,
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

export function emptyListingMedia(label: string): ListingMedia {
  return { primary: null, gallery: [], placeholder: { kind: 'HOUSING', label } };
}

function validMediaImage(value: ListingMediaImage): boolean {
  return Boolean(
    safeHttps(value.imageUrl)
    && safeHttps(value.sourceUrl)
    && value.sourceName.trim()
    && (value.license === null || value.license.trim())
    && (value.attribution === null || value.attribution.trim()),
  );
}

export function listingMedia(images: readonly ListingMediaImage[] | undefined, label: string): ListingMedia {
  const safe = (images ?? []).filter(validMediaImage);
  const unique = [...new Map(safe.map(image => [image.imageUrl, image])).values()];
  const chosen = unique.find(image => image.primary) ?? unique[0] ?? null;
  return { primary: chosen, gallery: chosen ? [chosen, ...unique.filter(image => image.imageUrl !== chosen.imageUrl)] : [], placeholder: { kind: 'HOUSING', label } };
}

export function imageFailureFallback(media: ListingMedia): ListingMedia {
  return emptyListingMedia(media.placeholder.label);
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
  const applicationStart = date(raw.RCEPT_BGNDE);
  const applicationEnd = date(raw.RCEPT_ENDDE);
  const status = applicationStatus(applicationStart, applicationEnd, now);
  const specialStart = date(raw.SPSPLY_RCEPT_BGNDE);
  const supplyTypes = specialStart ? ['특별공급', '일반공급'] : ['일반공급'];
  const households = number(raw.TOT_SUPLY_HSHLDCO);

  return {
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
    fetchedAt,
  };
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
    return {
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
      media: listingMedia(mediaByCanonicalKey[canonicalKey], listing.title),
      fetchedAt: dataset.frozenAt,
    } satisfies ServiceListing;
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
  const live = options.liveRecords.flatMap(raw => {
    const normalized = normalizeApplyHomeListing(raw, options.fetchedAt, options.now);
    return normalized ? [normalized] : [];
  });
  const listings = deduplicateListings([...live, ...frozen]);
  return {
    schemaVersion: 1,
    generatedAt: options.now,
    listings,
    sources: [
      { source: '한국부동산원 청약홈 분양정보', status: options.liveSourceStatus, fetchedAt: options.fetchedAt, recordCount: live.length },
      { source: 'jeju-event-2026-10-v1', status: 'STALE_REFERENCE', fetchedAt: options.frozenDataset.frozenAt, recordCount: frozen.length },
    ],
    usedFrozenFallback: options.liveSourceStatus !== 'LIVE',
  };
}

export function frozenOnlyPortfolio(dataset: FrozenListingDataset, now: string, message: string): ServiceListingPortfolio {
  const listings = buildFrozenReferenceListings(dataset, now);
  return {
    schemaVersion: 1,
    generatedAt: now,
    listings,
    sources: [
      { source: '한국부동산원 청약홈 분양정보', status: 'FAILED', fetchedAt: now, recordCount: 0, message },
      { source: 'jeju-event-2026-10-v1', status: 'STALE_REFERENCE', fetchedAt: dataset.frozenAt, recordCount: listings.length },
    ],
    usedFrozenFallback: true,
  };
}
