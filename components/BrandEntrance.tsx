import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from './BrandMark';
import { duration, easing, stagger, travel, useNative } from '../design/motion';
import { colors, overlay, spacing, tracking, type } from '../design/tokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  brandEntranceElapsedMs,
  chooseBrandEntranceVariant,
  clearBrandEntranceCover,
  getBrandEntranceSession,
  markBrandEntrancePlayed,
  shouldPlayBrandEntrance,
} from '../features/brandEntrance/session';
import type { EntranceVariant } from '../features/brandEntrance/session';

const MARK_SIZE = 64;
/** BrandMark 의 squircle 은 viewBox 32 에 rx 10 이다. sweep 을 같은 모양으로 잘라낸다. */
const MARK_RADIUS = MARK_SIZE * (10 / 32);
/** 빛줄기 폭. 마크를 지나가는 게 보이려면 마크보다 좁아야 한다. */
const SWEEP_WIDTH = MARK_SIZE * 0.5;

/**
 * 계단 간격은 stagger token 의 배수로만 만든다.
 * 길이는 전부 duration token 에서 온다. 여기서 새 시간 값을 만들지 않는다.
 */
const STEP = stagger.short;
const TIMELINE = {
  backdrop: { delay: 0, duration: duration.content },
  mark: { delay: STEP, duration: duration.sheet },
  wordmark: { delay: STEP * 3, duration: duration.content },
  sweep: { delay: STEP * 4, duration: duration.sheet },
  /** 마지막 동작이 멎고 한 박자 뒤 앱이 열린다. */
  hold: duration.major,
  exit: duration.content,
} as const;

const FULL_MS = TIMELINE.hold + TIMELINE.exit;
const SHORT_IN_MS = duration.content;
const SHORT_MS = SHORT_IN_MS + TIMELINE.exit;
/** 등장 동작이 모두 멎는 시점. 남은 hold 는 여기서 계산한다. */
const ENTER_END_MS = TIMELINE.sweep.delay + TIMELINE.sweep.duration;

type Phase = 'idle' | 'playing' | 'done';

/**
 * 앱이 열리는 순간에만 1회 재생하는 브랜드 인트로.
 *
 * 데이터 로딩을 기다리는 splash 가 아니다. 시간만 보고 끝나며
 * ApplyHome·News·AI·Profile 은 각자의 skeleton 을 그대로 쓴다.
 * overlay 는 pointerEvents 를 받지 않고 접근성 트리에서도 빠져 있어
 * 재생 중에도 route 이동과 focus 를 막지 않는다.
 */
