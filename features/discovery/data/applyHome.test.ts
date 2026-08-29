import type { UserProfile } from '../../../domain/types.ts';
import { formatHouseholdCount, formatRecruitmentSchedule, getListingRelevance, hasListingCoordinates } from '../domain.ts';
import {
  ApplyHomeProviderError,
  buildApplyHomeRequestUrl,
  fetchApplyHomeListings,
} from '../server/ApplyHomeApi.ts';
import { ApplyHomeListingProvider } from './ApplyHomeListingProvider.ts';
import { applyHomeAptFixture, applyHomeRemnantFixture } from './fixtures/applyHomeFixtures.ts';
import { ListingRepository } from './ListingRepository.ts';
import { MockListingProvider } from './MockListingProvider.ts';
import { normalizeListingBatch, normalizeListingRecord } from './normalizeListing.ts';

let checks = 0;
const check = (condition: unknown, message: string) => {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
};

const source = {
  id: 'applyhome-fixture',
  kind: 'applyhome',
  label: '청약홈 fixture',
} as const;
const referenceDate = new Date('2026-08-25T15:30:00.000Z'); // 한국 8/26 00:30

const apt = normalizeListingRecord(applyHomeAptFixture, {
  source,
  fetchedAt: referenceDate.toISOString(),
  referenceDate,
});
const remnant = normalizeListingRecord(applyHomeRemnantFixture, {
  source,
  fetchedAt: referenceDate.toISOString(),
  referenceDate,
});
check(Boolean(apt.listing && remnant.listing), 'APT와 잔여세대 fixture를 정규화해야 한다');
if (!apt.listing || !remnant.listing) throw new Error('FAIL: fixture normalization');
check(apt.listing.sourceType === 'applyhome-apt', 'APT 출처 타입을 보존해야 한다');
check(remnant.listing.sourceType === 'applyhome-remnant', '잔여세대 출처 타입을 보존해야 한다');
check(apt.listing.id.startsWith('apt-'), 'APT id에 출처 prefix가 있어야 한다');
check(remnant.listing.id.startsWith('remndr-'), '잔여세대 id에 출처 prefix가 있어야 한다');
check(apt.listing.id !== remnant.listing.id, '동일 관리번호여도 APT와 잔여세대 id가 충돌하지 않아야 한다');
check(apt.listing.announcementDate === '2026-08-20', 'APT 공고일을 매핑해야 한다');
check(apt.listing.recruitmentStartDate === '2026-09-01', 'APT RCEPT_BGNDE를 접수 시작일로 매핑해야 한다');
check(remnant.listing.recruitmentStartDate === '2026-08-28', '잔여세대 SUBSCRPT_RCEPT_BGNDE를 매핑해야 한다');
check(apt.listing.announcementUrl?.startsWith('https://www.applyhome.co.kr/') === true, '공식 공고 URL을 보존해야 한다');
check(apt.listing.latitude === null && apt.listing.longitude === null, '좌표가 없으면 null을 유지해야 한다');
check(apt.listing.representativePrice === null, '상세 API에 없는 가격을 만들어내지 않아야 한다');
check(apt.listing.recruitmentStatus === 'upcoming', '한국 날짜 기준으로 예정 상태를 계산해야 한다');

const malformed = normalizeListingRecord({
  ...applyHomeAptFixture,
  RCEPT_BGNDE: '2026-02-30',
  RCEPT_ENDDE: '',
  PBLANC_URL: 'javascript:alert(1)',
  HMPG_ADRES: 'not-a-url',
}, { source, fetchedAt: referenceDate.toISOString(), referenceDate });
check(malformed.listing?.recruitmentStartDate === null, '잘못된 날짜를 임의 보정하지 않아야 한다');
check(malformed.listing?.recruitmentStatus === 'unknown', '일정이 불완전하면 일정확인필요 상태여야 한다');
check(malformed.listing?.announcementUrl === null, '잘못된 URL을 제거해야 한다');
check(malformed.listing?.homepageUrl === null, '잘못된 홈페이지 URL을 제거해야 한다');
check(malformed.issues.some((issue) => issue.field === 'announcementUrl'), '잘못된 URL을 validation issue로 남겨야 한다');

