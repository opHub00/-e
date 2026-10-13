import type { ImageSourcePropType } from 'react-native';

/**
 * 행사 화면 브랜드 이미지. 모두 사용자가 제공한 원본 .ai 를 그대로 잘라 배경만 투명하게 만든 PNG 다.
 * 새로 그리거나 생성한 이미지는 없다.
 *
 * - character: `완판이-인형제작.ai` 앞면 전신(427×480). 완판e 메인 브랜드 이미지.
 * - consultant: `완판이-이모티콘-글자추가.ai` 3쪽 헤드셋 포즈(323×360, 위 글자 제외). AI 상담 전용.
 * - partnerLogo: ㈜흥인코퍼레이션 로고 원본(투명 배경, 751×200). 삼도이동 1지구 관련 화면 우측 상단에만.
 *
 * 원본이 없으면 null 로 두고 화면은 글자만 보여 준다(임의 대체 이미지 금지).
 */
export type BrandImage = { source: ImageSourcePropType; ratio: number };

export const BRAND: {
  name: string;
  character: BrandImage | null;
  consultant: BrandImage | null;
  partnerLogo: BrandImage | null;
  partnerName: string;
} = {
  name: '완판e',
  character: { source: require('../../../assets/images/brand/wanpan-character.png'), ratio: 427 / 480 },
  consultant: { source: require('../../../assets/images/brand/wanpan-consultant.png'), ratio: 323 / 360 },
  partnerLogo: { source: require('../../../assets/images/brand/heungin-logo.png'), ratio: 751 / 200 },
  partnerName: '㈜흥인코퍼레이션',
};
