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
  candidate = getVerifiedListingImage(listing),
): ListingVisual {
  const fallback = getListingLocationFallback(listing);
  if (!isVerifiedImageCandidate(candidate)) {
    // 손으로 등록한 사진이 없으면, 공식 분양 홈페이지에서 자동으로 찾아 검증을 통과한 이미지를 쓴다.
    // 재사용 허가를 주장하지 않으므로 출처를 함께 들고 다니는 다른 종류로 돌려준다.
    const sourced = resolvedListingImage(listing);
    if (sourced) {
      return { kind: 'sourced_image', url: sourced.url, source: sourced.source,
        attribution: sourced.attribution, confidence: sourced.confidence, fallback };
    }
    return fallback;
  }
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
  if (visual.kind === 'verified_image' || visual.kind === 'sourced_image') return visual.fallback;
  if (visual.kind === 'map_preview') return { kind: 'none', reason: 'preview_unavailable' };
  return visual;
}
