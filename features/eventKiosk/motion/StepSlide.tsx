import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated } from 'react-native';
import { useNative } from '../../../design/motion';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { eventMotion } from './eventMotion';
import { stepDirection } from './stepDirection';
import { useFocusReplay } from './useFocusReplay';

/**
 * 입력 단계 사이 이동. 다음 단계는 오른쪽에서, 이전 단계는 왼쪽에서 짧게 들어온다.
 * 이동 거리는 stack 토큰만큼이라 화면이 날아다니지 않는다. 첫 단계는 화면 진입 motion 만 쓴다.
 */
export function StepSlide({ index, children }: { index: number; children: ReactNode }) {
  const reduced = useReducedMotion();
  const replay = useFocusReplay();
  const progress = useRef(new Animated.Value(1)).current;
  const [direction, setDirection] = useState<1 | -1 | 0>(0);

  useEffect(() => {
    const next = stepDirection(index);
    setDirection(next);
    if (reduced || next === 0) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: eventMotion.step.duration,
      easing: eventMotion.step.easing,
      useNativeDriver: useNative,
    });
    animation.start();
    return () => animation.stop();
  }, [index, progress, reduced, replay]);

  const style = reduced || direction === 0
    ? null
    : {
        transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [direction * eventMotion.step.distance, 0] }) }],
      };
  return <Animated.View style={style} testID="kiosk-step-slide">{children}</Animated.View>;
}
