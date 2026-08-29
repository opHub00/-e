import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { duration, easing, scale, useNative } from '../../design/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

type Props = {
  children: React.ReactNode;
  /** 켜지는 순간에만 반응한다. 끌 때는 조용히 돌아간다. */
  active: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * 저장/북마크처럼 "켜졌다"가 중요한 선택에만 쓴다.
 * 색만 바뀌고 끝나지 않도록 짧게 눌렸다 펴진다. bounce 는 쓰지 않는다.
 */
export function Pop({ children, active, style }: Props) {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(1)).current;
  const previous = useRef(active);

  useEffect(() => {
    const turnedOn = active && !previous.current;
    previous.current = active;
    if (!turnedOn || reduced) return;

    value.setValue(scale.selection);
    const animation = Animated.timing(value, {
      toValue: 1,
      duration: duration.content,
      easing: easing.enter,
      useNativeDriver: useNative,
    });
    animation.start();
    return () => animation.stop();
  }, [active, reduced, value]);

  return (
    <Animated.View style={[style, reduced ? null : { transform: [{ scale: value }] }]}>
      {children}
    </Animated.View>
  );
}
