import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable } from 'react-native';
import type { GestureResponderEvent, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { duration, easing, scale, useNative } from '../../design/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * hover 는 포인터가 있는 환경에서만 의미가 있다.
 * 터치 기기에서 hover 를 전제하면 눌렀다 뗀 뒤 상태가 남는다.
 */
const HOVERABLE = Platform.OS === 'web';

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
  onHoverIn,
  onHoverOut,
  pressedScale = scale.pressed,
  style,
  ...props
}: Props) {
  const reduced = useReducedMotion();
  const pressed = useRef(new Animated.Value(0)).current;
  const hover = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (disabled) {
      pressed.setValue(0);
      hover.setValue(0);
    }
  }, [disabled, hover, pressed]);

  const animate = (toValue: 0 | 1) => {
    Animated.timing(pressed, {
      toValue,
      duration: reduced
        ? duration.pressIn
        : toValue === 1
          ? duration.pressIn
          : duration.pressOut,
      // 양방향 모두 앞쪽에 몰린 곡선을 쓴다. ease-in-out 은 초반이 느려 누른 순간이 늦게 온다.
      easing: easing.enter,
      useNativeDriver: useNative,
    }).start();
  };

  const handlePressIn = (event: GestureResponderEvent) => {
    if (!disabled) animate(1);
    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    if (!disabled) animate(0);
    onPressOut?.(event);
  };

  // 포인터가 있는 환경에서만 의미가 있다. 터치에는 hover 상태가 없다.
  const handleHoverIn: NonNullable<PressableProps['onHoverIn']> = (event) => {
    if (!disabled) hover.setValue(1);
    onHoverIn?.(event);
  };

  const handleHoverOut: NonNullable<PressableProps['onHoverOut']> = (event) => {
    if (!disabled) hover.setValue(0);
    onHoverOut?.(event);
  };

  const feedbackStyle = disabled
    ? undefined
    : {
        // 눌림과 hover 를 곱해서 겹칠 때도 값이 한 번만 적용되게 한다.
        opacity: Animated.multiply(
          pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] }),
          hover.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] }),
        ),
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
      onHoverIn={HOVERABLE ? handleHoverIn : undefined}
      onHoverOut={HOVERABLE ? handleHoverOut : undefined}
      style={[style, feedbackStyle]}
    />
  );
}
