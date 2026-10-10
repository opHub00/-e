import type { ListingLocationProvider, GeocodeResult } from './location.ts';
import type { NearbyPoiProvider, PoiSearchResult } from './nearby.ts';
import type { NearbyPoiCategory } from './types.ts';

type KakaoDocument = Record<string, unknown>;

const keywordByCategory: Record<NearbyPoiCategory, string> = {
  TRANSIT: '버스정류장',
  EDUCATION: '학교',
  HOSPITAL: '병원',
  SHOPPING: '마트',
  PARK: '공원',
  GOVERNMENT: '주민센터',
  LANDMARK: '제주 교통 거점',
};

export class KakaoLocalProvider implements ListingLocationProvider, NearbyPoiProvider {
  readonly id = 'KAKAO_LOCAL';
  readonly #restApiKey: string;
  readonly #fetcher: typeof fetch;

  constructor(restApiKey: string, fetcher: typeof fetch = fetch) {
    if (!restApiKey.trim()) throw new Error('KAKAO_REST_API_KEY_REQUIRED');
    this.#restApiKey = restApiKey.trim();
    this.#fetcher = fetcher;
  }

  async geocode(address: string): Promise<GeocodeResult | null> {
    const url = new URL('https://dapi.kakao.com/v2/local/search/address.json');
    url.searchParams.set('query', address);
    url.searchParams.set('size', '1');
    const documents = await this.#documents(url);
    const first = documents[0];
    if (!first) return null;
    const latitude = Number(first.y);
    const longitude = Number(first.x);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return {
      latitude,
      longitude,
      normalizedAddress: text((first.road_address as KakaoDocument | null)?.address_name) || text(first.address_name) || address,
      precision: first.road_address ? 'ROAD_ADDRESS' : 'PARCEL_ADDRESS',
    };
  }

  async search(input: { latitude: number; longitude: number; categories: readonly NearbyPoiCategory[]; radiusMeters: number }): Promise<PoiSearchResult[]> {
    const groups = await Promise.all(input.categories.map(async category => {
      const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
      url.searchParams.set('query', keywordByCategory[category]);
      url.searchParams.set('x', String(input.longitude));
      url.searchParams.set('y', String(input.latitude));
      url.searchParams.set('radius', String(Math.min(20_000, input.radiusMeters)));
      url.searchParams.set('sort', 'distance');
      url.searchParams.set('size', '3');
      const documents = await this.#documents(url);
      return documents.flatMap(document => {
        const id = text(document.id);
        const name = text(document.place_name);
        const latitude = Number(document.y);
        const longitude = Number(document.x);
        if (!id || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
        return [{
          id: `kakao:${id}`,
          name,
          category,
          latitude,
          longitude,
          routeDistanceMeters: null,
          source: '카카오 로컬',
          sourceUrl: safeHttps(document.place_url),
        } satisfies PoiSearchResult];
      });
    }));
    return groups.flat();
  }

  async #documents(url: URL): Promise<KakaoDocument[]> {
    const response = await this.#fetcher(url, { headers: { Authorization: `KakaoAK ${this.#restApiKey}`, Accept: 'application/json' } });
    if (!response.ok) throw new Error(`KAKAO_LOCAL_FAILED:${response.status}`);
    const payload = await response.json() as { documents?: unknown };
    return Array.isArray(payload.documents)
      ? payload.documents.filter((item): item is KakaoDocument => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
      : [];
  }
}

export function kakaoLocalProviderFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
  fetcher: typeof fetch = fetch,
): KakaoLocalProvider | null {
  const key = env.KAKAO_REST_API_KEY;
  return key?.trim() && key !== '[SENSITIVE]' ? new KakaoLocalProvider(key, fetcher) : null;
}

const text = (value: unknown) => value === null || value === undefined ? '' : String(value).trim();
function safeHttps(value: unknown): string | null {
  try {
    const url = new URL(text(value));
    return url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}
