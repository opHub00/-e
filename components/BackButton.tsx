import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import { colors, radius, size } from '../design/tokens';
import { MotionPressable } from './motion/MotionPressable';

type Props = {
  onPress: () => void;
  accessibilityLabel?: string;
  style?: ViewStyle;
};

/**
 * 모든 화면이 공유하는 뒤로가기.
 * 시각 크기는 size.iconButton 이고, hitSlop 으로 실제 터치 영역을 size.touch 까지 넓힌다.
 */
export function BackButton({ onPress, accessibilityLabel = '뒤로 가기', style }: Props) {
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={(size.touch - size.iconButton) / 2}
      style={[styles.button, style]}
    >
      <MaterialIcons name="arrow-back" size={20} color={colors.text} />
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: size.iconButton,
    height: size.iconButton,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainer,
  },
});
