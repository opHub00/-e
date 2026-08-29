import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors } from '../design/tokens';

type Props = { size?: number };

/**
 * 완판e 브랜드 마크.
 * Stitch 의 호랑이 마스코트를 이모지가 아니라 기하 도형으로 정리했다.
 * 32px 에서도 뭉치지 않도록 귀·얼굴·눈만 남긴다.
 */
export function BrandMark({ size = 34 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Defs>
        <LinearGradient id="wanpanMark" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.primaryContainer} />
          <Stop offset="1" stopColor={colors.primary} />
        </LinearGradient>
      </Defs>

      {/* squircle 타일 */}
      <Rect x="0" y="0" width="32" height="32" rx="10" fill="url(#wanpanMark)" />

      {/* 귀 */}
      <Circle cx="9.2" cy="10.2" r="3.4" fill={colors.onPrimary} />
      <Circle cx="22.8" cy="10.2" r="3.4" fill={colors.onPrimary} />

      {/* 얼굴 */}
      <Circle cx="16" cy="18" r="8.2" fill={colors.onPrimary} />

      {/* 이마 줄무늬 */}
      <Rect x="13.9" y="11.4" width="1.6" height="3.4" rx="0.8" fill={colors.primary} />
      <Rect x="16.5" y="11.4" width="1.6" height="3.4" rx="0.8" fill={colors.primary} />

      {/* 눈 */}
      <Circle cx="12.9" cy="17.6" r="1.45" fill={colors.primary} />
      <Circle cx="19.1" cy="17.6" r="1.45" fill={colors.primary} />

      {/* 입 */}
      <Path
        d="M13.4 21.2 Q16 23.4 18.6 21.2"
        stroke={colors.primary}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
