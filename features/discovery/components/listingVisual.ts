import type { DiscoveryListing, HousingType } from '../types.ts';

/**
 * 공고 시각 자료의 표현 계약.
 *
 * 이 파일은 presentation 전용이다. URL 이나 제목을 보고 실제 사진인지 추론하지 않는다.
 * 어떤 값이 검증된 사진인지, 위치 미리보기인지는 데이터 계층이 정하고
 * UI 는 정해진 종류를 그대로 표현만 한다.
 *
 * 모양은 데이터 계층이 준비 중인 계약을 그대로 따라간다.
 * 계약이 들어오면 아래 resolveListingVisual 하나만 교체하면 된다.
 */
export type ListingLocationPreview = {
  kind: 'map_preview';
  latitude: number;
  longitude: number;
  label: '위치 미리보기';
};

export type ListingVisualNone = {
  kind: 'none';
  reason: 'missing_coordinates' | 'preview_unavailable';
};

export type ListingVerifiedImage = {
  kind: 'verified_image';
  url: string;
  source: { name: string; pageUrl: string };
  attribution?: string;
  /** 이미지를 못 불러왔을 때 대신 보여줄 것. 데이터 계층이 함께 정해서 내려준다. */
  fallback: ListingLocationPreview | ListingVisualNone;
};

export type ListingVisual = ListingVerifiedImage | ListingLocationPreview | ListingVisualNone;
export type ListingVisualKind = ListingVisual['kind'];

/**
 * 주택 유형에서 대표 아이콘을 고른다.
 *
 * 공고마다 임의의 색과 아이콘을 뽑으면 보기에는 다양해도 아무 뜻이 없다.
 * 같은 유형이 늘 같게 보여야 목록을 훑을 때 실제로 구분에 쓸 수 있다.
 */
const HOUSING_ICON: Record<HousingType, 'apartment' | 'location-city' | 'holiday-village' | 'domain'> = {
  아파트: 'apartment',
  오피스텔: 'domain',
  도시형생활주택: 'holiday-village',
  기타: 'location-city',
};

export function listingVisualIcon(housingType: HousingType) {
  return HOUSING_ICON[housingType] ?? HOUSING_ICON.기타;
}

/**
 * 좌표가 있으면 위치 미리보기, 없으면 아무것도 없음.
 *
 * 데이터 계층 계약이 붙기 전까지 쓰는 임시 판정이다.
 * 검증된 사진은 여기서 절대 만들어내지 않는다.
 * 사진인지 아닌지는 재사용 허가를 확인할 수 있는 쪽만 정할 수 있다.
 */
export function resolveListingVisual(
  listing: Pick<DiscoveryListing, 'latitude' | 'longitude'>,
): ListingVisual {
  const { latitude, longitude } = listing;
  if (
    latitude === null
    || longitude === null
    || !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
  ) {
    return { kind: 'none', reason: 'missing_coordinates' };
  }
  return { kind: 'map_preview', latitude, longitude, label: '위치 미리보기' };
}

/**
 * 이미지를 못 불러왔을 때의 표현.
 * 깨진 아이콘을 보여주는 대신 계약이 함께 준 대체 표현으로 떨어진다.
 */
export function visualAfterError(visual: ListingVisual): ListingVisual {
  return visual.kind === 'verified_image'
    ? visual.fallback
    : { kind: 'none', reason: 'preview_unavailable' };
}
