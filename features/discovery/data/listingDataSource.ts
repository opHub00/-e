import { ListingRepository } from './ListingRepository.ts';
import type { ListingProvider } from './ListingProvider.ts';
import { mockListingProvider } from './MockListingProvider.ts';
import { ApplyHomeListingProvider } from './ApplyHomeListingProvider.ts';

/**
 * OpenAPI 연결 시 이 primary provider만 교체한다.
 * mock provider는 장애 fallback으로 계속 사용할 수 있다.
 */
export const activeListingProvider: ListingProvider = new ApplyHomeListingProvider({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
});

export const listingRepository = new ListingRepository({
  primaryProvider: activeListingProvider,
  fallbackProvider: mockListingProvider,
});
