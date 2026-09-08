import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow, spacing, type } from '../design/tokens';
import { IconChip } from './IconChip';
import { MotionPressable } from './motion/MotionPressable';

type Props = {
  title: string;
  description: string;
  onPress: () => void;
};

/** AI가 별도 기능이 아니라 현재 화면의 다음 설명 단계로 느껴지게 하는 CTA. */
export function AICTA({ title, description, onPress }: Props) {
  return (
    <MotionPressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.card}
    >
      <View style={styles.glow} />
      <IconChip name="auto-awesome" tone="purple" size="md" />
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>완판e AI</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <View style={styles.arrow}>
        <MaterialIcons name="arrow-forward" size={20} color={colors.onPrimary} />
      </View>
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 132,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: radius.bento,
    borderWidth: 1,
    borderColor: colors.primaryFixed,
    backgroundColor: colors.lavender,
    padding: spacing.md,
    overflow: 'hidden',
    ...shadow.card,
  },
  glow: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    right: -44,
    top: -58,
    backgroundColor: 'rgba(83,74,183,0.08)',
  },
  copy: { flex: 1, gap: 3 },
  eyebrow: { ...type.caption, color: colors.primary },
  title: { ...type.cardTitle, color: colors.text },
  description: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  arrow: {
    alignSelf: 'center',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
});
