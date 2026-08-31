import { normalizeDiscoveryRegion } from '../regions.ts';

export const KAKAO_ADDRESS_API = 'https://dapi.kakao.com/v2/local/search/address.json';
const ADDRESS_KEY_VERSION = 'kakao-address-v2';

export type GeocodeStatus = 'resolved' | 'not_found' | 'ambiguous' | 'provider_error';
export type GeocodeMethod = 'address' | 'cleaned-address';

export type GeocodeInput = {
  address: string;
  listingName?: string;
  region?: string;
};

export type GeocodeResult = {
  lat: number | null;
  lng: number | null;
  status: GeocodeStatus;
  matchedAddress?: string;
  method?: GeocodeMethod;
  providerStatus?: number;
  requestCount?: number;
};

export interface Geocoder {
  geocode(input: GeocodeInput): Promise<GeocodeResult>;
}

export type GeocodeCacheEntry = GeocodeResult & {
  addressKey: string;
  originalAddress: string;
  normalizedAddress: string;
  provider: 'kakao';
  updatedAt: string;
};

export interface GeocodeCache {
  getMany(addressKeys: readonly string[]): Promise<Map<string, GeocodeCacheEntry>>;
  upsertMany(entries: readonly GeocodeCacheEntry[]): Promise<void>;
}

