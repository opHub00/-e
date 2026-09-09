import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow, spacing, type } from '../../design/tokens';
import { MotionPressable } from '../motion/MotionPressable';

type Props = { active: 'general' | 'newlywed' };

export function PreparationAreaNav({ active }: Props) {
  const router = useRouter();
  return (
    <View accessibilityRole="tablist" style={styles.wrap}>
      <AreaTab label="전체 준비" selected={active === 'general'} onPress={() => router.replace('/preparation' as Href)} />
      <AreaTab label="신혼 청약" selected={active === 'newlywed'} onPress={() => router.push('/newlywed' as Href)} />
    </View>
  );
}

function AreaTab({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <MotionPressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      aria-selected={selected}
      hitSlop={{ top: spacing.xs, bottom: spacing.xs }}
      onPress={onPress}
      style={[styles.tab, selected && styles.selected]}
    >
      <Text numberOfLines={1} style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 44,
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.button,
    padding: spacing.xs,
    marginHorizontal: spacing.screen,
    marginTop: spacing.lg,
  },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.button },
  selected: { backgroundColor: colors.surface, ...shadow.card },
  label: { ...type.bodySmStrong, color: colors.textSubtle },
  selectedLabel: { color: colors.primary },
});
