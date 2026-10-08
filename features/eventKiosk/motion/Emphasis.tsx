import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { eventMotion } from './eventMotion';

/**
 * 완료를 알리는 한 번의 강조. 테두리 바깥 옅은 테가 한 번 짙어졌다가 은은하게 남는다.
 * 크기를 키우거나 흔들지 않는다. reduced motion 이면 남는 상태만 바로 보여 준다.
 */
const REST = 0.35;

export function Emphasis({ children, color, radius, style, testID }: {
  children: ReactNode;
  color: string;
  radius: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const glow = useRef(new Animated.Value(REST)).current;

  useEffect(() => {
    if (reduced) {
      glow.setValue(REST);
      return;
    }
    glow.setValue(0);
    const half = eventMotion.emphasis.duration / 2;
    const animation = Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: half, easing: eventMotion.emphasis.easing, useNativeDriver: false }),
      Animated.timing(glow, { toValue: REST, duration: half, easing: eventMotion.emphasis.easing, useNativeDriver: false }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [glow, reduced]);

  return (
    <View style={style} testID={testID}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.ring, { borderRadius: radius + RING, borderColor: color, opacity: glow }]}
      />
      {children}
    </View>
  );
}

const RING = 4;
const styles = StyleSheet.create({
  ring: { top: -RING, left: -RING, right: -RING, bottom: -RING, borderWidth: RING },
});
