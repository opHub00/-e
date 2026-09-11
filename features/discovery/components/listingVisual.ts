import type { HousingType } from '../types.ts';

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
