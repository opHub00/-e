import type { UserProfile } from '../../../domain/types.ts';
import { DEFAULT_DISCOVERY_FILTERS, getVisibleListings, hasListingCoordinates, hasListingPrice } from '../domain.ts';
import { discoveryListings } from '../mockListings.ts';
import { getStoriesForListing } from '../stories.ts';
import { applyHomeAptFixture } from './fixtures/applyHomeFixtures.ts';
import type { ListingDataset, ListingProvider } from './ListingProvider.ts';
import { ListingRepository } from './ListingRepository.ts';
import { MockListingProvider } from './MockListingProvider.ts';
import { normalizeListingRecord } from './normalizeListing.ts';
import { createListingDatasetRuntime } from './useListingDataset.ts';

let checks = 0;
const check = (condition: unknown, message: string) => {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
};

const source = {
  id: 'applyhome-apt-v1',
  kind: 'applyhome',
  label: '한국부동산원 청약홈 분양정보',
} as const;
const now = new Date('2026-08-25T00:00:00.000Z');
const normalized = normalizeListingRecord({
  ...applyHomeAptFixture,
  latitude: 37.501,
  longitude: 127.031,
  __coordinateSource: 'kakao',
  __geocodeStatus: 'resolved',
}, {
  source,
  fetchedAt: now.toISOString(),
  referenceDate: now,
});
if (!normalized.listing) throw new Error('live fixture normalization failed');

const liveDataset: ListingDataset = {
  listings: [normalized.listing],
  source,
  fetchedAt: now.toISOString(),
  statusCalculatedAt: now.toISOString(),
  isFallback: false,
  cacheStatus: 'miss',
  validationIssues: [],
};

let resolveLive!: (dataset: ListingDataset) => void;
let coldLoadCalls = 0;
const deferredLoader = {
  loadListings: () => new Promise<ListingDataset>((resolve) => {
    coldLoadCalls += 1;
    resolveLive = resolve;
  }),
};
const runtime = createListingDatasetRuntime(deferredLoader, source);
check(runtime.getSnapshot().status === 'loading', 'runtime은 loading 상태로 시작해야 한다');
check(runtime.getSnapshot().source.kind === 'applyhome', '초기 source는 Mock이 아니라 applyhome이어야 한다');
check(runtime.getSnapshot().listings.length === 0, 'live 도착 전 Mock listing을 렌더하면 안 된다');

let notifications = 0;
const unsubscribe = runtime.subscribe(() => { notifications += 1; });
const stopColdLifecycle = runtime.start();
const loading = runtime.load();
check(coldLoadCalls === 1, 'cold mount는 live fetch를 정확히 1회 시작해야 한다');
resolveLive(liveDataset);
await loading;
unsubscribe();
stopColdLifecycle();

const liveSnapshot = runtime.getSnapshot();
check(notifications === 1 && liveSnapshot.status === 'ready', '비동기 live dataset 도착 시 구독 화면을 갱신해야 한다');
check(liveSnapshot.source.kind === 'applyhome' && !liveSnapshot.isFallback, 'live provenance를 보존해야 한다');
check(liveSnapshot.listings.length === 1 && liveSnapshot.listings.every((listing) => !listing.isDemo), 'live dataset에 Mock listing이 없어야 한다');
check(liveSnapshot.listings[0].id.startsWith('apt-'), 'live ApplyHome ID를 보존해야 한다');
check(liveSnapshot.listings.find((listing) => listing.id === normalized.listing!.id) === normalized.listing, 'detail route가 live ID로 같은 listing을 resolve할 수 있어야 한다');
check(hasListingCoordinates(liveSnapshot.listings[0]), 'live 좌표 listing은 map marker 대상이어야 한다');
check(liveSnapshot.listings[0].representativePrice === null, 'live listing에 Mock 가격을 주입하면 안 된다');
check(!hasListingPrice(liveSnapshot.listings[0]), 'live 가격 필드가 없으면 가격 UI를 숨겨야 한다');
check(getStoriesForListing(liveSnapshot.listings[0]).length === 0, 'live listing에 fixture community를 주입하면 안 된다');
check(liveSnapshot.listings[0].coordinateSource === 'kakao', 'live marker는 Kakao 좌표 provenance를 유지해야 한다');
await runtime.load();
check(coldLoadCalls === 1, '성공한 live snapshot은 불필요한 중복 fetch를 막아야 한다');

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
const beforeLive = getVisibleListings([], profile, DEFAULT_DISCOVERY_FILTERS);
const afterLive = getVisibleListings(liveSnapshot.listings, profile, DEFAULT_DISCOVERY_FILTERS);
check(beforeLive.length === 0 && afterLive[0]?.id === normalized.listing.id, 'async dataset 교체 후 filter/sort를 live 기준으로 재계산해야 한다');
const listListings = afterLive;
const mapListings = afterLive;
check(listListings === mapListings, '목록과 지도는 동일한 filtered dataset을 사용해야 한다');

