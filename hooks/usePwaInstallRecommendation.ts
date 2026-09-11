import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PWA_RECOMMENDATION_DELAY_MS,
  PWA_RECOMMENDATION_DISMISSED_AT_KEY,
  PWA_RECOMMENDATION_INSTALLED_KEY,
  PWA_RECOMMENDATION_SESSION_KEY,
  readStoredFlag,
  readStoredTimestamp,
  shouldRecommendPwaInstall,
  writeStoredValue,
} from '../features/pwa/recommendation';
import { usePwaInstall } from './usePwaInstall';

type Options = {
  enabled: boolean;
  delayMs?: number;
};

export type PwaRecommendationInstallResult =
  | 'accepted'
  | 'dismissed'
  | 'ios-instructions'
  | 'unavailable';

function brandEntranceIsVisible(): boolean {
  if (typeof document === 'undefined') return true;
  return document.documentElement.hasAttribute('data-entrance')
    || Boolean(document.querySelector('[data-testid="brand-entrance"]'));
}

/**
 * 앱 진입 설치 추천의 상태 contract.
 * native prompt는 install()을 사용자가 호출할 때만 열고, Auth/Profile 저장소와 분리한다.
 */
export function usePwaInstallRecommendation({
  enabled,
  delayMs = PWA_RECOMMENDATION_DELAY_MS,
}: Options) {
  const pwa = usePwaInstall();
  const [storageReady, setStorageReady] = useState(false);
  const [shownThisSession, setShownThisSession] = useState(true);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [storedInstalled, setStoredInstalled] = useState(false);
  const [visible, setVisible] = useState(false);
  const installed = storedInstalled || pwa.installMode === 'standalone';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setShownThisSession(readStoredFlag(window.sessionStorage, PWA_RECOMMENDATION_SESSION_KEY));
    setDismissedAt(readStoredTimestamp(window.localStorage, PWA_RECOMMENDATION_DISMISSED_AT_KEY));
    setStoredInstalled(readStoredFlag(window.localStorage, PWA_RECOMMENDATION_INSTALLED_KEY));
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onInstalled = () => {
      writeStoredValue(window.localStorage, PWA_RECOMMENDATION_INSTALLED_KEY, '1');
      setStoredInstalled(true);
      setVisible(false);
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  const eligible = useMemo(
    () => storageReady && enabled && pwa.canInstall && shouldRecommendPwaInstall({
      platform: pwa.installMode,
      installed,
      shownThisSession,
      dismissedAt,
    }),
    [dismissedAt, enabled, installed, pwa.canInstall, pwa.installMode, shownThisSession, storageReady],
  );

  useEffect(() => {
    if (!enabled || installed) setVisible(false);
    if (!eligible || typeof window === 'undefined' || typeof document === 'undefined') return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    const show = () => {
      if (disposed || brandEntranceIsVisible() || document.visibilityState !== 'visible') return;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (disposed || brandEntranceIsVisible() || document.visibilityState !== 'visible') return;
        writeStoredValue(window.sessionStorage, PWA_RECOMMENDATION_SESSION_KEY, '1');
        setShownThisSession(true);
        setVisible(true);
      }));
    };
    const schedule = () => {
      if (brandEntranceIsVisible() || document.visibilityState !== 'visible') {
        if (timer) clearTimeout(timer);
        timer = null;
        return;
      }
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        show();
      }, delayMs);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-entrance'],
      childList: true,
      subtree: true,
    });
    document.addEventListener('visibilitychange', schedule);
    schedule();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [delayMs, eligible, enabled, installed]);

  const dismiss = useCallback(() => {
    const now = Date.now();
    if (typeof window !== 'undefined') {
      writeStoredValue(window.localStorage, PWA_RECOMMENDATION_DISMISSED_AT_KEY, String(now));
    }
    setDismissedAt(now);
    setVisible(false);
  }, []);

  const install = useCallback(async (): Promise<PwaRecommendationInstallResult> => {
    if (!visible || installed) return 'unavailable';
    const mode = pwa.installMode;
    const accepted = await pwa.install();
    if (mode === 'ios-safari') return 'ios-instructions';
    if (accepted) {
      if (typeof window !== 'undefined') {
        writeStoredValue(window.localStorage, PWA_RECOMMENDATION_INSTALLED_KEY, '1');
      }
      setStoredInstalled(true);
      setVisible(false);
      return 'accepted';
    }
    dismiss();
    return mode === 'native' ? 'dismissed' : 'unavailable';
  }, [dismiss, installed, pwa, visible]);

  return {
    canRecommend: visible && !installed,
    platform: pwa.installMode,
    isInstalling: pwa.installing,
    install,
    dismiss,
    installed,
    showIosInstructions: pwa.showIosInstructions,
  };
}
