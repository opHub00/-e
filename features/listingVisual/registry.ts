import type { DiscoveryListing } from '../discovery/types.ts';
import type { VerifiedListingImageCandidate } from './types.ts';

/**
 * 검증 사진만 들어갈 수 있는 별도 registry.
 * V1 production에는 재사용 허가가 확인된 사진이 없어 의도적으로 비어 있다.
 */
const VERIFIED_LISTING_IMAGES: Readonly<Record<string, VerifiedListingImageCandidate>> = Object.freeze({});

export function listingVisualIdentity(listing: DiscoveryListing): string {
  const identifiers = listing.sourceIdentifiers;
  return identifiers
    ? `${listing.sourceType}:${identifiers.houseManageNo}:${identifiers.pblancNo}`
    : `${listing.sourceType}:${listing.id}`;
}

export function getVerifiedListingImage(
  listing: DiscoveryListing,
): VerifiedListingImageCandidate | undefined {
  return VERIFIED_LISTING_IMAGES[listingVisualIdentity(listing)];
}
