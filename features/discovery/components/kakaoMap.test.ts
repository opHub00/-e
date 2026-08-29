import { discoveryListings } from '../mockListings.ts';
import {
  countListingsInMapBounds,
  getKakaoMapFocusAction,
  getMapMarkerSetKey,
  hasUsableMapLayout,
  isListingInMapBounds,
} from './kakaoMapDomain.ts';
import {
  buildKakaoMapsSdkUrl,
  loadKakaoMapsSdk,
  resetKakaoMapsSdkLoaderForTests,
} from './kakaoMapsLoader.ts';

let checks = 0;
const check = (condition: unknown, message: string) => {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
};

const sdkUrl = new URL(buildKakaoMapsSdkUrl('javascript key+demo'));
check(sdkUrl.origin === 'https://dapi.kakao.com', 'Kakao SDK는 HTTPS 공식 host에서 불러와야 한다');
check(sdkUrl.pathname === '/v2/maps/sdk.js', 'Kakao Maps JavaScript SDK 경로를 사용해야 한다');
check(sdkUrl.searchParams.get('appkey') === 'javascript key+demo', 'JavaScript key를 URL-safe하게 전달해야 한다');
check(sdkUrl.searchParams.get('autoload') === 'false', 'React lifecycle 뒤에 명시적으로 SDK를 초기화해야 한다');
check(!hasUsableMapLayout(0, 844), '너비가 0인 cold mount 컨테이너에는 지도를 만들면 안 된다');
check(!hasUsableMapLayout(390, 0), '높이가 0인 cold mount 컨테이너에는 지도를 만들면 안 된다');
check(hasUsableMapLayout(390, 520), 'layout이 확정된 컨테이너에서만 지도 초기화가 가능해야 한다');
check(
  getKakaoMapFocusAction({ focused: false, hasMapInstance: false, width: 390, height: 520 }) === 'none',
  'pre-mounted 비활성 탭에서는 layout이 있어도 Kakao Map을 생성하면 안 된다',
);
check(
  getKakaoMapFocusAction({ focused: true, hasMapInstance: false, width: 390, height: 520 }) === 'initialize',
  'focused 탭과 유효 layout이 함께 준비됐을 때만 최초 Map을 생성해야 한다',
);
check(
  getKakaoMapFocusAction({ focused: true, hasMapInstance: true, width: 390, height: 520 }) === 'relayout',
  '기존 Map으로 focus 복귀할 때는 재생성하지 않고 relayout만 해야 한다',
);
check(
  getKakaoMapFocusAction({ focused: true, hasMapInstance: false, width: 0, height: 520 }) === 'none',
  'focus 상태라도 container layout 전에는 Map을 생성하면 안 된다',
);
const markerSetKey = getMapMarkerSetKey(discoveryListings);
check(
  getMapMarkerSetKey([...discoveryListings]) === markerSetKey,
  '선택으로 부모가 다시 렌더되어도 동일 marker 집합은 camera 초기화를 다시 유발하면 안 된다',
);
check(
  getMapMarkerSetKey(discoveryListings.slice(1)) !== markerSetKey,
  '필터로 marker 집합이 바뀌면 기존 의도대로 bounds 갱신을 구분할 수 있어야 한다',
);

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
let loaderMode: 'success' | 'failure' = 'success';
let appendedScripts = 0;
let removedScripts = 0;
let currentScript: ReturnType<typeof createFakeScript> | null = null;
const fakeMaps = { load: (callback: () => void) => callback() };

function createFakeScript() {
  const listeners = new Map<string, () => void>();
  return {
    id: '',
    async: false,
    src: '',
    addEventListener(type: string, handler: () => void) {
      listeners.set(type, handler);
    },
    emit(type: string) {
      listeners.get(type)?.();
    },
    remove() {
      removedScripts += 1;
      if (currentScript === this) currentScript = null;
    },
  };
}

const fakeWindow = {
  kakao: undefined as { maps: typeof fakeMaps } | undefined,
  setTimeout,
  clearTimeout,
};
const fakeDocument = {
  getElementById: () => currentScript,
  createElement: () => createFakeScript(),
  head: {
    appendChild(script: ReturnType<typeof createFakeScript>) {
      appendedScripts += 1;
      currentScript = script;
      queueMicrotask(() => {
        if (loaderMode === 'failure') {
          script.emit('error');
          return;
        }
        fakeWindow.kakao = { maps: fakeMaps };
        script.emit('load');
      });
    },
  },
};

Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument });

resetKakaoMapsSdkLoaderForTests();
const loadedMaps = await loadKakaoMapsSdk('test-javascript-key');
check(loadedMaps === fakeMaps, 'Kakao loader success는 maps.load 완료 뒤 SDK를 반환해야 한다');
check(appendedScripts === 1, 'Kakao SDK script는 한 번만 주입해야 한다');

resetKakaoMapsSdkLoaderForTests();
fakeWindow.kakao = undefined;
loaderMode = 'failure';
let loaderRejected = false;
try {
  await loadKakaoMapsSdk('test-javascript-key');
} catch {
  loaderRejected = true;
}
check(loaderRejected, 'Kakao SDK script failure는 fallback으로 전환할 수 있도록 reject해야 한다');

loaderMode = 'success';
const recoveredMaps = await loadKakaoMapsSdk('test-javascript-key');
check(recoveredMaps === fakeMaps, '이전 loader failure가 다음 정상 load를 막으면 안 된다');
check(appendedScripts === 3, '실패 뒤 정상 재시도는 새 script를 주입해야 한다');
check(removedScripts >= 2, 'reset/failure 시 stale Kakao script를 제거해야 한다');

resetKakaoMapsSdkLoaderForTests();
if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
else Reflect.deleteProperty(globalThis, 'window');
if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
else Reflect.deleteProperty(globalThis, 'document');

const capitalBounds = { south: 37.2, west: 126.6, north: 37.7, east: 127.3 };
check(
  countListingsInMapBounds(discoveryListings, capitalBounds) === discoveryListings.length,
  '초기 수도권 bounds에 Mock Listing 12개가 모두 포함되어야 한다',
);

const mapo = discoveryListings.find((listing) => listing.id === 'mapo-riverline');
if (!mapo) throw new Error('FAIL: mapo fixture missing');
if (mapo.latitude === null || mapo.longitude === null) throw new Error('FAIL: mapo coordinates missing');
const mapoBounds = {
  south: mapo.latitude - 0.001,
  west: mapo.longitude - 0.001,
  north: mapo.latitude + 0.001,
  east: mapo.longitude + 0.001,
};
check(isListingInMapBounds(mapo, mapoBounds), '선택 listing의 실제 lat/lng로 bounds 포함 여부를 계산해야 한다');
check(countListingsInMapBounds(discoveryListings, mapoBounds) === 1, '좁은 지도 영역에는 해당 pin만 집계해야 한다');
check(
  isListingInMapBounds(mapo, {
    south: mapo.latitude,
    west: mapo.longitude,
    north: mapo.latitude,
    east: mapo.longitude,
  }),
  'bounds 경계의 pin도 현재 지도 영역에 포함해야 한다',
);
check(
  !isListingInMapBounds(mapo, { south: 36, west: 128, north: 36.5, east: 128.5 }),
  '지도 밖의 listing은 현재 영역 집계에서 제외해야 한다',
);

console.log(`features/discovery/kakao-map: ${checks}개 검증 통과`);
