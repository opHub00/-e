import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { duration, easing } from '../../design/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

type Props = {
  /** 0~1. 트랙 대비 채워질 비율. */
  ratio: number;
  style?: StyleProp<ViewStyle>;
};

/** 값이 바뀔 때 폭만 짧게 움직인다. layout animation 은 쓰지 않는다. */
export function AnimatedBar({ ratio, style }: Props) {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(ratio)).current;

  useEffect(() => {
    if (reduced) {
      value.setValue(ratio);
      return;
    }
    const animation = Animated.timing(value, {
      toValue: ratio,
      duration: duration.content,
      easing: easing.standard,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [ratio, reduced, value]);

  const width = value.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return <Animated.View style={[style, { width }]} />;
}
