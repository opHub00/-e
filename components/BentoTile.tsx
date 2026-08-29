import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { IconChip } from './IconChip';
import { MotionPressable } from './motion/MotionPressable';
import { colors, radius, spacing, tint, type } from '../design/tokens';

type Props = {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  tone: keyof typeof tint;
  /** 아이콘 우측 pill. 예: 'D-DAY' */
  badge?: string;
  title: string;
  /** 하단 좌측 강조 값. 예: '84점' */
  value?: string;
  onPress?: () => void;
};

/** Stitch 2-up 벤토 타일. 흰 카드 + tint 아이콘 칩 + 하단 값/화살표. */
export function BentoTile({ icon, tone, badge, title, value, onPress }: Props) {
  return (
    <MotionPressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={styles.tile}
    >
      <View style={styles.top}>
        <IconChip name={icon} tone={tone} />
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>

      <View style={styles.bottom}>
        {value ? <Text style={styles.value}>{value}</Text> : <View />}
        {onPress ? (
          <View style={styles.arrow}>
            <MaterialIcons name="arrow-forward" size={16} color={colors.onPrimary} />
          </View>
        ) : null}
      </View>
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 152,
    backgroundColor: colors.surface,
    borderRadius: radius.bento,
    borderWidth: 1,
    borderColor: colors.outline,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  badge: {
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainer,
    paddingVertical: spacing.xs / 2,
    paddingHorizontal: spacing.sm,
  },
  badgeText: { ...type.caption, color: colors.textMuted },
  title: { ...type.bodyLgStrong, color: colors.text, marginTop: spacing.sm },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  value: { ...type.title, color: colors.primary },
  arrow: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
