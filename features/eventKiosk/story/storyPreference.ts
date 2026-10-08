/**
 * Product Story 를 이미 봤는지. 이 브라우저에서 한 번 보면(끝까지 보든, 건너뛰든, 바로 시작하든) 다시 강제로 틀지 않는다.
 *
 * 개인정보가 아닌 '봤음' 표시 하나만 저장한다. 방문자 입력·결과는 여전히 메모리에만 있다.
 * 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 그 세션 동안만 기억한다.
 */
export const STORY_SEEN_KEY = 'wanpan.event.productStory.v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
let memorySeen = false;

function storage(): StorageLike | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hasSeenStory(store: StorageLike | null = storage()): boolean {
  if (memorySeen) return true;
  try {
    return store?.getItem(STORY_SEEN_KEY) === 'seen';
  } catch {
    return false;
  }
}

export function markStorySeen(store: StorageLike | null = storage()): void {
  memorySeen = true;
  try {
    store?.setItem(STORY_SEEN_KEY, 'seen');
  } catch {
    // 저장하지 못해도 이번 세션에서는 다시 틀지 않는다.
  }
}

/** 운영·QA 용. 다음 진입에서 다시 자동 재생되게 한다. */
export function forgetStorySeen(store: StorageLike | null = storage()): void {
  memorySeen = false;
  try {
    store?.removeItem(STORY_SEEN_KEY);
  } catch {
    // 무시
  }
}
