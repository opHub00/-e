/**
 * 브랜드 인트로 노출 정책.
 *
 * 새 browser session 첫 진입과 PWA cold start 에만 1회 재생한다.
 * sessionStorage 는 탭·standalone 창이 살아 있는 동안만 유지되므로
 * route 이동·뒤로가기·같은 세션 refresh 에서는 자연히 재생되지 않고,
 * 창을 새로 여는 PWA cold start 에서는 다시 재생된다.
 * 두 조건을 한 저장소로 처리할 수 있어 별도 플래그를 두지 않는다.
 */

export const BRAND_ENTRANCE_KEY = 'wanpane:brand-entrance';

/** sessionStorage 중 실제로 쓰는 두 메서드만 요구한다. 테스트에서 가짜 저장소를 넣기 쉽다. */
export type SessionLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

/**
 * 저장소를 못 읽으면 재생하지 않는다.
 * 재생 기록을 남길 수 없는 상태에서 재생하면 route 를 옮길 때마다 다시 뜬다.
 * 인트로를 한 번 못 보는 쪽이 매번 다시 뜨는 쪽보다 낫다.
 */
export function shouldPlayBrandEntrance(storage: SessionLike | null | undefined): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(BRAND_ENTRANCE_KEY) === null;
  } catch {
    return false;
  }
}

export function markBrandEntrancePlayed(storage: SessionLike | null | undefined): void {
  if (!storage) return;
  try {
    storage.setItem(BRAND_ENTRANCE_KEY, '1');
  } catch {
    // 저장에 실패해도 이번 재생은 그대로 끝낸다.
  }
}

/** native 에는 sessionStorage 가 없다. 그쪽 cold start 는 OS splash 가 담당한다. */
export function getBrandEntranceSession(): SessionLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * 첫 paint 부터 앱을 가려 두는 표식.
 *
 * 정적 export 는 route HTML 을 미리 그려두기 때문에, React 가 붙기 전에
 * 앱 화면이 먼저 보인다. 그 위에 인트로가 뒤늦게 덮으면
 * "앱 → 인트로 → 앱" 순서가 되어 열리는 느낌이 아니라 가려지는 느낌이 된다.
 * 문서 단계에서 미리 표식을 세워 두고, 인트로가 퇴장할 때 걷는다.
 */
export const BRAND_ENTRANCE_ATTR = 'data-entrance';

/** 인트로 전체가 이 시간을 넘지 않는다. 넘길 바에는 짧은 버전으로 떨어진다. */
export const BRAND_ENTRANCE_MAX_MS = 1200;

/** 표식이 세워진 뒤 흐른 시간. 표식이 없으면 0. */
export function brandEntranceElapsedMs(now = Date.now()): number {
  if (typeof window === 'undefined') return 0;
  const start = (window as { __wanpaneEntranceStart?: number }).__wanpaneEntranceStart;
  return typeof start === 'number' ? Math.max(0, now - start) : 0;
}

export function clearBrandEntranceCover(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.removeAttribute(BRAND_ENTRANCE_ATTR);
}

export type EntranceVariant = 'full' | 'short' | 'none';

/**
 * 남은 예산으로 어떤 버전을 재생할지 고른다.
 * 표식이 오래 서 있었다면 이미 그만큼 기다린 것이므로 짧게 끝낸다.
 */
export function chooseBrandEntranceVariant(input: {
  reduced: boolean;
  elapsedMs: number;
  fullMs: number;
  shortMs: number;
  maxMs?: number;
}): EntranceVariant {
  const budget = (input.maxMs ?? BRAND_ENTRANCE_MAX_MS) - input.elapsedMs;
  if (!input.reduced && budget >= input.fullMs) return 'full';
  if (budget >= input.shortMs) return 'short';
  return 'none';
}
