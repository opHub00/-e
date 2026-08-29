import { useEffect, useRef } from 'react';
import { Animated, Pressable } from 'react-native';
import type { GestureResponderEvent, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { duration, easing, scale, useNative } from '../../design/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * style 은 함수 형태를 받지 않는다.
 * Animated 는 props.style 을 flatten 해서 Animated 값을 찾아 구독하는데,
 * 함수를 넘기면 구독이 걸리지 않아 눌러도 아무 변화가 없다.
 * 눌림 표현은 이 컴포넌트가 담당하므로 호출부에 pressed 분기가 필요 없다.
 */
type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** 특별한 surface에서만 기본값을 낮출 수 있다. */
  pressedScale?: number;
};

/**
 * navigation/onPress 실행을 늦추지 않는 공통 눌림 피드백.
 * reduced motion에서는 scale을 제거하고 짧은 opacity 피드백만 남긴다.
 */
export function MotionPressable({
  disabled,
  onPressIn,
  onPressOut,
  pressedScale = scale.pressed,
  style,
  ...props
}: Props) {
  const reduced = useReducedMotion();
  const pressed = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (disabled) pressed.setValue(0);
  }, [disabled, pressed]);

  const animate = (toValue: 0 | 1) => {
    Animated.timing(pressed, {
      toValue,
      duration: reduced
        ? duration.pressIn
        : toValue === 1
          ? duration.pressIn
          : duration.pressOut,
      easing: toValue === 1 ? easing.standard : easing.enter,
      useNativeDriver: useNative,
    }).start();
  };

  const handlePressIn = (event: GestureResponderEvent) => {
    if (!disabled) animate(1);
    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    animate(0);
    onPressOut?.(event);
  };

  const feedbackStyle = disabled
    ? undefined
    : {
        opacity: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] }),
        transform: reduced
          ? []
          : [
              {
                scale: pressed.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, pressedScale],
                }),
              },
            ],
      };

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, feedbackStyle]}
    />
  );
}
