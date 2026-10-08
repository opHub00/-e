import { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { eventMotion } from './eventMotion';
import { useFocusReplay } from './useFocusReplay';

/**
 * 진행 막대의 현재 칸. 화면에 들어올 때 비어 있다가 채워져 '한 단계 나아갔다'가 보인다.
 * 지난 칸은 이미 찬 상태로 두고, 이 칸만 움직인다.
 */
export function ProgressFill({ style }: { style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const replay = useFocusReplay();
  const value = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduced) {
      value.setValue(1);
      return;
    }
    value.setValue(0);
    const animation = Animated.timing(value, {
      toValue: 1,
      duration: eventMotion.progress.duration,
      easing: eventMotion.progress.easing,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [reduced, replay, value]);

  const width = value.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return <Animated.View style={[style, { width }]} testID="kiosk-progress-fill" />;
}