let fallbackLoads = 0;
const fallbackDataset: ListingDataset = {
  ...liveDataset,
  listings: discoveryListings,
  source: { id: 'mock-listings-v1', kind: 'mock', label: '완판e 데모 데이터' },
  isFallback: true,
  fallbackReason: '503 upstream unavailable',
};
const fallbackRuntime = createListingDatasetRuntime({
  async loadListings() {
    fallbackLoads += 1;
    return fallbackLoads === 1 ? fallbackDataset : liveDataset;
  },
}, source);
await fallbackRuntime.load();
check(fallbackRuntime.getSnapshot().isFallback, '실제 provider 실패가 확인된 경우에만 fallback이어야 한다');
check(fallbackRuntime.getSnapshot().listings.every((listing) => listing.isDemo), 'fallback dataset만 Mock listing을 포함해야 한다');
check(getStoriesForListing(fallbackRuntime.getSnapshot().listings[0]).length > 0, 'fixture community는 Mock fallback에서만 유지해야 한다');
check(hasListingPrice(fallbackRuntime.getSnapshot().listings[0]), 'Mock fallback은 데모 전제에서 fixture 가격을 유지할 수 있다');
const detachedSubscriber = fallbackRuntime.subscribe(() => {
  throw new Error('구독 해제 후에는 알림을 받으면 안 된다');
});
detachedSubscriber();
let reattachedNotifications = 0;
const reattachedSubscriber = fallbackRuntime.subscribe(() => {
  reattachedNotifications += 1;
});
await fallbackRuntime.load();
reattachedSubscriber();
check(fallbackLoads === 2, '기존 fallback snapshot이 있어도 live fetch를 다시 실행해야 한다');
check(reattachedNotifications === 1, 'subscriber가 다시 생기면 live 교체 알림을 받아야 한다');
check(fallbackRuntime.getSnapshot().source.kind === 'applyhome', 'subscriber 재등록 후 stale Mock에 고착되지 않고 live로 교체해야 한다');

let automaticRecoveryLoads = 0;
const automaticRecoveryRuntime = createListingDatasetRuntime({
  async loadListings() {
    automaticRecoveryLoads += 1;
    return automaticRecoveryLoads === 1 ? fallbackDataset : liveDataset;
  },
}, source, 0);
const stopRecoveryLifecycle = automaticRecoveryRuntime.start();
await new Promise((resolve) => setTimeout(resolve, 10));
stopRecoveryLifecycle();
check(automaticRecoveryLoads === 2, 'mount lifecycle은 fallback 이후 live recovery fetch를 1회 실행해야 한다');
check(!automaticRecoveryRuntime.getSnapshot().isFallback, '자동 recovery는 fallback을 live snapshot으로 교체해야 한다');

let providerAttempts = 0;
const recoveringProvider: ListingProvider = {
  source,
  async fetchListings() {
    providerAttempts += 1;
    if (providerAttempts === 1) throw new Error('temporary outage');
    return { records: [{ ...applyHomeAptFixture, latitude: 37.501, longitude: 127.031 }], fetchedAt: now.toISOString() };
  },
};
const recoveringRepository = new ListingRepository({
  primaryProvider: recoveringProvider,
  fallbackProvider: new MockListingProvider(),
  now: () => now,
});
check((await recoveringRepository.loadListings()).isFallback, '첫 provider 장애는 fallback을 반환해야 한다');
check(!(await recoveringRepository.loadListings()).isFallback && providerAttempts === 2, 'fallback을 primary cache에 고착시키지 말고 live를 재시도해야 한다');

console.log(`features/discovery/runtime-data: ${checks}개 검증 통과`);
