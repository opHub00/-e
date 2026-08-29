import type { KakaoMapsApi } from './kakaoMapsTypes.ts';

const SCRIPT_ID = 'wanpane-kakao-maps-sdk';
const SDK_TIMEOUT_MS = 12_000;
let sdkPromise: Promise<KakaoMapsApi> | null = null;

function logKakaoMap(message: string, error?: unknown) {
  if (process.env.NODE_ENV === 'production') return;
  if (error === undefined) {
    console.info(`[KakaoMap] ${message}`);
    return;
  }
  console.error(
    `[KakaoMap] ${message}: ${error instanceof Error ? error.message : String(error)}`,
  );
}

export function buildKakaoMapsSdkUrl(appKey: string): string {
  return `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
}

export function loadKakaoMapsSdk(appKey: string): Promise<KakaoMapsApi> {
  const normalizedKey = appKey.trim();
  if (!normalizedKey) return Promise.reject(new Error('missing-kakao-map-key'));
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('kakao-map-web-only'));
  }
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<KakaoMapsApi>((resolve, reject) => {
    let settled = false;
    let mapsLoading = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      sdkPromise = null;
      document.getElementById(SCRIPT_ID)?.remove();
      logKakaoMap('load failed', error);
      reject(error);
    };

    const finish = () => {
      if (settled || mapsLoading) return;
      const maps = window.kakao?.maps;
      if (!maps) {
        fail(new Error('kakao-map-sdk-unavailable'));
        return;
      }
      mapsLoading = true;
      maps.load(() => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        logKakaoMap('maps ready');
        resolve(maps);
      });
    };

    const timeoutId = window.setTimeout(
      () => fail(new Error('kakao-map-sdk-timeout')),
      SDK_TIMEOUT_MS,
    );

    if (window.kakao?.maps) {
      finish();
      return;
    }

    // HMR can leave a completed/failed script element while resetting this module's promise.
    // Without a matching global SDK it can never emit load again, so replace it deterministically.
    document.getElementById(SCRIPT_ID)?.remove();
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = buildKakaoMapsSdkUrl(normalizedKey);
    script.addEventListener('load', () => {
      logKakaoMap('script loaded');
      finish();
    }, { once: true });
    script.addEventListener(
      'error',
      () => fail(new Error('kakao-map-sdk-load-failed')),
      { once: true },
    );
    logKakaoMap('script loading');
    document.head.appendChild(script);
  });

  return sdkPromise;
}

export function resetKakaoMapsSdkLoaderForTests() {
  sdkPromise = null;
  if (typeof document !== 'undefined') document.getElementById(SCRIPT_ID)?.remove();
}
