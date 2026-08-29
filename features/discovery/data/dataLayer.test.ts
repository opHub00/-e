import type { UserProfile } from '../../../domain/types.ts';
import {
  DEFAULT_DISCOVERY_FILTERS,
  filterListings,
  getListingRelevance,
  sortListings,
} from '../domain.ts';
import type { ListingProvider } from './ListingProvider.ts';
import { ListingRepository } from './ListingRepository.ts';
import { MockListingProvider, mockListingProvider } from './MockListingProvider.ts';
import { parseOpenApiListingPayload } from './OpenApiListingAdapter.ts';
import {
  calculateRecruitmentStatus,
  normalizeListingBatch,
  normalizeListingRecord,
  validateListing,
} from './normalizeListing.ts';

let checks = 0;
const check = (condition: unknown, message: string) => {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
};

const referenceDate = new Date('2026-08-24T00:00:00.000Z');
const openApiSource = {
  id: 'cheongyak-home-fixture',
  kind: 'openapi',
  label: '청약홈 OpenAPI fixture',
} as const;

const openApiFixture = {
  HOUSE_MANAGE_NO: '20260001',
  PBLANC_NO: '2026000101',
  HOUSE_NM: '테스트 센트럴',
  SUBSCRPT_AREA_CODE_NM: '서울',
  HSSPLY_ADRES: '서울특별시 송파구 문정동 1-1',
  SUBSCRPT_RCEPT_BGNDE: '20260901',
  SUBSCRPT_RCEPT_ENDDE: '2026.09.05',
  HOUSE_SECD_NM: 'APT',
  HOUSE_DTL_SECD_NM: '민영',
  LTTOT_TOP_AMOUNT: '684,000,000원',
  TOT_SUPLY_HSHLDCO: '1,234',
};

// OpenAPI envelope adapter
const nestedPayload = parseOpenApiListingPayload({
  response: { body: { items: { item: [openApiFixture] } } },
}, '2026-08-24T09:00:00+09:00');
check(nestedPayload.records.length === 1, '공공데이터포털 중첩 envelope를 파싱해야 한다');
check(Boolean(nestedPayload.fetchedAt), 'adapter가 fetchedAt을 보존해야 한다');
check(parseOpenApiListingPayload({ data: [openApiFixture] }).records.length === 1, 'data 배열 envelope를 파싱해야 한다');
check(parseOpenApiListingPayload({ items: [openApiFixture] }).records.length === 1, 'items 배열 envelope를 파싱해야 한다');
check(parseOpenApiListingPayload({ response: {} }).records.length === 0, '형식이 다른 envelope는 빈 배열로 안전하게 처리해야 한다');

// API row -> internal Listing normalization
const normalizedApi = normalizeListingRecord(openApiFixture, {
  source: openApiSource,
  fetchedAt: referenceDate.toISOString(),
  referenceDate,
});
check(Boolean(normalizedApi.listing), '유효한 OpenAPI fixture는 Listing으로 변환되어야 한다');
if (!normalizedApi.listing) throw new Error('FAIL: OpenAPI fixture normalization');
check(normalizedApi.listing.id === '20260001-2026000101', '공고 관리번호 조합으로 안정적인 id를 만들어야 한다');
check(normalizedApi.listing.complexName === '테스트 센트럴', 'API 공고명을 내부 이름으로 매핑해야 한다');
check(normalizedApi.listing.region === '서울' && normalizedApi.listing.district === '송파구', '주소에서 수도권 지역과 구를 보완해야 한다');
check(normalizedApi.listing.recruitmentStatus === 'upcoming', '접수일과 기준일로 모집예정을 계산해야 한다');
check(normalizedApi.listing.housingType === '아파트', 'APT 값을 내부 주택 유형으로 매핑해야 한다');
check(normalizedApi.listing.supplyType === '민간분양', '민영 값을 내부 공급 유형으로 매핑해야 한다');
check(normalizedApi.listing.representativePrice === 684000000, '쉼표·단위가 있는 가격을 숫자로 변환해야 한다');
check(normalizedApi.listing.householdCount === 1234, '문자열 세대수를 숫자로 변환해야 한다');
check(normalizedApi.listing.isDemo === false, 'OpenAPI source는 데모 데이터로 표시하지 않아야 한다');
check(normalizedApi.listing.latitude === null && normalizedApi.listing.longitude === null, '좌표 누락 시 임의 중심 좌표를 만들지 않아야 한다');

