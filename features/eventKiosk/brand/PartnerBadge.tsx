import { Image, StyleSheet, Text, View } from 'react-native';
import { k } from '../ui/theme';
import { BRAND } from './brandAssets';

/**
 * 삼도이동 1지구 관련 화면 우측 상단의 파트너 표시.
 *   함께하는 곳
 *   [흥인코퍼레이션 로고]
 * 완판e 보다 작고 흐리게 둔다(메인 sponsor 처럼 보이지 않게). compact 는 휴대폰 위 틀.
 */
export function PartnerBadge({ compact = false }: { compact?: boolean }) {
  if (!BRAND.partnerLogo) return null;
  const height = compact ? 14 : 20;
  return (
    <View testID="partner-badge" style={[styles.badge, compact && styles.badgeCompact]} accessibilityLabel={`함께하는 곳 ${BRAND.partnerName}`}>
      <Text style={[styles.label, compact && styles.labelCompact]}>함께하는 곳</Text>
      <Image
        testID="partner-logo"
        source={BRAND.partnerLogo.source}
        style={[styles.logo, { height, width: height * BRAND.partnerLogo.ratio }]}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'flex-end', justifyContent: 'center', gap: 2 },
  badgeCompact: { gap: 1 },
  label: { ...k.type.caption, fontSize: 12, lineHeight: 16, color: k.colors.textSubtle },
  labelCompact: { fontSize: 11, lineHeight: 14 },
  logo: { opacity: 0.72 },
});
