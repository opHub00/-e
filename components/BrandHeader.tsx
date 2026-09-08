import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BrandMark } from './BrandMark';
import { colors, spacing, tracking, type } from '../design/tokens';

type Props = {
  /** brand = 홈. 워드마크까지 노출해 제품을 인식시킨다. compact = 그 외 탭. */
  variant?: 'brand' | 'compact';
  /** compact 에서 워드마크 자리에 들어가는 화면 이름. */
  title?: string;
  right?: ReactNode;
};

export function BrandHeader({ variant = 'compact', title, right }: Props) {
  const brand = variant === 'brand';

  return (
    <View style={[styles.header, brand && styles.headerBrand]}>
      <BrandMark size={brand ? 34 : 24} />
      {brand ? (
        <Text style={styles.wordmark}>완판e</Text>
      ) : (
        <Text style={styles.title}>{title}</Text>
      )}
      <View style={styles.spacer} />
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.screen,
    paddingTop: 2,
    paddingBottom: 6,
  },
  headerBrand: { gap: 9, paddingBottom: 8 },
  /** Stitch headline-md 와 같은 급. 기존 16px 워드마크는 제품 대비 약했다. */
  wordmark: { ...type.title, fontSize: 22, lineHeight: 28, color: colors.primary, letterSpacing: tracking.tight },
  title: { ...type.bodyLgStrong, color: colors.text, letterSpacing: tracking.snug },
  spacer: { flex: 1 },
});
