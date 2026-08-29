import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { MotionPressable } from '../components/motion/MotionPressable';
import type { DimensionValue, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BrandMark } from '../components/BrandMark';
import { colors, radius, spacing, tint, type } from '../design/tokens';
import { duration, easing, travel } from '../design/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useUserStore } from '../store/useUserStore';

const PAGES = [
  {
    key: 'now',
    title: '청약, 지금부터 준비하면 돼요',
    body: '어렵게 점수부터 계산하지 않아도 괜찮아요.\n지금 내 준비 상태부터 확인해요.',
  },
  {
    key: 'future',
    title: '앞으로 어떻게 달라질지도 보여드려요',
    body: '통장, 기간, 준비 행동이 쌓이면\n미래의 준비 과정을 미리 볼 수 있어요.',
  },
  {
    key: 'discover',
    title: '공고와 변화도 나에게 맞게',
    body: '실제 청약 공고와 주거 뉴스를 확인하고\n왜 나와 관련 있는지 쉽게 이해해요.',
  },
] as const;

export default function IntroRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const completeIntro = useUserStore((s) => s.completeIntro);
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const { width: windowWidth } = useWindowDimensions();
  /**
   * RN Web 정적 export 에서는 useWindowDimensions / onLayout 이 0 을 준다.
   * web 은 viewport 단위로 폭을 고정하고, scroll 위치 계산에만 실제 px 을 쓴다.
   */
  // '100vw' 는 RN Web 전용 값이라 RN 타입에는 없다.
  const pageWidth = (Platform.OS === 'web' ? '100vw' : windowWidth) as DimensionValue;
  const stepWidth = () =>
    windowWidth || (Platform.OS === 'web' && typeof window !== 'undefined' ? window.innerWidth : 0);

  const finish = useCallback(async () => {
    await completeIntro();
    router.replace({ pathname: '/', params: { step: 'basic' } });
  }, [completeIntro, router]);

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(PAGES.length - 1, next));
    setPage(clamped);
    scrollRef.current?.scrollTo({ x: clamped * stepWidth(), animated: true });
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / Math.max(1, stepWidth()));
    if (next !== page) setPage(next);
  };

  const last = page === PAGES.length - 1;

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
        <BrandMark size={26} />
        <Text style={styles.wordmark}>완판e</Text>
        <View style={styles.spacer} />
        <MotionPressable
          accessibilityRole="button"
          onPress={finish}
          style={styles.skip}
        >
          <Text style={styles.skipText}>건너뛰기</Text>
        </MotionPressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        onScrollEndDrag={onScroll}
        scrollEventThrottle={32}
        style={styles.pager}
        contentContainerStyle={styles.pagerContent}
      >
        {PAGES.map((item, index) => (
          <View key={item.key} style={[styles.page, { width: pageWidth }]}>
            <View style={styles.stage}>
              {item.key === 'now' ? <GaugeScene active={page === index} /> : null}
              {item.key === 'future' ? <TimelineScene active={page === index} /> : null}
              {item.key === 'discover' ? <DiscoverScene active={page === index} /> : null}
            </View>
            <View style={styles.copy}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.body}>{item.body}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 10 }]}>
        <View style={styles.dots} accessibilityRole="tablist">
          {PAGES.map((item, index) => (
            <MotionPressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityLabel={`${index + 1}번째 소개`}
              accessibilityState={{ selected: page === index }}
              onPress={() => goTo(index)}
              hitSlop={8}
              style={[styles.dot, page === index && styles.dotActive]}
            />
          ))}
        </View>

        <MotionPressable
          accessibilityRole="button"
          onPress={() => (last ? finish() : goTo(page + 1))}
          style={[
            styles.cta,
            !last && styles.ctaQuiet,
          ]}
        >
          <Text style={[styles.ctaText, !last && styles.ctaTextQuiet]}>
            {last ? '완판e 시작하기' : '다음'}
          </Text>
          <MaterialIcons
            name="arrow-forward"
            size={18}
            color={last ? colors.onPrimary : colors.primary}
          />
        </MotionPressable>
      </View>
    </View>
  );
}

/** 공통: active 가 되면 한 번만 재생하고 반복하지 않는다. */
function useScene(active: boolean, reduced: boolean) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    if (reduced) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: duration.major,
      easing: easing.enter,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [active, progress, reduced]);
  return progress;
}

