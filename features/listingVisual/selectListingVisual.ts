import type { DiscoveryListing } from '../discovery/types.ts';
import { getVerifiedListingImage } from './registry.ts';
import { resolvedListingImage } from './resolvedRegistry.ts';
import type {
  ListingLocationPreview,
  ListingVisual,
  ListingVisualNone,
  VerifiedListingImageCandidate,
} from './types.ts';

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function getListingLocationFallback(
  listing: Pick<DiscoveryListing, 'latitude' | 'longitude'>,
): ListingLocationPreview | ListingVisualNone {
  if (
    listing.latitude === null
    || listing.longitude === null
    || !Number.isFinite(listing.latitude)
    || !Number.isFinite(listing.longitude)
  ) {
    return { kind: 'none', reason: 'missing_coordinates' };
  }
  return {
    kind: 'map_preview',
    latitude: listing.latitude,
    longitude: listing.longitude,
    label: '위치 미리보기',
    provenance: 'existing_listing_coordinate',
  };
}

export function isVerifiedImageCandidate(
  candidate: VerifiedListingImageCandidate | null | undefined,
): candidate is VerifiedListingImageCandidate {
  return Boolean(
    candidate
    && isHttpsUrl(candidate.url)
    && candidate.source.name.trim()
    && isHttpsUrl(candidate.source.pageUrl)
    && isHttpsUrl(candidate.reusePermission.referenceUrl)
    && (candidate.reusePermission.basis === 'open-license'
      || candidate.reusePermission.basis === 'written-permission'),
  );
}

export function selectListingVisual(
  listing: DiscoveryListing,
  // 손으로 등록한 검증 사진이 먼저다. 없으면 공식 출처에서 자동으로 찾아 허가까지 확인된 후보를 쓴다.
  candidate = getVerifiedListingImage(listing) ?? resolvedListingImage(listing),
): ListingVisual {
  const fallback = getListingLocationFallback(listing);
  if (!isVerifiedImageCandidate(candidate)) return fallback;
  return {
    kind: 'verified_image',
    url: candidate.url,
    source: candidate.source,
    attribution: candidate.attribution,
    reusePermission: candidate.reusePermission,
    fallback,
  };
}

export function getListingVisualErrorFallback(visual: ListingVisual): ListingLocationPreview | ListingVisualNone {
  if (visual.kind === 'verified_image') return visual.fallback;
  if (visual.kind === 'map_preview') return { kind: 'none', reason: 'preview_unavailable' };
  return visual;
}
