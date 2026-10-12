import type { ImageSourcePropType } from 'react-native';

/**
 * 삼도이동 1지구 결과 화면의 브랜드 이미지.
 *
 * - 완판e 로고: 업로드된 `리본_완판이_브로슈어.ai` 표지의 공식 로고(분양시장의 도우미 + 얼굴 + 완판e)를 그대로 잘라 배경만 투명하게 만든 PNG(538×200).
 * - 완판이: 업로드된 원본 `완판이-인형제작.ai` 앞면을 그대로 잘라 배경만 투명하게 만든 PNG(427×480).
 * - 파트너 로고: 업로드된 ㈜흥인코퍼레이션 로고 원본(투명 배경)을 줄인 PNG(751×200). 이 화면에서만 보조로 쓴다.
 *
 * 원본이 없으면 값을 null 로 두고 화면은 'asset 필요' 자리만 그린다. 임의로 그린 대체 이미지는 쓰지 않는다.
 */
export type BrandImage = { source: ImageSourcePropType; ratio: number };

export const SAMDO_BRAND: { logo: BrandImage | null; character: BrandImage | null; partnerLogo: BrandImage | null; partnerName: string } = {
  logo: { source: require('../../../assets/images/brand/wanpan-logo.png'), ratio: 538 / 200 },
  character: { source: require('../../../assets/images/brand/wanpan-character.png'), ratio: 427 / 480 },
  partnerLogo: { source: require('../../../assets/images/brand/heungin-logo.png'), ratio: 751 / 200 },
  partnerName: '㈜흥인코퍼레이션',
};
