import type { PwaInstallPlatform } from './platform.ts';

export const PWA_RECOMMENDATION_SESSION_KEY = 'wanpane:pwa-recommendation-shown';
export const PWA_RECOMMENDATION_DISMISSED_AT_KEY = 'wanpane:pwa-recommendation-dismissed-at';
export const PWA_RECOMMENDATION_INSTALLED_KEY = 'wanpane:pwa-recommendation-installed';
export const PWA_RECOMMENDATION_DELAY_MS = 600;
export const PWA_RECOMMENDATION_DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export type RecommendationStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export type PwaRecommendationPolicyInput = {
  platform: PwaInstallPlatform;
  installed: boolean;
  shownThisSession: boolean;
  dismissedAt: number | null;
  now?: number;
};

export function readStoredTimestamp(
  storage: RecommendationStorage | null | undefined,
  key: string,
): number | null {
  if (!storage) return null;
  try {
    const value = Number(storage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function readStoredFlag(
  storage: RecommendationStorage | null | undefined,
  key: string,
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function writeStoredValue(
  storage: RecommendationStorage | null | undefined,
  key: string,
  value: string,
): void {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // 저장소가 차단돼도 현재 화면의 설치 흐름은 계속 사용할 수 있다.
  }
}

export function shouldRecommendPwaInstall(input: PwaRecommendationPolicyInput): boolean {
  if (input.platform !== 'native' && input.platform !== 'ios-safari') return false;
  if (input.installed || input.shownThisSession) return false;
  if (input.dismissedAt === null) return true;
  return (input.now ?? Date.now()) - input.dismissedAt >= PWA_RECOMMENDATION_DISMISS_COOLDOWN_MS;
}