// Missing/malformed values never reach the UI in a crashable shape
const malformed = normalizeListingRecord({
  HOUSE_MANAGE_NO: 'broken-1',
  SUBSCRPT_AREA_CODE_NM: '인천광역시',
  HOUSE_NM: null,
  HSSPLY_ADRES: '',
  SUBSCRPT_RCEPT_BGNDE: 'not-a-date',
  SUBSCRPT_RCEPT_ENDDE: '2026-02-31',
  LATITUDE: 'north',
  LONGITUDE: 999,
  TOT_SUPLY_HSHLDCO: '-3',
  LTTOT_TOP_AMOUNT: '미정',
  interestTags: ['무주택 관심', '자격 충족', null],
}, {
  source: openApiSource,
  fetchedAt: referenceDate.toISOString(),
  referenceDate,
});
check(Boolean(malformed.listing), '선택 필드가 깨져도 안전한 Listing을 반환해야 한다');
if (!malformed.listing) throw new Error('FAIL: malformed fixture normalization');
check(malformed.listing.complexName === '공고명 확인 필요', '공고명 누락은 안전한 문구로 대체해야 한다');
check(malformed.listing.address.includes('상세 주소 확인 필요'), '주소 누락은 안전한 문구로 대체해야 한다');
check(malformed.listing.representativePrice === null && malformed.listing.householdCount === null, '잘못된 숫자는 미확인 상태로 유지해야 한다');
check(malformed.listing.checkpoints.length === 3, '조건 누락 시 일반 확인 항목을 제공해야 한다');
check(malformed.listing.interestTags.length === 1 && malformed.listing.interestTags[0] === '무주택 관심', '허용된 관심 태그만 남겨야 한다');
check(malformed.issues.length >= 5, '보정된 필드는 validation issue로 기록해야 한다');
check(validateListing(malformed.listing).length === 0, '정규화 결과는 내부 Listing validation을 통과해야 한다');

const unsupported = normalizeListingRecord({
  HOUSE_NM: '부산 테스트',
  HSSPLY_ADRES: '부산광역시 해운대구',
}, {
  source: openApiSource,
  fetchedAt: referenceDate.toISOString(),
  referenceDate,
});
check(unsupported.listing === null, '현재 수도권 slice 밖의 공고는 UI에 전달하지 않아야 한다');
check(unsupported.issues.some((issue) => issue.code === 'unsupported-region'), '제외 이유를 validation issue로 남겨야 한다');

const mixedBatch = normalizeListingBatch([openApiFixture, openApiFixture, null, unsupported], {
  source: openApiSource,
  fetchedAt: referenceDate.toISOString(),
  referenceDate,
});
check(mixedBatch.listings.length === 1, '중복·무효 행은 제외하고 유효 행만 반환해야 한다');
check(mixedBatch.issues.some((issue) => issue.code === 'duplicate-id'), '중복 id를 기록해야 한다');
check(mixedBatch.issues.some((issue) => issue.code === 'invalid-record'), '객체가 아닌 행을 기록해야 한다');

// Recruitment state calculation has explicit date boundaries
check(calculateRecruitmentStatus({ recruitmentStartDate: '2026-08-25', recruitmentEndDate: '2026-08-30', referenceDate }) === 'upcoming', '시작일 전에는 모집예정이어야 한다');
check(calculateRecruitmentStatus({ recruitmentStartDate: '2026-08-24', recruitmentEndDate: '2026-08-24', referenceDate }) === 'open', '시작·종료 당일은 모집중이어야 한다');
check(calculateRecruitmentStatus({ recruitmentStartDate: '2026-08-01', recruitmentEndDate: '2026-08-23', referenceDate }) === 'closed', '종료일 후에는 모집종료여야 한다');
check(calculateRecruitmentStatus({ recruitmentStartDate: null, recruitmentEndDate: null, referenceDate, rawStatus: '접수예정' }) === 'upcoming', '일정 누락 시 알려진 원본 상태를 사용할 수 있어야 한다');
check(calculateRecruitmentStatus({ recruitmentStartDate: null, recruitmentEndDate: null, referenceDate, rawStatus: '알 수 없음' }) === 'unknown', '일정·상태가 모두 불명확하면 일정확인필요로 처리해야 한다');

