import type { SavedListingStorage } from './savedListingStorage.ts';
import { normalizeSavedListingIds } from './savedListingStorage.ts';
import { getHomeRecommendations, resolveSavedListings } from './homeListings.ts';
import { discoveryListings } from './mockListings.ts';
import { DISCOVERY_REGIONS, PROFILE_REGIONS, normalizeDiscoveryRegions } from './regions.ts';
import { createDiscoveryStore } from './useDiscoveryStore.ts';

let checks = 0;
const check = (condition: unknown, message: string) => {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
};

const liveListings = discoveryListings.slice(0, 5).map((listing, index) => ({
  ...listing,
  id: `live-${index}`,
  sourceType: 'applyhome-apt' as const,
  isDemo: false,
}));
const profile = {
  name: '민지',
  age: 29,
  occupation: 'worker' as const,
  region: '부산광역시',
  preferredRegions: ['부산광역시', '서울특별시'],
  hasSubscriptionAccount: true,
  accountMonths: 24,
  monthlyPayment: 100_000,
  isNoHomeOwner: true,
};

const recommendations = getHomeRecommendations(liveListings, profile, [], 3);
check(recommendations.length >= 2 && recommendations.length <= 4, 'Home 추천은 2~4개여야 한다');
check(recommendations.every((listing) => !listing.isDemo), 'live 입력 성공 시 Home에 mock이 섞이면 안 된다');
check(
  recommendations.every((listing) => liveListings.some((candidate) => candidate.id === listing.id)),
  'Home 추천 id는 같은 dataset의 Detail에서 찾아야 한다',
);

const saved = resolveSavedListings(liveListings, ['live-2', 'stale-id', 'live-0']);
check(saved.map((listing) => listing.id).join(',') === 'live-2,live-0', 'stale id는 crash 없이 제외하고 저장 순서를 유지해야 한다');
check(resolveSavedListings([], ['stale-id']).length === 0, 'loading 중 빈 dataset에서도 저장 id 조회가 안전해야 한다');

check(DISCOVERY_REGIONS.length === 17, 'Discovery는 17개 시도를 제공해야 한다');
check(PROFILE_REGIONS.length === 17, 'Onboarding과 Profile도 같은 17개 시도를 제공해야 한다');
check(new Set(PROFILE_REGIONS).size === 17, 'profile region source에 중복이 없어야 한다');
check(
  normalizeDiscoveryRegions(['서울특별시', '경기도', '인천광역시']).join(',') === '서울,인천,경기',
  '기존 수도권 profile 문자열은 migration 없이 계속 유효해야 한다',
);
check(
  normalizeDiscoveryRegions(['부산광역시', '서울특별시']).join(',') === '서울,부산',
  '복수 관심지역은 Discovery 기본값 순서로 정규화되어야 한다',
);
check(normalizeSavedListingIds([' one ', 'one', '', 2]).join(',') === 'one', '저장 id payload를 최소 문자열 목록으로 정규화해야 한다');

let persisted: unknown | null = null;
const storage: SavedListingStorage = {
  read: async () => persisted,
  write: async (ids) => {
    persisted = [...ids];
  },
  clear: async () => {
    persisted = null;
  },
};

const first = createDiscoveryStore(storage);
await first.getState().hydrateSavedListings();
first.getState().toggleSavedListing('live-2');
check(first.getState().savedListingIds.join(',') === 'live-2', '공고 저장이 store에 반영되어야 한다');
check(JSON.stringify(persisted) === JSON.stringify(['live-2']), '공고 id만 storage에 저장해야 한다');

const recreated = createDiscoveryStore(storage);
const hydration = recreated.getState().hydrateSavedListings();
check(hydration === recreated.getState().hydrateSavedListings(), '동시 hydration은 같은 작업을 재사용해야 한다');
await hydration;
check(recreated.getState().savedListingIds.join(',') === 'live-2', 'store recreate/refresh 후 저장 id를 복원해야 한다');
recreated.getState().toggleSavedListing('live-2');
check(recreated.getState().savedListingIds.length === 0, 'unsave는 저장 id를 제거해야 한다');

persisted = ['live-0', 'missing-id', null, 'live-0'];
const staleStore = createDiscoveryStore(storage);
await staleStore.getState().hydrateSavedListings();
check(staleStore.getState().savedListingIds.join(',') === 'live-0,missing-id', '유효한 stale id는 안전하게 보존해야 한다');
check(resolveSavedListings(liveListings, staleStore.getState().savedListingIds).length === 1, '사라진 공고 id가 있어도 현재 dataset 조회는 안전해야 한다');
await staleStore.getState().clearSavedListings();
check(persisted === null && staleStore.getState().savedListingIds.length === 0, 'Demo Reset용 clear는 메모리와 storage를 함께 비워야 한다');

console.log(`features/discovery/hardening: ${checks}개 검증 통과`);
