import { Image, StyleSheet, View } from 'react-native';
import { BRAND } from './brandAssets';

/**
 * 흥인코퍼레이션 파트너 로고(원본). 우측 상단, 로고만('함께하는 곳' 같은 문구 없음).
 * 글자가 읽히도록 기기별로 크기를 따로 정한다. 완판e 보다 주 브랜드처럼 보이지 않는 선(헤더 완판e 캐릭터 높이보다 작게).
 */
export type PartnerSize = 'desktop' | 'tablet' | 'phone' | 'phoneNarrow';
const HEIGHT: Record<PartnerSize, number> = { desktop: 30, tablet: 28, phone: 21, phoneNarrow: 20 };

export function partnerSizeFor(width: number): PartnerSize {
  if (width > 0 && width <= 360) return 'phoneNarrow';
  if (width > 0 && width < 744) return 'phone';
  if (width > 0 && width < 1200) return 'tablet';
  return 'desktop';
}

export function PartnerBadge({ compact = false, size }: { compact?: boolean; size?: PartnerSize }) {
  if (!BRAND.partnerLogo) return null;
  const height = HEIGHT[size ?? (compact ? 'phone' : 'desktop')];
  return (
    <View
      testID="partner-badge"
      style={styles.badge}
      accessibilityLabel={BRAND.partnerName}
      accessibilityRole="image"
    >
      <Image
        testID="partner-logo"
        source={BRAND.partnerLogo.source}
        style={{ height, width: height * BRAND.partnerLogo.ratio }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'flex-end', justifyContent: 'center' },
});
