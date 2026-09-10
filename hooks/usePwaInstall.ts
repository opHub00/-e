import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { detectPwaInstallPlatform, isStandaloneDisplay } from '../features/pwa/platform';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type PwaWindow = Window & {
  __wanpaneInstallPrompt?: InstallPromptEvent | null;
};

const PROMPT_READY_EVENT = 'wanpane:installpromptready';

export function usePwaInstall() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const installInFlight = useRef(false);
  const [installing, setInstalling] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [platform, setPlatform] = useState<'standalone' | 'native' | 'ios-safari' | 'unavailable'>('unavailable');

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const pwaWindow = window as PwaWindow;
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const syncPlatform = () => {
      const isStandalone = isStandaloneDisplay({
        displayModeStandalone: displayMode.matches,
        navigatorStandalone: Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
      });
      setStandalone(isStandalone);
      setPlatform(detectPwaInstallPlatform({
        standalone: isStandalone,
        hasNativePrompt: Boolean(pwaWindow.__wanpaneInstallPrompt),
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        maxTouchPoints: navigator.maxTouchPoints,
      }));
    };
    const onPrompt = (event: Event) => {
      event.preventDefault();
      pwaWindow.__wanpaneInstallPrompt = event as InstallPromptEvent;
      setPromptEvent(event as InstallPromptEvent);
      syncPlatform();
    };
    const onPromptReady = () => {
      setPromptEvent(pwaWindow.__wanpaneInstallPrompt ?? null);
      syncPlatform();
    };
    const onInstalled = () => {
      pwaWindow.__wanpaneInstallPrompt = null;
      setPromptEvent(null);
      setShowIosInstructions(false);
      syncPlatform();
    };
    setPromptEvent(pwaWindow.__wanpaneInstallPrompt ?? null);
    syncPlatform();
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener(PROMPT_READY_EVENT, onPromptReady);
    window.addEventListener('appinstalled', onInstalled);
    displayMode.addEventListener('change', syncPlatform);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener(PROMPT_READY_EVENT, onPromptReady);
      window.removeEventListener('appinstalled', onInstalled);
      displayMode.removeEventListener('change', syncPlatform);
    };
  }, []);

  const install = useCallback(async () => {
    if (installInFlight.current || standalone) return false;
    if (!promptEvent) {
      if (platform === 'ios-safari') setShowIosInstructions(true);
      return false;
    }
    installInFlight.current = true;
    setInstalling(true);
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      (window as PwaWindow).__wanpaneInstallPrompt = null;
      setPromptEvent(null);
      return choice.outcome === 'accepted';
    } catch {
      (window as PwaWindow).__wanpaneInstallPrompt = null;
      setPromptEvent(null);
      return false;
    } finally {
      installInFlight.current = false;
      setInstalling(false);
    }
  }, [platform, promptEvent, standalone]);

  return {
    canInstall: !standalone && (promptEvent !== null || platform === 'ios-safari'),
    install,
    installing,
    installMode: platform,
    showIosInstructions,
  };
}
