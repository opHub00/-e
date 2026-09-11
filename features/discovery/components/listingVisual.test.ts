import assert from 'node:assert/strict';
import {
  getListingLocationFallback,
  getListingVisualErrorFallback,
} from '../../listingVisual/selectListingVisual.ts';
import type { ListingVisual } from '../../listingVisual/types.ts';
import { listingVisualIcon } from './listingVisual.ts';

let checks = 0;
const check = (fn: () => void) => {
  fn();
  checks += 1;
};

// 좌표가 있으면 위치 미리보기다. 사진이라고 부르지 않는다.
check(() => {
  const visual = getListingLocationFallback({ latitude: 37.5, longitude: 127.02 });
  assert.equal(visual.kind, 'map_preview');
  if (visual.kind !== 'map_preview') return;
  assert.equal(visual.label, '위치 미리보기');
});

// 좌표가 없으면 아무것도 없음으로 떨어지고 이유를 남긴다.
check(() => {
  const visual = getListingLocationFallback({ latitude: null, longitude: null });
  assert.deepEqual(visual, { kind: 'none', reason: 'missing_coordinates' });
});

// NaN 은 좌표가 아니다. 지도 미리보기로 올라가면 안 된다.
check(() => {
  assert.equal(getListingLocationFallback({ latitude: Number.NaN, longitude: 127 }).kind, 'none');
  assert.equal(getListingLocationFallback({ latitude: 37.5, longitude: Number.NaN }).kind, 'none');
});

// UI 가 스스로 사진을 만들어내지 않는다. 어떤 입력으로도 verified_image 가 나오면 안 된다.
check(() => {
  const inputs = [
    { latitude: 37.5, longitude: 127.02 },
    { latitude: null, longitude: 127.02 },
    { latitude: 0, longitude: 0 },
  ];
  for (const input of inputs) {
    assert.notEqual(getListingLocationFallback(input).kind, 'verified_image');
  }
});

// 사진을 못 불러오면 계약이 함께 준 대체 표현으로 떨어진다.
check(() => {
  const fallback = {
    kind: 'map_preview' as const,
    latitude: 37.5,
    longitude: 127.02,
    label: '위치 미리보기' as const,
    provenance: 'existing_listing_coordinate' as const,
  };
  const image: ListingVisual = {
    kind: 'verified_image',
    url: 'https://example.test/a.jpg',
    source: { name: '출처', pageUrl: 'https://example.test' },
    reusePermission: {
      basis: 'written-permission',
      referenceUrl: 'https://example.test/permission',
    },
    fallback,
  };
  assert.deepEqual(getListingVisualErrorFallback(image), fallback);
});

// 위치 미리보기가 실패하면 이유를 바꿔 아무것도 없음으로 간다. 깨진 아이콘은 없다.
check(() => {
  const preview: ListingVisual = {
    kind: 'map_preview',
    latitude: 37.5,
    longitude: 127.02,
    label: '위치 미리보기',
    provenance: 'existing_listing_coordinate',
  };
  assert.deepEqual(getListingVisualErrorFallback(preview), { kind: 'none', reason: 'preview_unavailable' });
});

// 같은 주택 유형은 늘 같은 아이콘이어야 목록에서 구분에 쓸 수 있다.
check(() => {
  assert.equal(listingVisualIcon('아파트'), listingVisualIcon('아파트'));
  assert.equal(listingVisualIcon('아파트'), 'apartment');
  assert.equal(listingVisualIcon('오피스텔'), 'domain');
  assert.notEqual(listingVisualIcon('아파트'), listingVisualIcon('오피스텔'));
});

console.log(`features/discovery/listingVisual: ${checks}개 검증 통과`);