/* ── Intro 1: 준비도 게이지 ── */
const GAUGE_STOPS = [0, 32, 55, 72];

function GaugeScene({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  const progress = useScene(active, reduced);
  const [score, setScore] = useState(reduced ? 72 : 0);

  useEffect(() => {
    if (reduced) {
      setScore(72);
      return;
    }
    const id = progress.addListener(({ value }) => setScore(Math.round(value * 72)));
    return () => progress.removeListener(id);
  }, [progress, reduced]);

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '72%'] });

  return (
    <View style={styles.gaugeCard}>
      <Text style={styles.sceneLabel}>예시 화면</Text>
      <View style={styles.gaugeValueRow}>
        <Text style={styles.gaugeValue}>{score}</Text>
        <Text style={styles.gaugeUnit}>점</Text>
      </View>
      <View style={styles.gaugeTrack}>
        <Animated.View style={[styles.gaugeFill, { width }]} />
      </View>
      <View style={styles.gaugeStops}>
        {GAUGE_STOPS.map((stop) => (
          <Text key={stop} style={[styles.gaugeStop, score >= stop && styles.gaugeStopOn]}>
            {stop}
          </Text>
        ))}
      </View>
    </View>
  );
}

/* ── Intro 2: 미래 타임라인 ── */
const NODES = ['지금', '1년', '2년', '5년'];

