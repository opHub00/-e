import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, radius, size, spacing, type } from '../design/tokens';
import { MotionPressable } from './motion/MotionPressable';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'soft';
  disabled?: boolean;
  /** 진행 중. 라벨 자리를 그대로 두고 그 위에 표시해 폭이 흔들리지 않는다. */
  loading?: boolean;
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
};

export function PrimaryButton({ label, onPress, variant = 'primary', disabled, loading, icon }: Props) {
  const soft = variant === 'soft';
  const blocked = disabled || loading;
  const fg = soft ? colors.primary : colors.onPrimary;

  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!blocked, busy: !!loading }}
      aria-busy={!!loading}
      accessibilityLabel={loading ? `${label} 진행 중` : undefined}
      disabled={blocked}
      onPress={onPress}
      style={[
        styles.button,
        soft && styles.soft,
        disabled && !loading && styles.disabled,
      ]}
    >
      {/*
        진행 중에도 라벨을 지우지 않는다.
        지우면 버튼이 스피너 폭으로 줄었다가 되돌아오며 레이아웃이 튄다.
        투명하게 두어 폭을 유지하고 스피너를 그 위에 겹친다.
      */}
      <View style={[styles.content, loading && styles.contentHidden]}>
        {icon ? <MaterialIcons name={icon} size={20} color={fg} /> : null}
        <Text style={[styles.label, soft && styles.softLabel]}>{label}</Text>
      </View>
      {loading ? (
        <View style={styles.spinner} pointerEvents="none">
          <ActivityIndicator color={fg} />
        </View>
      ) : null}
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
    paddingHorizontal: spacing.lg,
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  /** 폭은 유지하고 보이지만 않게 한다. */
  contentHidden: { opacity: 0 },
  spinner: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  soft: { backgroundColor: colors.lavender },
  disabled: { opacity: 0.4 },
  label: { ...type.bodyLgStrong, color: colors.onPrimary, textAlign: 'center' },
  softLabel: { color: colors.primary },
});
