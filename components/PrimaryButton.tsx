import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text } from 'react-native';
import { colors, radius, size, spacing, type } from '../design/tokens';
import { MotionPressable } from './motion/MotionPressable';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'soft';
  disabled?: boolean;
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
};

export function PrimaryButton({ label, onPress, variant = 'primary', disabled, icon }: Props) {
  const soft = variant === 'soft';
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        soft && styles.soft,
        disabled && styles.disabled,
      ]}
    >
      {icon ? (
        <MaterialIcons name={icon} size={20} color={soft ? colors.primary : colors.onPrimary} />
      ) : null}
      <Text style={[styles.label, soft && styles.softLabel]}>{label}</Text>
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: size.control,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  soft: { backgroundColor: colors.lavender },
  disabled: { opacity: 0.4 },
  label: { ...type.bodyLgStrong, color: colors.onPrimary, textAlign: 'center' },
  softLabel: { color: colors.primary },
});
