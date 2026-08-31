import {
  cleanAddressForGeocoding,
  createAddressKey,
  enrichApplyHomeRecordsWithGeocodes,
  KakaoAddressGeocoder,
  type GeocodeCache,
  type GeocodeCacheEntry,
  type Geocoder,
} from './KakaoGeocoding.ts';
import { normalizeListingRecord } from '../data/normalizeListing.ts';
import { hasListingCoordinates } from '../domain.ts';

let checks = 0;
function check(condition: unknown, message: string) {
  checks += 1;
  if (!condition) throw new Error(message);
}

const kakaoDocument = {
  address_name: '서울 강남구 역삼동 1',
  x: '127.031',
  y: '37.501',
  address: { address_name: '서울 강남구 역삼동 1', region_1depth_name: '서울' },
  road_address: { address_name: '서울 강남구 테헤란로 1', region_1depth_name: '서울' },
};

function kakaoResponse(documents: unknown[], totalCount = documents.length, status = 200) {
  return new Response(JSON.stringify({ meta: { total_count: totalCount }, documents }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const exactCalls: URL[] = [];
let exactAuthorization = '';
const exact = new KakaoAddressGeocoder({
  apiKey: 'server-key',
  fetcher: async (input, init) => {
    exactCalls.push(new URL(String(input)));
    exactAuthorization = new Headers(init?.headers).get('Authorization') ?? '';
    return kakaoResponse([kakaoDocument]);
  },
});
const exactResult = await exact.geocode({ address: '서울 강남구 테헤란로 1', region: '서울' });
check(exactResult.status === 'resolved', '정확한 주소를 resolve해야 한다');
check(exactResult.lng === 127.031 && exactResult.lat === 37.501, 'Kakao x를 lng, y를 lat로 매핑해야 한다');
check(exactResult.method === 'address' && exactCalls.length === 1, '정확한 주소는 한 번만 호출해야 한다');
check(exactCalls[0].searchParams.get('query') === '서울 강남구 테헤란로 1', '원본 주소를 먼저 검색해야 한다');
check(exactAuthorization === 'KakaoAK server-key', 'REST API key는 KakaoAK 서버 헤더로만 전달해야 한다');

const cleanupCalls: string[] = [];
const cleanup = new KakaoAddressGeocoder({
  apiKey: 'server-key',
  fetcher: async (input) => {
    const query = new URL(String(input)).searchParams.get('query') ?? '';
    cleanupCalls.push(query);
    return cleanupCalls.length === 1 ? kakaoResponse([]) : kakaoResponse([kakaoDocument]);
  },
});
const dirtyAddress = '서울 강남구 테헤란로 1 일원 (A-1BL)';
const cleanupResult = await cleanup.geocode({ address: dirtyAddress, region: '서울' });
check(cleanAddressForGeocoding(dirtyAddress) === '서울 강남구 테헤란로 1', '괄호·블록·일원만 보수적으로 제거해야 한다');
check(cleanupResult.status === 'resolved' && cleanupResult.method === 'cleaned-address', '원본 실패 시 정리 주소로 재시도해야 한다');
check(cleanupCalls.length === 2 && cleanupCalls[1] === '서울 강남구 테헤란로 1', '정리 주소 재시도는 한 번이어야 한다');

const malformed = new KakaoAddressGeocoder({
  apiKey: 'server-key',
  fetcher: async () => new Response('{}', { status: 200 }),
});
check((await malformed.geocode({ address: '서울 강남구 1' })).status === 'provider_error', '잘못된 Kakao payload를 거부해야 한다');

const zero = new KakaoAddressGeocoder({
  apiKey: 'server-key',
  fetcher: async () => kakaoResponse([]),
});
check((await zero.geocode({ address: '서울 강남구 없는주소 1' })).status === 'not_found', '검색 결과 0건을 not_found로 처리해야 한다');

for (const status of [401, 429, 503]) {
  let calls = 0;
  const failed = new KakaoAddressGeocoder({
    apiKey: 'server-key',
    fetcher: async () => {
      calls += 1;
      return new Response('{}', { status });
    },
  });
  const result = await failed.geocode({ address: '서울 강남구 테헤란로 1' });
  check(result.status === 'provider_error' && result.providerStatus === status, `${status}를 provider_error로 처리해야 한다`);
  check(calls === 1, `${status}에서 공격적으로 retry하지 않아야 한다`);
}

const timeout = new KakaoAddressGeocoder({
  apiKey: 'server-key',
  timeoutMs: 5,
  fetcher: async (_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }),
});
const timeoutResult = await timeout.geocode({ address: '서울 강남구 테헤란로 1' });
check(timeoutResult.status === 'provider_error' && timeoutResult.providerStatus === 504, 'timeout을 provider_error로 격리해야 한다');

const invalidCoordinate = new KakaoAddressGeocoder({
  apiKey: 'server-key',
  fetcher: async () => kakaoResponse([{ ...kakaoDocument, x: '999', y: '37.5' }]),
});
check((await invalidCoordinate.geocode({ address: '서울 강남구 1' })).status === 'provider_error', '범위 밖 좌표를 거부해야 한다');

const wrongRegion = new KakaoAddressGeocoder({
  apiKey: 'server-key',
  fetcher: async () => kakaoResponse([{
    ...kakaoDocument,
    address_name: '부산 해운대구 우동 1',
    address: { address_name: '부산 해운대구 우동 1', region_1depth_name: '부산' },
    road_address: null,
  }]),
});
check((await wrongRegion.geocode({ address: '서울 강남구 1', region: '서울' })).status === 'ambiguous', '원래 지역과 현저히 다른 결과를 ambiguous로 처리해야 한다');

const nationwideRegion = new KakaoAddressGeocoder({
  apiKey: 'test-key',
  fetcher: async () => kakaoResponse([{
      x: '129.1604',
      y: '35.1587',
      address_type: 'ROAD_ADDR',
      address: { address_name: '부산 해운대구 우동 1', region_1depth_name: '부산' },
      road_address: { address_name: '부산 해운대구 해운대로 1', region_1depth_name: '부산' },
  }]),
});
check((await nationwideRegion.geocode({ address: '부산 해운대구 해운대로 1', region: '부산광역시' })).status === 'resolved', '비수도권 시도도 동일한 지역 검증으로 지오코딩해야 한다');

const regionOnly = new KakaoAddressGeocoder({
  apiKey: 'server-key',
  fetcher: async () => kakaoResponse([{ ...kakaoDocument, address_type: 'REGION' }]),
});
check((await regionOnly.geocode({ address: '서울 강남구 역삼동', region: '서울' })).status === 'ambiguous', '행정구역 중심 좌표를 실제 단지 좌표로 확정하면 안 된다');

class TestCache implements GeocodeCache {
  readonly entries = new Map<string, GeocodeCacheEntry>();
  getCalls = 0;
  upsertCalls = 0;

  async getMany(keys: readonly string[]) {
    this.getCalls += 1;
    return new Map(keys.flatMap((key) => {
      const entry = this.entries.get(key);
      return entry ? [[key, entry] as const] : [];
    }));
  }

  async upsertMany(entries: readonly GeocodeCacheEntry[]) {
    this.upsertCalls += 1;
    entries.forEach((entry) => this.entries.set(entry.addressKey, entry));
  }
}

const baseRecord = {
  __applyHomeOperation: 'getAPTLttotPblancDetail',
  HOUSE_MANAGE_NO: '1',
  PBLANC_NO: '2',
  HOUSE_NM: '실제 단지',
  HSSPLY_ADRES: '서울 강남구 테헤란로 1',
  SUBSCRPT_AREA_CODE_NM: '서울',
  RCRIT_PBLANC_DE: '2026-08-20',
  RCEPT_BGNDE: '2026-08-28',
  RCEPT_ENDDE: '2026-08-29',
};
const now = new Date('2026-08-25T00:00:00.000Z');
const cache = new TestCache();
const key = await createAddressKey(baseRecord.HSSPLY_ADRES);
cache.entries.set(key, {
  addressKey: key,
  originalAddress: baseRecord.HSSPLY_ADRES,
  normalizedAddress: baseRecord.HSSPLY_ADRES,
  lat: 37.501,
  lng: 127.031,
  status: 'resolved',
  matchedAddress: baseRecord.HSSPLY_ADRES,
  method: 'address',
  provider: 'kakao',
  updatedAt: now.toISOString(),
});
let geocoderCalls = 0;
const countingGeocoder: Geocoder = {
  async geocode() {
    geocoderCalls += 1;
    return { lat: 37.5, lng: 127.03, status: 'resolved', requestCount: 1 };
  },
};
const hit = await enrichApplyHomeRecordsWithGeocodes([baseRecord], {
  geocoder: countingGeocoder,
  cache,
  now,
});
check(geocoderCalls === 0 && hit.diagnostics.cacheHits === 1, 'cache hit이면 Kakao를 호출하지 않아야 한다');
check(hit.records[0].latitude === 37.501 && hit.records[0].longitude === 127.031, 'cache 좌표를 적용해야 한다');

const missCache = new TestCache();
const duplicate = { ...baseRecord, HOUSE_MANAGE_NO: '3' };
const miss = await enrichApplyHomeRecordsWithGeocodes([baseRecord, duplicate], {
  geocoder: countingGeocoder,
  cache: missCache,
  now,
});
check(geocoderCalls === 1, '같은 주소의 여러 listing은 Kakao를 한 번만 호출해야 한다');
check(miss.diagnostics.cacheMisses === 1 && missCache.entries.size === 1, 'cache miss 결과를 한 번 저장해야 한다');
check(miss.records.every((record) => record.latitude === 37.5 && record.longitude === 127.03), '같은 주소의 모든 listing에 좌표를 적용해야 한다');

const negativeCache = new TestCache();
negativeCache.entries.set(key, {
  addressKey: key,
  originalAddress: baseRecord.HSSPLY_ADRES,
  normalizedAddress: baseRecord.HSSPLY_ADRES,
  lat: null,
  lng: null,
  status: 'not_found',
  provider: 'kakao',
  updatedAt: now.toISOString(),
});
const beforeNegative = geocoderCalls;
const negative = await enrichApplyHomeRecordsWithGeocodes([baseRecord], {
  geocoder: countingGeocoder,
  cache: negativeCache,
  now,
});
check(geocoderCalls === beforeNegative && negative.diagnostics.notFound === 1, 'not_found도 TTL 동안 negative cache해야 한다');

let mixedCalls = 0;
const mixedGeocoder: Geocoder = {
  async geocode(input) {
    mixedCalls += 1;
    return input.address.includes('실패')
      ? { lat: null, lng: null, status: 'provider_error', requestCount: 1 }
      : { lat: 37.55, lng: 126.99, status: 'resolved', requestCount: 1 };
  },
};
const failedRecord = { ...baseRecord, HOUSE_MANAGE_NO: '4', HSSPLY_ADRES: '서울 중구 실패 주소' };
const goodRecord = { ...baseRecord, HOUSE_MANAGE_NO: '5', HSSPLY_ADRES: '서울 중구 세종대로 110' };
const isolated = await enrichApplyHomeRecordsWithGeocodes([failedRecord, goodRecord], {
  geocoder: mixedGeocoder,
  cache: new TestCache(),
  now,
});
check(mixedCalls === 2 && isolated.records.length === 2, '한 geocode 실패가 ListingDataset 전체를 실패시키면 안 된다');
check(isolated.records[0].latitude === null && isolated.records[1].latitude === 37.55, '실패 listing만 좌표 없이 유지해야 한다');
check(isolated.diagnostics.providerError === 1 && isolated.diagnostics.resolved === 1, '실패 유형을 진단에 분리해야 한다');

const normalizedResolved = normalizeListingRecord(isolated.records[1], {
  source: { id: 'applyhome-apt-v1', kind: 'applyhome', label: '청약홈' },
  fetchedAt: now.toISOString(),
  referenceDate: now,
});
const normalizedFailed = normalizeListingRecord(isolated.records[0], {
  source: { id: 'applyhome-apt-v1', kind: 'applyhome', label: '청약홈' },
  fetchedAt: now.toISOString(),
  referenceDate: now,
});
check(normalizedResolved.listing?.coordinateSource === 'kakao', '실데이터 좌표 provenance를 보존해야 한다');
check(Boolean(normalizedResolved.listing && hasListingCoordinates(normalizedResolved.listing)), 'resolve된 live listing은 map eligible이어야 한다');
check(Boolean(normalizedFailed.listing && !hasListingCoordinates(normalizedFailed.listing)), '미해결 listing도 list/detail 모델에 남아야 한다');
check(isolated.records.every((record) => !String(record.id ?? '').startsWith('demo-')), 'live dataset에 mock listing을 혼합하지 않아야 한다');

console.log(`features/discovery/kakao-geocoding: ${checks}개 검증 통과`);
