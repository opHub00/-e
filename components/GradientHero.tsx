import { LinearGradient } from 'expo-linear-gradient';
import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, overlay, radius, shadow, spacing } from '../design/tokens';

type Props = PropsWithChildren<{ compact?: boolean }>;

/** Home hero의 gradient·glow·depth만 공유하는 얇은 프리미티브. */
export function GradientHero({ children, compact }: Props) {
  return (
    <LinearGradient
      colors={[colors.primaryContainer, colors.primary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, compact && styles.compact]}
    >
      <View style={styles.glowLarge} />
      <View style={styles.content}>{children}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    minHeight: 220,
    borderRadius: radius.bento,
    padding: spacing.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  compact: { minHeight: 0 },
  content: { flex: 1, zIndex: 1 },
  glowLarge: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: radius.pill,
    backgroundColor: overlay.glow,
    right: -72,
    top: -92,
  },
});
