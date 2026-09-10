import assert from 'node:assert/strict';
import {
  BRAND_ENTRANCE_KEY,
  BRAND_ENTRANCE_MAX_MS,
  chooseBrandEntranceVariant,
  markBrandEntrancePlayed,
  shouldPlayBrandEntrance,
} from './session.ts';

let checks = 0;
const check = (fn: () => void) => {
  fn();
  checks += 1;
};

const fakeSession = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    size: () => map.size,
  };
};

// 새 세션 첫 진입에는 재생한다.
check(() => {
  const session = fakeSession();
  assert.equal(shouldPlayBrandEntrance(session), true);
});

// 한 번 재생하면 같은 세션에서는 다시 재생하지 않는다. route 이동·뒤로가기·refresh 가 모두 여기에 해당한다.
check(() => {
  const session = fakeSession();
  markBrandEntrancePlayed(session);
  assert.equal(shouldPlayBrandEntrance(session), false);
});

// 새 세션은 저장소가 비어 있으므로 다시 재생한다. PWA cold start 도 같은 경로다.
check(() => {
  const first = fakeSession();
  markBrandEntrancePlayed(first);
  assert.equal(shouldPlayBrandEntrance(fakeSession()), true);
});

// 기록은 정해진 키 하나만 쓴다.
check(() => {
  const session = fakeSession();
  markBrandEntrancePlayed(session);
  assert.equal(session.getItem(BRAND_ENTRANCE_KEY), '1');
  assert.equal(session.size(), 1);
});

// 저장소가 없으면 재생하지 않는다. 기록을 남길 수 없는데 재생하면 route 마다 다시 뜬다.
check(() => {
  assert.equal(shouldPlayBrandEntrance(null), false);
  assert.equal(shouldPlayBrandEntrance(undefined), false);
});

// 저장소가 예외를 던져도 앱이 죽지 않고, 재생하지 않는 쪽으로 떨어진다.
check(() => {
  const hostile = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  assert.equal(shouldPlayBrandEntrance(hostile), false);
  assert.doesNotThrow(() => markBrandEntrancePlayed(hostile));
});

// 길이 예산: 표식이 늦게 걷힐수록 짧은 버전으로 떨어진다.
const FULL = 900;
const SHORT = 400;
const variant = (reduced: boolean, elapsedMs: number) =>
  chooseBrandEntranceVariant({ reduced, elapsedMs, fullMs: FULL, shortMs: SHORT });

// 바로 붙으면 전체 버전을 다 보여준다.
check(() => assert.equal(variant(false, 0), 'full'));

// 상한을 넘지 않는 선까지는 전체 버전을 유지한다.
check(() => assert.equal(variant(false, BRAND_ENTRANCE_MAX_MS - FULL), 'full'));

// 이미 오래 기다렸으면 짧은 버전으로 내린다. 총 길이가 상한을 넘지 않는다.
check(() => {
  const elapsed = 640;
  assert.equal(variant(false, elapsed), 'short');
  assert.ok(elapsed + SHORT <= BRAND_ENTRANCE_MAX_MS);
});

// 예산이 거의 없으면 재생하지 않고 바로 앱을 연다.
check(() => assert.equal(variant(false, BRAND_ENTRANCE_MAX_MS - SHORT + 1), 'none'));

// reduced motion 은 예산이 넉넉해도 전체 버전으로 가지 않는다.
check(() => assert.equal(variant(true, 0), 'short'));

console.log(`features/brandEntrance: ${checks}개 검증 통과`);
