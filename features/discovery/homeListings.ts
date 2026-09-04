import type { UserProfile } from '../../domain/types.ts';
import { sortListings } from './domain.ts';
import type { DiscoveryListing } from './types.ts';

type HomeDiscoveryProfile = UserProfile & { preferredRegions?: readonly string[] };

export function resolveSavedListings(
  listings: readonly DiscoveryListing[],
  savedListingIds: readonly string[],
): DiscoveryListing[] {
  const byId = new Map(listings.map((listing) => [listing.id, listing]));
  return savedListingIds
    .map((id) => byId.get(id))
    .filter((listing): listing is DiscoveryListing => Boolean(listing));
}

export function getHomeRecommendations(
  listings: readonly DiscoveryListing[],
  profile: HomeDiscoveryProfile,
  savedListingIds: readonly string[],
  limit = 3,
): DiscoveryListing[] {
  const safeLimit = Math.min(4, Math.max(2, limit));
  const saved = new Set(savedListingIds);
  return sortListings(
    listings.filter(
      (listing) => listing.recruitmentStatus !== 'closed' && !saved.has(listing.id),
    ),
    profile,
    true,
  ).slice(0, safeLimit);
}
