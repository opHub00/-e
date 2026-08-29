import type { IntroStorage } from './introStorage.ts';
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

const firstRun = createUserStore(storage);
check(!firstRun.getState().introHydrated, '첫 실행은 intro 저장값을 읽기 전이어야 한다');
check(!shouldRedirectToIntro(firstRun.getState()), 'hydration 전에는 intro redirect를 렌더하면 안 된다');
await firstRun.getState().hydrateIntro();
check(firstRun.getState().introHydrated, '첫 실행 hydration이 완료되어야 한다');
check(shouldRedirectToIntro(firstRun.getState()), '저장값이 없는 최초 실행은 intro로 이동해야 한다');

await firstRun.getState().completeIntro();
check(persisted === true, 'intro 완료와 건너뛰기는 seen flag를 저장해야 한다');
check(!shouldRedirectToIntro(firstRun.getState()), 'intro 완료 직후 다시 intro로 이동하면 안 된다');

const recreated = createUserStore(storage);
check(!recreated.getState().introHydrated, 'store recreate도 저장값 hydration을 기다려야 한다');
const firstHydration = recreated.getState().hydrateIntro();
const duplicateHydration = recreated.getState().hydrateIntro();
check(firstHydration === duplicateHydration, '동시 hydration은 같은 작업을 재사용해야 한다');
await firstHydration;
check(reads === 2, 'store마다 storage를 한 번만 읽어야 한다');
check(recreated.getState().hasSeenIntro, 'refresh/store recreate 후 intro 완료 상태를 복원해야 한다');

await recreated.getState().resetDemo();
check(persisted === false, '데모 초기화는 저장된 intro flag도 초기화해야 한다');
check(recreated.getState().introHydrated, '데모 초기화 뒤에는 재hydration 없이 상태가 확정되어야 한다');
check(shouldRedirectToIntro(recreated.getState()), '데모 초기화 뒤 intro가 다시 표시되어야 한다');

const afterReset = createUserStore(storage);
await afterReset.getState().hydrateIntro();
check(shouldRedirectToIntro(afterReset.getState()), '초기화 뒤 store recreate에서도 intro가 다시 표시되어야 한다');

console.log(`store/useUserStore: ${checks}개 검증 통과`);
