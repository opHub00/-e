import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { duration, easing, travel, useNative } from '../../design/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

type Props = {
  children: React.ReactNode;
  /** 등장 지연(ms). 한 화면에서 3개 이하로만 쓴다. */
  delay?: number;
  /** 아래에서 올라오는 거리. 0 이면 opacity 만. */
  distance?: number;
  style?: StyleProp<ViewStyle>;
  /** key 가 바뀌면 다시 등장. 시점 전환 crossfade 에 쓴다. */
  replayKey?: string | number;
  /** sheet 등 의미가 다른 surface가 공통 token을 선택할 때만 지정한다. */
  durationMs?: number;
  /**
   * 기본 enter 는 앞쪽에 몰려 있어 짧은 등장에 좋다.
   * 화면 전환처럼 "움직였다"가 보여야 하면 standard 를 쓴다.
   */
  easingFn?: typeof easing.enter;
};

/** opacity + translateY 만 쓰는 공통 등장 래퍼. layout animation 은 쓰지 않는다. */
export function Appear({
  children,
  delay = 0,
  distance = travel.sm,
  style,
  replayKey,
  durationMs = duration.content,
  easingFn = easing.enter,
}: Props) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: reduced ? duration.micro : durationMs,
      delay: reduced ? 0 : delay,
      easing: easingFn,
      useNativeDriver: useNative,
    });
    animation.start();
    return () => animation.stop();
  }, [delay, durationMs, easingFn, progress, reduced, replayKey]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: reduced
            ? []
            : [
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [distance, 0],
                  }),
                },
              ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export const motionStyles = StyleSheet.create({ fill: { flex: 1 } });
