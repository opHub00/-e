import type { IntroStorage } from './introStorage.ts';
import type { ProfileStorage } from './profileStorage.ts';
import { createMinimalApplicantProfile } from '../features/profile/domain.ts';
import { createUserStore, shouldRedirectToIntro } from './useUserStore.ts';

let checks = 0;
const check = (condition: unknown, message: string) => {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
};

let persisted: boolean | null = null;
let reads = 0;
const storage: IntroStorage = {
  read: async () => {
    reads += 1;
    return persisted === true;
  },
  write: async (value) => {
    persisted = value;
  },
};

let persistedProfile: unknown | null = null;
let profileReads = 0;
const applicantStorage: ProfileStorage = {
  read: async () => {
    profileReads += 1;
    return persistedProfile;
  },
  write: async (profile) => {
    persistedProfile = profile;
  },
  clear: async () => {
    persistedProfile = null;
  },
};

const firstRun = createUserStore(storage, applicantStorage);
check(!firstRun.getState().introHydrated, '첫 실행은 intro 저장값을 읽기 전이어야 한다');
check(!shouldRedirectToIntro(firstRun.getState()), 'hydration 전에는 intro redirect를 렌더하면 안 된다');
check(!firstRun.getState().profileHydrated, 'profile 저장값도 hydration 전이어야 한다');
await firstRun.getState().hydrateIntro();
await firstRun.getState().hydrateProfile();
check(firstRun.getState().introHydrated, '첫 실행 hydration이 완료되어야 한다');
check(firstRun.getState().profileHydrated, 'profile hydration이 완료되어야 한다');
check(shouldRedirectToIntro(firstRun.getState()), '저장값이 없는 최초 실행은 intro로 이동해야 한다');

await firstRun.getState().completeIntro();
check(persisted === true, 'intro 완료와 건너뛰기는 seen flag를 저장해야 한다');
check(!shouldRedirectToIntro(firstRun.getState()), 'intro 완료 직후 다시 intro로 이동하면 안 된다');

const minimal = createMinimalApplicantProfile({
  name: '민지',
  age: 27,
  currentRegion: '서울특별시',
  preferredRegions: ['서울특별시', '경기도'],
});
firstRun.getState().setApplicantProfile(minimal);
check(Boolean(persistedProfile), 'V2 profile 변경은 로컬 저장되어야 한다');
check(firstRun.getState().profile.name === '민지', 'V2 변경은 legacy adapter에 즉시 반영되어야 한다');

// bundle 입력 → 저장 → 새로고침(store recreate) 후에도 남아야 한다.
firstRun.getState().setApplicantProfile({
  ...minimal,
  family: {
    marriageStatus: { status: 'known', value: 'married' },
    marriageYears: { status: 'known', value: 3 },
    childrenCount: { status: 'known', value: 1 },
    childBirthYears: { status: 'known', value: [2022] },
  },
  assets: { ...minimal.assets, vehicle: { status: 'not_applicable' } },
});
check(
  firstRun.getState().applicantProfile.family.childBirthYears.status === 'known',
  'bundle 입력이 store에 반영되어야 한다',
);

const firstPrompt = firstRun.getState().requestProfileBundle('future');
check(firstPrompt === 'SUBSCRIPTION_ACCOUNT', 'feature 진입은 가장 먼저 필요한 bundle 하나만 반환해야 한다');
check(firstRun.getState().requestProfileBundle('future') === null, '같은 세션에서 연속 prompt를 막아야 한다');
if (firstPrompt) firstRun.getState().dismissProfileBundle(firstPrompt);
check(firstRun.getState().requestProfileBundle('future') === null, 'dismiss 후 바로 재표시하면 안 된다');

const recreated = createUserStore(storage, applicantStorage);
check(!recreated.getState().introHydrated, 'store recreate도 저장값 hydration을 기다려야 한다');
const firstHydration = recreated.getState().hydrateIntro();
const duplicateHydration = recreated.getState().hydrateIntro();
check(firstHydration === duplicateHydration, '동시 hydration은 같은 작업을 재사용해야 한다');
await firstHydration;
check(reads === 2, 'store마다 storage를 한 번만 읽어야 한다');
check(recreated.getState().hasSeenIntro, 'refresh/store recreate 후 intro 완료 상태를 복원해야 한다');
const firstProfileHydration = recreated.getState().hydrateProfile();
const duplicateProfileHydration = recreated.getState().hydrateProfile();
check(firstProfileHydration === duplicateProfileHydration, '동시 profile hydration은 같은 작업을 재사용해야 한다');
await firstProfileHydration;
check(profileReads === 2, 'store마다 profile storage를 한 번만 읽어야 한다');
check(recreated.getState().applicantProfile.basic.name === '민지', 'store recreate 후 V2 profile 복원');
const restoredFamily = recreated.getState().applicantProfile.family;
check(
  restoredFamily.childBirthYears.status === 'known' &&
    JSON.stringify(restoredFamily.childBirthYears.value) === JSON.stringify([2022]),
  'refresh 후에도 bundle 입력값이 유지되어야 한다',
);
check(
  recreated.getState().applicantProfile.assets.vehicle.status === 'not_applicable',
  'refresh 후에도 실제 없음(not_applicable)이 unknown으로 바뀌면 안 된다',
);
check(
  recreated.getState().applicantProfile.subscriptionAccount.hasAccount.status === 'unknown',
  'refresh 후에도 미입력은 unknown으로 남아야 한다',
);
check(recreated.getState().promptFatigue.automaticPromptUsed === false, 'fatigue guard는 세션마다 초기화');

await recreated.getState().resetDemo();
check(persisted === false, '데모 초기화는 저장된 intro flag도 초기화해야 한다');
check(persistedProfile === null, '데모 초기화는 저장된 profile도 초기화해야 한다');
check(recreated.getState().introHydrated, '데모 초기화 뒤에는 재hydration 없이 상태가 확정되어야 한다');
check(recreated.getState().profileHydrated, '데모 초기화 뒤 profile 상태도 확정되어야 한다');
check(shouldRedirectToIntro(recreated.getState()), '데모 초기화 뒤 intro가 다시 표시되어야 한다');

const afterReset = createUserStore(storage, applicantStorage);
await afterReset.getState().hydrateIntro();
check(shouldRedirectToIntro(afterReset.getState()), '초기화 뒤 store recreate에서도 intro가 다시 표시되어야 한다');

console.log(`store/useUserStore: ${checks}개 검증 통과`);
