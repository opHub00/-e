export type PwaInstallPlatform = 'standalone' | 'native' | 'ios-safari' | 'unavailable';

type StandaloneInput = {
  displayModeStandalone: boolean;
  navigatorStandalone: boolean;
};

type PlatformInput = {
  standalone: boolean;
  hasNativePrompt: boolean;
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
};

export function isStandaloneDisplay(input: StandaloneInput) {
  return input.displayModeStandalone || input.navigatorStandalone;
}

export function isIosSafari(input: Pick<PlatformInput, 'userAgent' | 'platform' | 'maxTouchPoints'>) {
  const iosDevice = /iPad|iPhone|iPod/i.test(input.userAgent)
    || (input.platform === 'MacIntel' && (input.maxTouchPoints ?? 0) > 1);
  const safari = /Safari/i.test(input.userAgent)
    && !/(CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo)/i.test(input.userAgent);
  return iosDevice && safari;
}

export function detectPwaInstallPlatform(input: PlatformInput): PwaInstallPlatform {
  if (input.standalone) return 'standalone';
  if (input.hasNativePrompt) return 'native';
  if (isIosSafari(input)) return 'ios-safari';
  return 'unavailable';
}
