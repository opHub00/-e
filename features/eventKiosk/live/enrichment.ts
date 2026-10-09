import { kakaoLocalProviderFromEnv, type KakaoLocalProvider } from './kakaoLocalProvider.ts';
import { enrichListingLocations, MemoryListingLocationCache } from './location.ts';
import { enrichNearbyPois, MemoryNearbyPoiCache } from './nearby.ts';
import type { ServiceListingPortfolio } from './types.ts';

const locationCache = new MemoryListingLocationCache();
const nearbyCache = new MemoryNearbyPoiCache();

export async function enrichServiceListingPortfolio(
  portfolio: ServiceListingPortfolio,
  provider: KakaoLocalProvider | null = kakaoLocalProviderFromEnv(),
): Promise<ServiceListingPortfolio> {
  const located = await enrichListingLocations(portfolio.listings, provider, locationCache);
  const enriched = await enrichNearbyPois(located, provider, nearbyCache);
  return { ...portfolio, listings: enriched };
}