function TimelineScene({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  const progress = useScene(active, reduced);
  const lineWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={styles.timelineCard}>
      <Text style={styles.sceneLabel}>예시 화면</Text>
      <View style={styles.timelineRail}>
        <View style={styles.timelineTrack}>
          <Animated.View style={[styles.timelineFill, { width: lineWidth }]} />
        </View>
        <View style={styles.timelineNodes}>
          {NODES.map((node, index) => {
            const start = index / NODES.length;
            const opacity = progress.interpolate({
              inputRange: [start, Math.min(1, start + 0.2)],
              outputRange: [0.15, 1],
              extrapolate: 'clamp',
            });
            const scale = progress.interpolate({
              inputRange: [start, Math.min(1, start + 0.2)],
              outputRange: [0.7, 1],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View key={node} style={[styles.timelineNode, { opacity }]}>
                <Animated.View style={[styles.timelineDot, { transform: [{ scale }] }]} />
                <Text style={styles.timelineLabel}>{node}</Text>
              </Animated.View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/* ── Intro 3: 공고 + 브리핑 ── */
function DiscoverScene({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  const progress = useScene(active, reduced);

  const step = (from: number, to: number) =>
    progress.interpolate({ inputRange: [from, to], outputRange: [0, 1], extrapolate: 'clamp' });

  const pins = [step(0, 0.22), step(0.12, 0.34), step(0.24, 0.46)];
  const card = step(0.42, 0.68);
  const brief = step(0.68, 1);

  return (
    <View style={styles.discoverCard}>
      <Text style={styles.sceneLabel}>예시 화면</Text>

      <View style={styles.miniMap}>
        {pins.map((pin, index) => (
          <Animated.View
            key={index}
            style={[
              styles.pin,
              index === 0 && styles.pinA,
              index === 1 && styles.pinB,
              index === 2 && styles.pinC,
              index === 2 && styles.pinSelected,
              { opacity: pin, transform: [{ scale: pin }] },
            ]}
          >
            <MaterialIcons
              name="place"
              size={13}
              color={index === 2 ? colors.onPrimary : colors.primary}
            />
          </Animated.View>
        ))}
      </View>

      <Animated.View
        style={[
          styles.listingRow,
          {
            opacity: card,
            transform: [
              { translateY: card.interpolate({ inputRange: [0, 1], outputRange: [travel.md, 0] }) },
            ],
          },
        ]}
      >
        <View style={styles.listingChip}>
          <Text style={styles.listingChipText}>모집중</Text>
        </View>
        <View style={styles.listingBarWide} />
        <View style={styles.listingBarNarrow} />
      </Animated.View>

      <Animated.View
        style={[
          styles.briefRow,
          {
            opacity: brief,
            transform: [
              { translateY: brief.interpolate({ inputRange: [0, 1], outputRange: [travel.md, 0] }) },
            ],
          },
        ]}
      >
        <MaterialIcons name="auto-awesome" size={14} color={colors.primary} />
        <Text style={styles.briefText}>왜 나와 관련 있을까요?</Text>
      </Animated.View>
    </View>
  );
}

const SIDE = spacing.screen;

const styles = StyleSheet.create({
  screen: { flex: 1, height: '100%', backgroundColor: colors.surface },
  spacer: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SIDE,
    paddingBottom: 8,
  },
  wordmark: { ...type.bodyLgStrong, color: colors.primary, letterSpacing: -0.3 },
  skip: { paddingVertical: 6, paddingHorizontal: 6 },
  skipText: { ...type.label, color: colors.textSubtle },

  pager: { flex: 1 },
  pagerContent: { alignItems: 'stretch', flexGrow: 1 },
  page: { flexShrink: 0, paddingHorizontal: SIDE, justifyContent: 'center' },
  stage: { height: 320, justifyContent: 'flex-end' },
  copy: { gap: 10, marginTop: 34 },
  title: {
    ...type.page,
    fontSize: 25,
    lineHeight: 34,
    color: colors.text,
    letterSpacing: -0.6,
    ...({ wordBreak: 'keep-all' } as object),
  },
  body: { ...type.bodySm, color: colors.textMuted, lineHeight: 23 },

  sceneLabel: { ...type.micro, color: colors.textSubtle },

  /* Intro 1 */
  gaugeCard: {
    borderRadius: radius.card,
    backgroundColor: colors.surfaceLow,
    padding: 20,
    gap: 4,
  },
  gaugeValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 8 },
  gaugeValue: {
    fontFamily: type.metric.fontFamily,
    fontSize: 56,
    lineHeight: 62,
    color: colors.primary,
    letterSpacing: -2.4,
  },
  gaugeUnit: { ...type.title, color: colors.textSubtle },
  gaugeTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surfaceHigh,
    overflow: 'hidden',
    marginTop: 14,
  },
  gaugeFill: { height: '100%', borderRadius: 5, backgroundColor: colors.primary },
  gaugeStops: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  gaugeStop: { ...type.micro, color: colors.outline },
  gaugeStopOn: { color: colors.primary },

  /* Intro 2 */
  timelineCard: {
    borderRadius: radius.card,
    backgroundColor: colors.surfaceLow,
    padding: 20,
    gap: 4,
  },
  timelineRail: { marginTop: 26, height: 60, justifyContent: 'flex-start' },
  timelineTrack: {
    position: 'absolute',
    left: 23,
    right: 23,
    top: 7,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.surfaceHigh,
  },
  timelineFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  timelineNodes: { flexDirection: 'row', justifyContent: 'space-between' },
  timelineNode: { alignItems: 'center', width: 46 },
  timelineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 4,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  timelineLabel: { ...type.micro, color: colors.textMuted, marginTop: 9 },

  /* Intro 3 */
  discoverCard: {
    borderRadius: radius.card,
    backgroundColor: colors.surfaceLow,
    padding: 20,
    gap: 4,
  },
  miniMap: {
    height: 128,
    borderRadius: radius.cardSm,
    backgroundColor: colors.lavender,
    marginTop: 10,
  },
  pin: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primaryFixed,
  },
  pinA: { left: 34, top: 28 },
  pinB: { right: 44, top: 20 },
  pinC: { left: 128, top: 72 },
  pinSelected: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    borderColor: colors.onPrimary,
    borderWidth: 2,
  },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.cardSm,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 12,
  },
  listingChip: {
    height: 20,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: tint.green.bg,
    paddingHorizontal: 8,
  },
  listingChipText: { ...type.micro, color: tint.green.fg },
  listingBarWide: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh },
  listingBarNarrow: { width: 34, height: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh },
  briefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.cardSm,
    borderWidth: 1,
    borderColor: colors.primaryFixed,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginTop: 8,
  },
  briefText: { ...type.caption, color: colors.primary },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: SIDE,
    paddingTop: 12,
  },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.surfaceHighest },
  dotActive: { width: 20, backgroundColor: colors.primary },
  cta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  ctaQuiet: { backgroundColor: colors.lavender },
  ctaText: { ...type.bodyLgStrong, color: colors.onPrimary, letterSpacing: -0.3 },
  ctaTextQuiet: { color: colors.primary },
});
