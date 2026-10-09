import type { ListingHighlight, NearbyPoi, NearbyPoiCategory, ServiceListing } from './types.ts';

export type PoiSearchResult = Omit<NearbyPoi, 'straightDistanceMeters'>;
export type NearbyPoiProvider = {
  readonly id: string;
  search(input: { latitude: number; longitude: number; categories: readonly NearbyPoiCategory[]; radiusMeters: number }): Promise<PoiSearchResult[]>;
};

type CachedPois = { value: PoiSearchResult[]; expiresAt: number };
export interface NearbyPoiCache {
  get(key: string): CachedPois | null;
  set(key: string, value: PoiSearchResult[], ttlMs: number): void;
}

export class MemoryNearbyPoiCache implements NearbyPoiCache {
  readonly #records = new Map<string, CachedPois>();
  readonly #now: () => number;
  constructor(now: () => number = Date.now) { this.#now = now; }
  get(key: string) {
    const record = this.#records.get(key);
    if (!record) return null;
    if (record.expiresAt <= this.#now()) { this.#records.delete(key); return null; }
    return record;
  }
  set(key: string, value: PoiSearchResult[], ttlMs: number) {
    this.#records.set(key, { value, expiresAt: this.#now() + ttlMs });
  }
}

export const DEFAULT_POI_CATEGORIES = ['TRANSIT', 'EDUCATION', 'HOSPITAL', 'SHOPPING', 'PARK', 'GOVERNMENT', 'LANDMARK'] as const;

export function straightDistanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)));
}

export async function enrichNearbyPois(
  listings: readonly ServiceListing[],
  provider: NearbyPoiProvider | null,
  cache: NearbyPoiCache = new MemoryNearbyPoiCache(),
  options: { radiusMeters?: number; ttlMs?: number; limit?: number } = {},
): Promise<ServiceListing[]> {
  if (!provider) return listings.map(listing => withHighlights(listing, listing.nearbyPois));
  const radiusMeters = options.radiusMeters ?? 2_000;
  const ttlMs = options.ttlMs ?? 7 * 24 * 60 * 60 * 1000;
  const limit = options.limit ?? 8;
  return Promise.all(listings.map(async listing => {
    const { latitude, longitude } = listing.location;
    if (latitude === null || longitude === null) return withHighlights(listing, []);
    const key = `${provider.id}:${latitude.toFixed(5)}:${longitude.toFixed(5)}:${radiusMeters}`;
    try {
      const cached = cache.get(key);
      const raw = cached?.value ?? await provider.search({ latitude, longitude, categories: DEFAULT_POI_CATEGORIES, radiusMeters });
      if (!cached) cache.set(key, raw, ttlMs);
      const pois = raw
        .map(item => ({ ...item, straightDistanceMeters: straightDistanceMeters({ latitude, longitude }, item) }))
        .filter(item => item.straightDistanceMeters <= radiusMeters)
        .sort((a, b) => a.straightDistanceMeters - b.straightDistanceMeters || a.name.localeCompare(b.name, 'ko'))
        .slice(0, limit);
      return withHighlights(listing, pois);
    } catch {
      return withHighlights(listing, [], true);
    }
  }));
}

const highlightCategory: Partial<Record<NearbyPoiCategory, ListingHighlight['category']>> = {
  TRANSIT: 'TRANSPORT', EDUCATION: 'EDUCATION', HOSPITAL: 'MEDICAL', SHOPPING: 'CONVENIENCE', PARK: 'GREEN', LANDMARK: 'AREA', GOVERNMENT: 'AREA',
};
const categoryLabel: Record<NearbyPoiCategory, string> = {
  TRANSIT: '대중교통', EDUCATION: '교육시설', HOSPITAL: '의료시설', SHOPPING: '생활편의시설', PARK: '공원', GOVERNMENT: '관공서', LANDMARK: '주요 거점',
};

export function generateListingHighlights(listing: ServiceListing, pois: readonly NearbyPoi[]): { sellingPoints: ListingHighlight[]; cautions: ListingHighlight[] } {
  const nearest = new Map<NearbyPoiCategory, NearbyPoi>();
  for (const poi of pois) if (!nearest.has(poi.category)) nearest.set(poi.category, poi);
  const sellingPoints = [...nearest.values()].slice(0, 5).map(poi => ({
    category: highlightCategory[poi.category] ?? 'AREA',
    text: `${categoryLabel[poi.category]} ${poi.name}이(가) 약 ${formatDistance(poi.straightDistanceMeters)} 거리에 있어요.`,
    evidence: { kind: 'POI' as const, source: poi.source, sourceUrl: poi.sourceUrl, poiId: poi.id, distanceMeters: poi.straightDistanceMeters },
  }));
  const cautions: ListingHighlight[] = [];
  if (listing.location.status !== 'RESOLVED') cautions.push({
    category: 'CAUTION',
    text: '정확한 위치와 주변시설은 공식 공고의 주택 목록에서 확인해 주세요.',
    evidence: { kind: 'OFFICIAL_LISTING', source: listing.provider, sourceUrl: listing.sourceUrl, poiId: null, distanceMeters: null },
  });
  return { sellingPoints, cautions };
}

function formatDistance(meters: number): string {
  return meters >= 1_000 ? `${(meters / 1_000).toFixed(1)}km` : `${Math.max(10, Math.round(meters / 10) * 10)}m`;
}

function withHighlights(listing: ServiceListing, pois: NearbyPoi[], failed = false): ServiceListing {
  const generated = generateListingHighlights(listing, pois);
  const failureCaution: ListingHighlight[] = failed ? [{
    category: 'CAUTION',
    text: '주변시설 정보를 불러오지 못해 공식 지도에서 추가 확인이 필요해요.',
    evidence: { kind: 'OFFICIAL_LISTING', source: listing.provider, sourceUrl: listing.sourceUrl, poiId: null, distanceMeters: null },
  }] : [];
  return { ...listing, nearbyPois: pois, sellingPoints: generated.sellingPoints, locationCautions: [...generated.cautions, ...failureCaution] };
}
