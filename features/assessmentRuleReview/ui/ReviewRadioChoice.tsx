import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';

type Props = {
  children: ReactNode;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Radio-like review choices share one accessibility contract.
 *
 * React Native consumes `accessibilityState`; react-native-web also receives the
 * explicit ARIA attribute so browser automation and assistive technology can observe
 * both the initial state and every selection change.
 */
export function ReviewRadioChoice({ children, selected, disabled, onPress, style }: Props) {
  return (
    <MotionPressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      aria-checked={selected}
      disabled={disabled}
      onPress={onPress}
      style={style}
    >
      {children}
    </MotionPressable>
  );
}