const rawKey = 'abc+def/ghi=';
const encodedKey = encodeURIComponent(rawKey);
const rawUrl = buildApplyHomeRequestUrl({
  operation: 'getAPTLttotPblancDetail', serviceKey: rawKey,
  fromDate: '2026-06-01', toDate: '2026-08-25', page: 1, perPage: 100,
});
const encodedUrl = buildApplyHomeRequestUrl({
  operation: 'getAPTLttotPblancDetail', serviceKey: encodedKey,
  fromDate: '2026-06-01', toDate: '2026-08-25', page: 1, perPage: 100,
});
check(rawUrl.searchParams.get('serviceKey') === rawKey, '원본 키를 한 번만 URL encoding해야 한다');
check(encodedUrl.searchParams.get('serviceKey') === rawKey, '이미 encoding된 키도 한 번만 encoding해야 한다');
check(!encodedUrl.toString().includes('%252B'), '서비스키 double encoding이 없어야 한다');

const pagedFetcher: typeof fetch = async (input) => {
  const url = new URL(String(input));
  const page = Number(url.searchParams.get('page'));
  const operation = url.pathname.endsWith('getAPTLttotPblancDetail')
    ? 'getAPTLttotPblancDetail'
    : 'getRemndrLttotPblancDetail';
  const base = operation === 'getAPTLttotPblancDetail' ? applyHomeAptFixture : applyHomeRemnantFixture;
  const data = page === 1 ? [{ ...base }, { ...base, PBLANC_NO: `${base.PBLANC_NO}-2` }] : [{ ...base, PBLANC_NO: `${base.PBLANC_NO}-3` }];
  return new Response(JSON.stringify({ data, matchCount: 3, currentCount: data.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
const paged = await fetchApplyHomeListings({
  serviceKey: rawKey,
  fromDate: '2026-06-01',
  toDate: '2026-08-25',
  perPage: 2,
  maxPages: 3,
  fetcher: pagedFetcher,
});
check(paged.records.length === 6, '두 operation의 페이지네이션 결과를 합쳐야 한다');
check(paged.operations.every((item) => item.pagesFetched === 2), 'matchCount까지 필요한 페이지만 호출해야 한다');

for (const status of [400, 503]) {
  try {
    await fetchApplyHomeListings({
      serviceKey: rawKey,
      fromDate: '2026-06-01',
      toDate: '2026-08-25',
      fetcher: async () => new Response(JSON.stringify({ code: `E${status}`, message: 'upstream failed' }), { status }),
    });
    check(false, `${status} upstream 오류를 throw해야 한다`);
  } catch (error) {
    check(error instanceof ApplyHomeProviderError, `${status} 오류를 안전한 provider error로 변환해야 한다`);
    check((error as ApplyHomeProviderError).diagnostic.httpStatus === status, '실제 HTTP status를 진단에 보존해야 한다');
  }
}

try {
  await fetchApplyHomeListings({ serviceKey: '', fromDate: '2026-06-01', toDate: '2026-08-25' });
  check(false, '서비스키가 없으면 호출하지 않아야 한다');
} catch (error) {
  check(error instanceof ApplyHomeProviderError, '서비스키 누락을 provider error로 처리해야 한다');
  check((error as ApplyHomeProviderError).diagnostic.providerCode === 'missing-service-key', '서비스키 누락 코드를 남겨야 한다');
}

const edgePayload = {
  records: [applyHomeAptFixture, applyHomeRemnantFixture],
  source: { kind: 'applyhome' },
  fetchedAt: '2026-08-25T00:00:00.000Z',
  statusAsOf: '2026-08-25T00:00:00.000Z',
  isFallback: false,
};
const originalGlobalFetch = globalThis.fetch;
let defaultFetchThis: unknown;
globalThis.fetch = function (this: unknown) {
  defaultFetchThis = this;
  return Promise.resolve(new Response(JSON.stringify(edgePayload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
} as typeof fetch;
try {
  await new ApplyHomeListingProvider({
    supabaseUrl: 'https://project.supabase.co',
    anonKey: 'public-anon-key',
  }).fetchListings();
} finally {
  globalThis.fetch = originalGlobalFetch;
}
check(defaultFetchThis === globalThis, '브라우저 기본 fetch는 Window/globalThis에 bind되어야 한다');

let browserRequestUrl = '';
let browserRequestMethod = '';
let browserRequestHeaders = new Headers();
const provider = new ApplyHomeListingProvider({
  supabaseUrl: 'https:///project.supabase.co',
  anonKey: 'public-anon-key',
  fetcher: async (input, init) => {
    browserRequestUrl = String(input);
    browserRequestMethod = init?.method ?? 'GET';
    browserRequestHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify(edgePayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
});
const liveDataset = await new ListingRepository({
  primaryProvider: provider,
  fallbackProvider: new MockListingProvider(),
  now: () => new Date('2026-08-25T00:00:00.000Z'),
}).loadListings();
check(liveDataset.source.kind === 'applyhome' && liveDataset.isFallback === false, '실제 dataset provenance를 표시해야 한다');
check(liveDataset.listings.length === 2, '실제 provider 결과를 기존 ListingDataset으로 변환해야 한다');
check(browserRequestUrl === 'https://project.supabase.co/functions/v1/listings', 'Expo URL을 표준 Edge endpoint로 정규화해야 한다');
check(browserRequestMethod === 'POST', '브라우저와 Edge Function의 method가 POST로 일치해야 한다');
check(browserRequestHeaders.get('authorization') === 'Bearer public-anon-key', 'Authorization header를 포함해야 한다');
check(browserRequestHeaders.get('apikey') === 'public-anon-key', 'apikey header를 포함해야 한다');

const fallbackDataset = await new ListingRepository({
  primaryProvider: new ApplyHomeListingProvider({
    supabaseUrl: 'https://project.supabase.co',
    anonKey: 'public-anon-key',
    fetcher: async () => new Response(JSON.stringify({ error: 'upstream failed' }), { status: 502 }),
  }),
  fallbackProvider: new MockListingProvider(),
  now: () => new Date('2026-08-25T00:00:00.000Z'),
}).loadListings();
check(fallbackDataset.source.kind === 'mock' && fallbackDataset.isFallback, 'provider 장애 시 Mock 전체 dataset으로 fallback해야 한다');
check(fallbackDataset.fallbackReason?.includes('listings HTTP 502') === true, '개발 진단에 실제 Edge HTTP status를 보존해야 한다');

const profile: UserProfile = {
  name: '지민', age: 22, occupation: 'student', region: '서울특별시',
  hasSubscriptionAccount: true, accountMonths: 14, monthlyPayment: 100000,
  isNoHomeOwner: true,
};
check(getListingRelevance(profile, apt.listing).label === '확인해볼 만함', '실제 provider에서도 기존 relevance 의미가 유지되어야 한다');
check(!('eligible' in apt.listing) && !('winningProbability' in apt.listing), 'Listing에 자격·당첨 가능성 필드가 생기면 안 된다');

const batch = normalizeListingBatch([applyHomeAptFixture, applyHomeRemnantFixture], {
  source,
  fetchedAt: referenceDate.toISOString(),
  referenceDate,
});
check(batch.listings.every((listing) => listing.latitude === null && listing.longitude === null), '좌표 없는 실데이터를 임의 위치로 변환하지 않아야 한다');
check(batch.listings.every((listing) => !hasListingCoordinates(listing)), '미해결 실데이터는 map marker에서 제외해야 한다');
check(batch.listings.length === 2 && batch.listings.every((listing) => listing.id.length > 0), '좌표가 없어도 list/detail 접근 가능한 listing을 유지해야 한다');
const nullableSafeText = [
  malformed.listing?.complexName,
  malformed.listing?.address,
  malformed.listing ? formatRecruitmentSchedule(malformed.listing) : null,
  malformed.listing ? formatHouseholdCount(malformed.listing.householdCount) : null,
].filter(Boolean).join(' ');
check(!/undefined|null|NaN|Invalid Date/.test(nullableSafeText), 'nullable field가 UI 안전 문자열을 깨뜨리면 안 된다');

console.log(`features/discovery/applyhome: ${checks}개 검증 통과`);
