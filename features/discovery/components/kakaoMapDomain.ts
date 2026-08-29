import type { DiscoveryListing } from '../types.ts';
import { hasListingCoordinates } from '../domain.ts';

export type MapBoundsLiteral = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export function isListingInMapBounds(
  listing: DiscoveryListing,
  bounds: MapBoundsLiteral,
): boolean {
  return (
    listing.latitude !== null &&
    listing.longitude !== null &&
    listing.latitude >= bounds.south &&
    listing.latitude <= bounds.north &&
    listing.longitude >= bounds.west &&
    listing.longitude <= bounds.east
  );
}

export function countListingsInMapBounds(
  listings: readonly DiscoveryListing[],
  bounds: MapBoundsLiteral,
): number {
  return listings.filter((listing) => isListingInMapBounds(listing, bounds)).length;
}

export function hasUsableMapLayout(width: number, height: number): boolean {
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
}

export function getKakaoMapFocusAction(input: {
  focused: boolean;
  hasMapInstance: boolean;
  width: number;
  height: number;
}): 'none' | 'initialize' | 'relayout' {
  if (!input.focused || !hasUsableMapLayout(input.width, input.height)) return 'none';
  return input.hasMapInstance ? 'relayout' : 'initialize';
}

export function getMapMarkerSetKey(listings: readonly DiscoveryListing[]): string {
  return JSON.stringify(
    listings.filter(hasListingCoordinates).map((listing) => [
      listing.id,
      listing.complexName,
      listing.latitude,
      listing.longitude,
    ]),
  );
}