// Mock provider remains the current 12-row source and also goes through normalization
const mockPayload = mockListingProvider.getFixturePayload();
const normalizedMock = normalizeListingBatch(mockPayload.records, {
  source: mockListingProvider.source,
  fetchedAt: mockPayload.fetchedAt!,
  referenceDate: new Date(mockPayload.statusAsOf!),
});
check(normalizedMock.listings.length === 12, 'MockListingProvider가 기존 12개를 제공해야 한다');
check(normalizedMock.listings.every((listing) => listing.isDemo), 'Mock provider 결과는 모두 데모여야 한다');
check(normalizedMock.issues.every((issue) => issue.severity !== 'error'), 'Mock fixture에 치명 validation 오류가 없어야 한다');

// Filtering/sorting/relevance consume only the internal model, regardless of provider
const profile: UserProfile = {
  name: '지민',
  age: 22,
  occupation: 'student',
  region: '서울특별시',
  hasSubscriptionAccount: true,
  accountMonths: 14,
  monthlyPayment: 100000,
  isNoHomeOwner: true,
};
const apiFiltered = filterListings([normalizedApi.listing], profile, {
  ...DEFAULT_DISCOVERY_FILTERS,
  personalizedOnly: false,
  status: 'upcoming',
});
check(apiFiltered.length === 1, '필터는 OpenAPI에서 정규화된 Listing에도 그대로 동작해야 한다');
check(sortListings([malformed.listing, normalizedApi.listing], profile, true).length === 2, '정렬은 provider 출처와 무관해야 한다');
check(getListingRelevance(profile, normalizedApi.listing).label === '확인해볼 만함', '기존 relevance 의미를 변경하지 않고 API Listing에 적용해야 한다');

// Repository: source metadata, memory cache, force refresh
let fetchCount = 0;
const countingProvider: ListingProvider = {
  source: openApiSource,
  async fetchListings() {
    fetchCount += 1;
    return { records: [openApiFixture], fetchedAt: '2026-08-24T03:00:00.000Z' };
  },
};
let nowMs = referenceDate.getTime();
const repository = new ListingRepository({
  primaryProvider: countingProvider,
  cacheTtlMs: 1_000,
  now: () => new Date(nowMs),
});
const first = await repository.loadListings();
const second = await repository.loadListings();
check(fetchCount === 1, 'TTL 안에서는 provider를 다시 호출하지 않아야 한다');
check(first.cacheStatus === 'miss' && second.cacheStatus === 'hit', 'cache hit 여부를 dataset에 표시해야 한다');
check(first.source.id === openApiSource.id && first.fetchedAt === '2026-08-24T03:00:00.000Z', 'source와 fetchedAt을 보존해야 한다');
check(first.statusCalculatedAt === referenceDate.toISOString(), '모집 상태 계산 기준 시각을 기록해야 한다');
nowMs += 1_001;
await repository.loadListings();
check(fetchCount === 2, 'TTL 만료 후 provider를 다시 호출해야 한다');
await repository.loadListings({ forceRefresh: true });
check(fetchCount === 3, 'forceRefresh는 메모리 캐시를 우회해야 한다');

// Primary outage/invalid response -> Mock fallback
const failingProvider: ListingProvider = {
  source: { id: 'broken-openapi', kind: 'openapi', label: '장애 fixture' },
  async fetchListings() {
    throw new Error('503 upstream unavailable');
  },
};
const fallbackRepository = new ListingRepository({
  primaryProvider: failingProvider,
  fallbackProvider: new MockListingProvider(),
  now: () => referenceDate,
});
const fallback = await fallbackRepository.loadListings();
check(fallback.isFallback, 'primary 장애 시 fallback 사용 여부를 표시해야 한다');
check(fallback.source.kind === 'mock' && fallback.listings.length === 12, 'API 장애 시 Mock provider 결과를 반환해야 한다');
check(fallback.fallbackReason?.includes('503') === true, 'fallback 원인을 안전한 문자열로 기록해야 한다');

const invalidProvider: ListingProvider = {
  source: { id: 'invalid-openapi', kind: 'openapi', label: '무효 fixture' },
  async fetchListings() {
    return { records: [{ HOUSE_NM: '지역 없는 행' }] };
  },
};
const invalidFallback = await new ListingRepository({
  primaryProvider: invalidProvider,
  fallbackProvider: mockListingProvider,
  now: () => referenceDate,
}).loadListings();
check(invalidFallback.isFallback && invalidFallback.listings.length === 12, '사용 가능한 행이 없을 때도 Mock으로 fallback해야 한다');

console.log(`features/discovery/data: ${checks}개 검증 통과`);