export function BrandEntrance() {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  // 정적 export 결과물에는 overlay 가 들어가면 안 된다. client 에서만 켠다.
  const [phase, setPhase] = useState<Phase>('idle');
  const [variant, setVariant] = useState<EntranceVariant>('none');
  /**
   * 문서 표식이 이미 화면을 덮고 있었는지.
   * 덮여 있었다면 배경은 이미 깔려 있으므로 다시 fade in 하지 않는다.
   * 투명한 상태로 시작하면 표식을 걷는 순간 앱이 비쳐 보인다.
   */
  const hadCover = useRef(false);

  const backdrop = useRef(new Animated.Value(0)).current;
  const mark = useRef(new Animated.Value(0)).current;
  const wordmark = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const session = getBrandEntranceSession();
    if (!shouldPlayBrandEntrance(session)) {
      clearBrandEntranceCover();
      setPhase('done');
      return;
    }
    // 재생 사실을 먼저 남긴다. 인트로 도중에 route 를 옮겨도 다시 뜨지 않는다.
    markBrandEntrancePlayed(session);

    /**
     * 문서 표식이 서 있던 시간만큼은 사용자가 이미 기다린 시간이다.
     * 남은 예산이 모자라면 짧은 버전으로, 그것도 모자라면 바로 앱을 연다.
     */
    const elapsedMs = brandEntranceElapsedMs();
    hadCover.current = elapsedMs > 0;
    if (hadCover.current) backdrop.setValue(1);
    const next = chooseBrandEntranceVariant({
      reduced,
      elapsedMs,
      fullMs: FULL_MS,
      shortMs: SHORT_MS,
    });
    if (next === 'none') {
      clearBrandEntranceCover();
      setPhase('done');
      return;
    }
    setVariant(next);
    setPhase('playing');
  }, [backdrop, reduced]);

  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const minimal = variant === 'short';

    const step = (value: Animated.Value, delay: number, durationMs: number) =>
      Animated.timing(value, {
        toValue: 1,
        delay,
        duration: durationMs,
        easing: easing.enter,
        useNativeDriver: useNative,
      });

    /**
     * overlay 가 화면에 그려진 뒤 표식을 걷는다.
     * 표식은 앱 컨테이너 위에 그려지므로 남겨두면 로고까지 가린다.
     * 배경은 이미 불투명하므로 걷어도 앱이 비치지 않는다.
     */
    clearBrandEntranceCover();

    const fadeBackdrop = hadCover.current
      ? []
      : [step(backdrop, TIMELINE.backdrop.delay, minimal ? SHORT_IN_MS : TIMELINE.backdrop.duration)];

    const enter = minimal
      ? [
          ...fadeBackdrop,
          step(mark, 0, SHORT_IN_MS),
          step(wordmark, 0, SHORT_IN_MS),
        ]
      : [
          ...fadeBackdrop,
          step(mark, TIMELINE.mark.delay, TIMELINE.mark.duration),
          step(wordmark, TIMELINE.wordmark.delay, TIMELINE.wordmark.duration),
          Animated.timing(sweep, {
            toValue: 1,
            delay: TIMELINE.sweep.delay,
            duration: TIMELINE.sweep.duration,
            easing: easing.standard,
            useNativeDriver: useNative,
          }),
        ];

    const settle = Animated.sequence([
      Animated.parallel(enter),
      Animated.delay(minimal ? 0 : TIMELINE.hold - ENTER_END_MS),
    ]);
    const leave = Animated.timing(fade, {
      toValue: 0,
      duration: TIMELINE.exit,
      easing: easing.exit,
      useNativeDriver: useNative,
    });

    settle.start(({ finished }) => {
      if (!finished) return;
      leave.start((end) => {
        if (end.finished) setPhase('done');
      });
    });

    /**
     * 탭이 백그라운드로 가면 animation 이 완료 콜백 없이 멈출 수 있다.
     * 그때 overlay 와 표식이 남지 않도록 시간으로도 반드시 걷어낸다.
     */
    const failsafe = setTimeout(() => {
      clearBrandEntranceCover();
      setPhase('done');
    }, (minimal ? SHORT_MS : FULL_MS) + STEP);

    return () => {
      settle.stop();
      leave.stop();
      clearTimeout(failsafe);
    };
  }, [backdrop, fade, mark, phase, sweep, variant, wordmark]);

  const minimal = variant === 'short';

  const markStyle = useMemo(
    () => ({
      opacity: mark,
      transform: minimal
        ? []
        : [{ scale: mark.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
    }),
    [mark, minimal],
  );

  const wordmarkStyle = useMemo(
    () => ({
      opacity: wordmark,
      transform: minimal
        ? []
        : [
            {
              translateY: wordmark.interpolate({
                inputRange: [0, 1],
                outputRange: [travel.sm, 0],
              }),
            },
          ],
    }),
    [minimal, wordmark],
  );

  if (phase !== 'playing') return null;

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.overlay, { opacity: fade }]}
      testID="brand-entrance"
    >
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]} />
      <View style={[styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Animated.View style={[styles.markClip, markStyle]}>
          <BrandMark size={MARK_SIZE} />
          {minimal ? null : (
            <Animated.View
              style={[
                styles.sweep,
                {
                  opacity: sweep.interpolate({
                    inputRange: [0, 0.2, 0.8, 1],
                    outputRange: [0, 1, 1, 0],
                  }),
                  transform: [
                    {
                      translateX: sweep.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-SWEEP_WIDTH, MARK_SIZE],
                      }),
                    },
                  ],
                },
              ]}
            >
              <LinearGradient
                colors={['transparent', overlay.track, 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.sweepFill}
              />
            </Animated.View>
          )}
        </Animated.View>
        <Animated.Text style={[styles.wordmark, wordmarkStyle]}>완판e</Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 10 },
  /** manifest 의 background_color 와 같은 값이라 PWA cold start 에서 색이 끊기지 않는다. */
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  markClip: {
    width: MARK_SIZE,
    height: MARK_SIZE,
    borderRadius: MARK_RADIUS,
    overflow: 'hidden',
  },
  /** absoluteFill 은 left/right 를 함께 고정해 폭 지정과 충돌한다. 세로만 늘린다. */
  sweep: { position: 'absolute', top: 0, bottom: 0, left: 0, width: SWEEP_WIDTH },
  sweepFill: { flex: 1 },
  wordmark: {
    ...type.headline,
    color: colors.primary,
    letterSpacing: tracking.headline,
  },
});
