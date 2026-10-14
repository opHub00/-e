import { Image, StyleSheet, View } from 'react-native';
import { BRAND } from './brandAssets';

/** Samdo event partner mark. The logo alone occupies the semantic top-right partner position. */
export function PartnerBadge({ compact = false }: { compact?: boolean }) {
  if (!BRAND.partnerLogo) return null;
  const height = compact ? 14 : 20;
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
