import { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { duration, easing } from '../design/motion';
import { useReducedMotion } from './useReducedMotion';

type Options = {
  /** 애니메이션 길이. 기본은 major. */
  durationMs?: number;
  delay?: number;
};

/**
 * 0 → target 카운트업.
 * 같은 target 으로 다시 마운트돼도 재생하지 않는다(탭을 오갈 때마다 0부터 다시 세지 않도록).
 * 값이 의미 있게 바뀌면 이전 값에서 새 값으로만 이어간다.
 */
export function useCountUp(target: number, options: Options = {}) {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(target)).current;
  // 첫 렌더에서 target 을 그렸다가 effect 가 0 으로 되돌리면 최종 점수가 한 프레임 번쩍인다.
  const [display, setDisplay] = useState(() => (reduced ? target : 0));
  const played = useRef(false);
  const previous = useRef(target);

  useEffect(() => {
    if (reduced) {
      value.setValue(target);
      setDisplay(target);
      played.current = true;
      previous.current = target;
      return;
    }

    const from = played.current ? previous.current : 0;
    if (played.current && previous.current === target) return;

    value.setValue(from);
    const id = value.addListener(({ value: current }) => setDisplay(Math.round(current)));
    const animation = Animated.timing(value, {
      toValue: target,
      duration: options.durationMs ?? duration.major,
      delay: options.delay ?? 0,
      easing: easing.enter,
      useNativeDriver: false,
    });
    animation.start(() => {
      played.current = true;
      previous.current = target;
    });

    return () => {
      animation.stop();
      value.removeListener(id);
    };
  }, [options.delay, options.durationMs, reduced, target, value]);

  return display;
}
