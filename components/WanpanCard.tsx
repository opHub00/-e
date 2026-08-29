import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../design/tokens';

type Props = PropsWithChildren<{
  tone?: 'surface' | 'lavender';
  style?: ViewStyle;
}>;

export function WanpanCard({ children, tone = 'surface', style }: Props) {
  return <View style={[styles.card, tone === 'lavender' && styles.lavender, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.outline,
    padding: spacing.md,
  },
  lavender: {
    backgroundColor: colors.lavender,
    borderColor: colors.primaryFixed,
  },
});
