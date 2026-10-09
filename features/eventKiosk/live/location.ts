import type { ListingLocation, ServiceListing } from './types.ts';

export type GeocodeResult = { latitude: number; longitude: number; normalizedAddress?: string };
export type ListingLocationProvider = {
  readonly id: string;
  geocode(address: string): Promise<GeocodeResult | null>;
};

type CachedLocation = { value: GeocodeResult | null; expiresAt: number };

export interface ListingLocationCache {
  get(key: string): CachedLocation | null;
  set(key: string, value: GeocodeResult | null, ttlMs: number): void;
}

export class MemoryListingLocationCache implements ListingLocationCache {
  readonly #records = new Map<string, CachedLocation>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) { this.#now = now; }

  get(key: string) {
    const record = this.#records.get(key);
    if (!record) return null;
    if (record.expiresAt <= this.#now()) { this.#records.delete(key); return null; }
    return record;
  }

  set(key: string, value: GeocodeResult | null, ttlMs: number) {
    this.#records.set(key, { value, expiresAt: this.#now() + ttlMs });
  }
}

export function normalizeListingAddress(value: string): string | null {
  const normalized = value
    .normalize('NFKC')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[·|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized || !/(제주|서귀포)/.test(normalized)) return null;
  return normalized.startsWith('제주특별자치도')
    ? normalized
    : normalized.startsWith('제주시') || normalized.startsWith('서귀포시')
      ? `제주특별자치도 ${normalized}`
      : normalized;
}

export function isSpecificListingAddress(address: string | null): boolean {
  if (!address) return false;
  if (/[·|]/.test(address) || /지역|전역/.test(address)) return false;
  return /(?:로|길|동|리)\s*\d|\d{1,4}(?:-\d{1,4})?(?:번지)?/.test(address);
}

function coordinate(value: unknown, kind: 'latitude' | 'longitude'): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  const valid = kind === 'latitude' ? parsed >= 33 && parsed <= 34 : parsed >= 126 && parsed <= 127;
  return valid ? parsed : null;
}

export function locationFromOfficialRecord(raw: Readonly<Record<string, unknown>>, address: string): ListingLocation {
  const normalizedAddress = normalizeListingAddress(address);
  const latitude = coordinate(raw.latitude ?? raw.LATITUDE ?? raw.lat ?? raw.LAT, 'latitude');
  const longitude = coordinate(raw.longitude ?? raw.LONGITUDE ?? raw.lng ?? raw.LNG, 'longitude');
  return {
    normalizedAddress,
    latitude,
    longitude,
    status: latitude !== null && longitude !== null ? 'RESOLVED' : 'MISSING',
    source: latitude !== null && longitude !== null ? 'OFFICIAL_SOURCE' : 'UNAVAILABLE',
  };
}

export async function enrichListingLocations(
  listings: readonly ServiceListing[],
  provider: ListingLocationProvider | null,
  cache: ListingLocationCache = new MemoryListingLocationCache(),
  ttlMs = 30 * 24 * 60 * 60 * 1000,
): Promise<ServiceListing[]> {
  if (!provider) return listings.map(listing => ({ ...listing }));
  return Promise.all(listings.map(async listing => {
    if (listing.location.status === 'RESOLVED') return { ...listing };
    const address = listing.location.normalizedAddress ?? normalizeListingAddress(listing.address);
    if (!address || !isSpecificListingAddress(listing.address) || !isSpecificListingAddress(address)) return { ...listing };
    const key = `${provider.id}:${address}`;
    const cached = cache.get(key);
    if (cached) return withGeocode(listing, cached.value, provider.id, address, false);
    try {
      const result = await provider.geocode(address);
      cache.set(key, result, ttlMs);
      return withGeocode(listing, result, provider.id, address, false);
    } catch {
      return withGeocode(listing, null, provider.id, address, true);
    }
  }));
}

function withGeocode(listing: ServiceListing, result: GeocodeResult | null, providerId: string, address: string, failed: boolean): ServiceListing {
  const valid = result
    && coordinate(result.latitude, 'latitude') !== null
    && coordinate(result.longitude, 'longitude') !== null;
  return {
    ...listing,
    location: valid ? {
      normalizedAddress: normalizeListingAddress(result.normalizedAddress ?? address),
      latitude: result.latitude,
      longitude: result.longitude,
      status: 'RESOLVED',
      source: providerId === 'KAKAO_LOCAL' ? 'KAKAO_LOCAL' : 'OFFICIAL_SOURCE',
    } : {
      ...listing.location,
      normalizedAddress: address,
      status: failed ? 'FAILED' : 'MISSING',
      source: 'UNAVAILABLE',
    },
  };
}
