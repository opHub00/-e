import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
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
 * 시각 크기는 size.iconButton 이고, 웹에서도 터치 영역이 size.touch 가 되도록 바깥 상자를 44px 로 두고 안쪽 원만 그린다.
 * 바깥 여백을 음수로 돌려 기존 배치는 그대로다.
 */
export function BackButton({ onPress, accessibilityLabel = '뒤로 가기', style }: Props) {
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[styles.hit, style]}
    >
      <View style={styles.button}>
        <MaterialIcons name="arrow-back" size={20} color={colors.text} />
      </View>
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: size.touch,
    height: size.touch,
    margin: -(size.touch - size.iconButton) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    width: size.iconButton,
    height: size.iconButton,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainer,
  },
});