type KakaoAddressGeocoderOptions = {
  apiKey: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

export class KakaoAddressGeocoder implements Geocoder {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: KakaoAddressGeocoderOptions) {
    this.apiKey = options.apiKey.trim();
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 3_500;
  }

  async geocode(input: GeocodeInput): Promise<GeocodeResult> {
    const address = normalizeAddress(input.address);
    if (!address) return emptyResult('not_found', 0);

    const exact = await this.search(address, input.region, 'address');
    if (exact.status !== 'not_found') return exact;

    const cleaned = cleanAddressForGeocoding(address);
    if (!cleaned || cleaned === address) return exact;

    const fallback = await this.search(cleaned, input.region, 'cleaned-address');
    return { ...fallback, requestCount: (exact.requestCount ?? 0) + (fallback.requestCount ?? 0) };
  }

  private async search(
    query: string,
    expectedRegion: string | undefined,
    method: GeocodeMethod,
  ): Promise<GeocodeResult> {
    if (!this.apiKey) return { ...emptyResult('provider_error', 0), providerStatus: 503 };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = new URL(KAKAO_ADDRESS_API);
      url.searchParams.set('query', query);
      url.searchParams.set('size', '2');
      const response = await this.fetcher(url, {
        headers: { Authorization: `KakaoAK ${this.apiKey}`, Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) {
        return { ...emptyResult('provider_error', 1), method, providerStatus: response.status };
      }

      const payload = await response.json().catch(() => null);
      if (!isRecord(payload) || !Array.isArray(payload.documents) || !isRecord(payload.meta)) {
        return { ...emptyResult('provider_error', 1), method };
      }

      const totalCount = readInteger(payload.meta.total_count);
      if (totalCount === 0 || payload.documents.length === 0) {
        return { ...emptyResult('not_found', 1), method };
      }
      if (totalCount !== 1 || payload.documents.length !== 1 || !isRecord(payload.documents[0])) {
        return { ...emptyResult('ambiguous', 1), method };
      }

      const document = payload.documents[0];
      if (readText(document.address_type) === 'REGION') {
        return { ...emptyResult('ambiguous', 1), method, matchedAddress: readMatchedAddress(document) };
      }
      const lng = readCoordinate(document.x, -180, 180);
      const lat = readCoordinate(document.y, -90, 90);
      const matchedAddress = readMatchedAddress(document);
      if (lat === null || lng === null) {
        return { ...emptyResult('provider_error', 1), method, matchedAddress };
      }
      if (!matchesRegion(expectedRegion, document, matchedAddress)) {
        return { ...emptyResult('ambiguous', 1), method, matchedAddress };
      }

      return { lat, lng, status: 'resolved', matchedAddress, method, requestCount: 1 };
    } catch (error) {
      return {
        ...emptyResult('provider_error', 1),
        method,
        providerStatus: error instanceof DOMException && error.name === 'AbortError' ? 504 : 502,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

type SupabaseRestGeocodeCacheOptions = {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetcher?: typeof fetch;
};

export class SupabaseRestGeocodeCache implements GeocodeCache {
  private readonly baseUrl: string;
  private readonly serviceRoleKey: string;
  private readonly fetcher: typeof fetch;

  constructor(options: SupabaseRestGeocodeCacheOptions) {
    this.baseUrl = `${options.supabaseUrl.replace(/\/$/, '')}/rest/v1/listing_geocode_cache`;
    this.serviceRoleKey = options.serviceRoleKey;
    this.fetcher = options.fetcher ?? fetch;
  }

  async getMany(addressKeys: readonly string[]): Promise<Map<string, GeocodeCacheEntry>> {
    const result = new Map<string, GeocodeCacheEntry>();
    for (let index = 0; index < addressKeys.length; index += 50) {
      const keys = addressKeys.slice(index, index + 50);
      if (keys.length === 0) continue;
      const url = new URL(this.baseUrl);
      url.searchParams.set(
        'select',
        'address_key,original_address,normalized_address,lat,lng,matched_address,status,provider,method,updated_at',
      );
      url.searchParams.set('address_key', `in.(${keys.join(',')})`);
      const response = await this.fetcher(url, { headers: this.headers() });
      if (!response.ok) throw new Error(`geocode cache lookup failed (${response.status})`);
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error('geocode cache returned malformed rows');
      rows.forEach((row) => {
        const entry = parseCacheRow(row);
        if (entry) result.set(entry.addressKey, entry);
      });
    }
    return result;
  }

  async upsertMany(entries: readonly GeocodeCacheEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const url = new URL(this.baseUrl);
    url.searchParams.set('on_conflict', 'address_key');
    const response = await this.fetcher(url, {
      method: 'POST',
      headers: {
        ...this.headers(),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(entries.map(toCacheRow)),
    });
    if (!response.ok) throw new Error(`geocode cache upsert failed (${response.status})`);
  }

  private headers() {
    return {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
      Accept: 'application/json',
    };
  }
}

export type GeocodeEnrichmentDiagnostics = {
  totalListings: number;
  processedListings: number;
  resolved: number;
  notFound: number;
  ambiguous: number;
  providerError: number;
  cacheHits: number;
  cacheMisses: number;
  kakaoRequests: number;
  cacheErrors: number;
};

type EnrichmentOptions = {
  geocoder: Geocoder;
  cache: GeocodeCache;
  concurrency?: number;
  limit?: number;
  now?: Date;
};

type AddressGroup = {
  addressKey: string;
  originalAddress: string;
  normalizedAddress: string;
  listingName: string;
  region: string;
  indexes: number[];
};

export async function enrichApplyHomeRecordsWithGeocodes(
  records: readonly Readonly<Record<string, unknown>>[],
  options: EnrichmentOptions,
): Promise<{ records: Readonly<Record<string, unknown>>[]; diagnostics: GeocodeEnrichmentDiagnostics }> {
  const output = records.map((record) => ({ ...record }));
  const groups = new Map<string, AddressGroup>();

  for (let index = 0; index < output.length; index += 1) {
    const record = output[index];
    const address = readText(record.HSSPLY_ADRES ?? record.address);
    const region = normalizeDiscoveryRegion(record.SUBSCRPT_AREA_CODE_NM ?? address);
    if (!address || !region || hasCoordinates(record)) continue;
    const normalizedAddress = normalizeAddress(address);
    const addressKey = await createAddressKey(normalizedAddress);
    const existing = groups.get(addressKey);
    if (existing) existing.indexes.push(index);
    else {
      groups.set(addressKey, {
        addressKey,
        originalAddress: address,
        normalizedAddress,
        listingName: readText(record.HOUSE_NM ?? record.complexName),
        region,
        indexes: [index],
      });
    }
  }

  const allGroups = [...groups.values()];
  const limit = Math.max(0, Math.min(options.limit ?? allGroups.length, allGroups.length));
  const selectedGroups = allGroups.slice(0, limit);
  const diagnostics: GeocodeEnrichmentDiagnostics = {
    totalListings: allGroups.reduce((count, group) => count + group.indexes.length, 0),
    processedListings: selectedGroups.reduce((count, group) => count + group.indexes.length, 0),
    resolved: 0,
    notFound: 0,
    ambiguous: 0,
    providerError: 0,
    cacheHits: 0,
    cacheMisses: 0,
    kakaoRequests: 0,
    cacheErrors: 0,
  };
  const now = options.now ?? new Date();
  let cached = new Map<string, GeocodeCacheEntry>();
  try {
    cached = await options.cache.getMany(selectedGroups.map((group) => group.addressKey));
  } catch {
    diagnostics.cacheErrors += 1;
  }

  const misses: AddressGroup[] = [];
  for (const group of selectedGroups) {
    const entry = cached.get(group.addressKey);
    if (entry && isFreshCacheEntry(entry, now)) {
      diagnostics.cacheHits += 1;
      applyResult(output, group, entry, 'hit');
      addStatusCount(diagnostics, entry.status, group.indexes.length);
    } else {
      diagnostics.cacheMisses += 1;
      misses.push(group);
    }
  }

  const freshEntries: GeocodeCacheEntry[] = [];
  await mapWithConcurrency(misses, options.concurrency ?? 4, async (group) => {
    const result = await options.geocoder.geocode({
      address: group.originalAddress,
      listingName: group.listingName,
      region: group.region,
    });
    diagnostics.kakaoRequests += result.requestCount ?? 0;
    addStatusCount(diagnostics, result.status, group.indexes.length);
    applyResult(output, group, result, 'miss');
    if (result.status !== 'provider_error') {
      freshEntries.push({
        ...result,
        addressKey: group.addressKey,
        originalAddress: group.originalAddress,
        normalizedAddress: group.normalizedAddress,
        provider: 'kakao',
        updatedAt: now.toISOString(),
      });
    }
  });

  try {
    await options.cache.upsertMany(freshEntries);
  } catch {
    diagnostics.cacheErrors += 1;
  }

  return { records: output, diagnostics };
}

export function cleanAddressForGeocoding(value: string): string {
  return normalizeAddress(value)
    .replace(/\([^()]*\)|（[^（）]*）/g, ' ')
    .replace(/\s+(?:공동)?[A-Z]?-?\d+(?:-\d+)?\s*(?:BL|블록)(?:\s.*)?$/i, ' ')
    .replace(/\s+(?:일원|부근)\s*$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeAddress(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export async function createAddressKey(address: string): Promise<string> {
  const bytes = new TextEncoder().encode(
    `${ADDRESS_KEY_VERSION}:${normalizeAddress(address).toLowerCase()}`,
  );
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function emptyResult(status: GeocodeStatus, requestCount: number): GeocodeResult {
  return { lat: null, lng: null, status, requestCount };
}

function readMatchedAddress(document: Record<string, unknown>): string | undefined {
  const road = isRecord(document.road_address) ? readText(document.road_address.address_name) : '';
  const address = isRecord(document.address) ? readText(document.address.address_name) : '';
  return road || address || readText(document.address_name) || undefined;
}

function matchesRegion(
  expectedRegion: string | undefined,
  document: Record<string, unknown>,
  matchedAddress: string | undefined,
): boolean {
  const expected = normalizeDiscoveryRegion(expectedRegion);
  if (!expected) return true;
  const address = isRecord(document.address) ? document.address : {};
  const road = isRecord(document.road_address) ? document.road_address : {};
  const actualText = readText(
    road.region_1depth_name ?? address.region_1depth_name ?? matchedAddress,
  );
  return !actualText || normalizeDiscoveryRegion(actualText) === expected;
}

function hasCoordinates(record: Record<string, unknown>): boolean {
  return readCoordinate(record.latitude ?? record.LATITUDE, -90, 90) !== null &&
    readCoordinate(record.longitude ?? record.LONGITUDE, -180, 180) !== null;
}

function readCoordinate(value: unknown, min: number, max: number): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function readInteger(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function applyResult(
  records: Record<string, unknown>[],
  group: AddressGroup,
  result: GeocodeResult,
  cacheStatus: 'hit' | 'miss',
) {
  group.indexes.forEach((index) => {
    records[index] = {
      ...records[index],
      latitude: result.status === 'resolved' ? result.lat : null,
      longitude: result.status === 'resolved' ? result.lng : null,
      __coordinateSource: result.status === 'resolved' ? 'kakao' : null,
      __geocodeStatus: result.status,
      __geocodeMatchedAddress: result.matchedAddress ?? null,
      __geocodeMethod: result.method ?? null,
      __geocodeCache: cacheStatus,
    };
  });
}

function addStatusCount(
  diagnostics: GeocodeEnrichmentDiagnostics,
  status: GeocodeStatus,
  count: number,
) {
  if (status === 'resolved') diagnostics.resolved += count;
  else if (status === 'not_found') diagnostics.notFound += count;
  else if (status === 'ambiguous') diagnostics.ambiguous += count;
  else diagnostics.providerError += count;
}

function isFreshCacheEntry(entry: GeocodeCacheEntry, now: Date): boolean {
  const updatedAt = new Date(entry.updatedAt).getTime();
  if (!Number.isFinite(updatedAt)) return false;
  const ttlDays = entry.status === 'resolved' ? 180 : entry.status === 'not_found' ? 7 : 30;
  return now.getTime() - updatedAt < ttlDays * 24 * 60 * 60 * 1000;
}

async function mapWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  let cursor = 0;
  const next = async (): Promise<void> => {
    const index = cursor;
    cursor += 1;
    if (index >= items.length) return;
    await worker(items[index]);
    await next();
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, next));
}

function parseCacheRow(value: unknown): GeocodeCacheEntry | null {
  if (!isRecord(value)) return null;
  const status = readStatus(value.status);
  const addressKey = readText(value.address_key);
  const originalAddress = readText(value.original_address);
  const normalizedAddress = readText(value.normalized_address);
  const updatedAt = readText(value.updated_at);
  if (!status || !addressKey || !originalAddress || !normalizedAddress || !updatedAt) return null;
  const lat = value.lat === null ? null : readCoordinate(value.lat, -90, 90);
  const lng = value.lng === null ? null : readCoordinate(value.lng, -180, 180);
  if (status === 'resolved' && (lat === null || lng === null)) return null;
  return {
    addressKey,
    originalAddress,
    normalizedAddress,
    lat,
    lng,
    status,
    matchedAddress: readText(value.matched_address) || undefined,
    method: readMethod(value.method),
    provider: 'kakao',
    updatedAt,
  };
}

function toCacheRow(entry: GeocodeCacheEntry) {
  return {
    address_key: entry.addressKey,
    original_address: entry.originalAddress,
    normalized_address: entry.normalizedAddress,
    lat: entry.lat,
    lng: entry.lng,
    matched_address: entry.matchedAddress ?? null,
    status: entry.status,
    provider: entry.provider,
    method: entry.method ?? null,
    updated_at: entry.updatedAt,
  };
}

function readStatus(value: unknown): GeocodeStatus | null {
  return ['resolved', 'not_found', 'ambiguous', 'provider_error'].includes(String(value))
    ? value as GeocodeStatus
    : null;
}

function readMethod(value: unknown): GeocodeMethod | undefined {
  return value === 'address' || value === 'cleaned-address' ? value : undefined;
}

function readText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
