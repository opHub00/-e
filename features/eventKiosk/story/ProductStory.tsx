import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Animated, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { duration, easing, useNative } from '../../../design/motion';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { kioskEvent } from '../kioskEvent';
import { KioskButton } from '../ui/controls';
import { BrandMark } from '../brand/BrandMark';
import { PartnerBadge } from '../brand/PartnerBadge';
import { k } from '../ui/theme';
import { storyDataFrom, type StoryData } from './storyData';
import { useKioskWidth } from '../ui/useKioskWidth';
import { isLastScene, nextSceneIndex, STORY_SCENES, type StorySceneId } from './storyScript';
import { SceneCheck, SceneCompare, SceneConditions, SceneResult, SceneSupplies, STAGE } from './StoryScenes';

const SCENE_VIEWS: Record<StorySceneId, ComponentType<{ p: Animated.Value; data: StoryData }>> = {
  supplies: SceneSupplies,
  conditions: SceneConditions,
  check: SceneCheck,
  compare: SceneCompare,
  result: SceneResult,
};

/** 무대를 화면에 맞추는 최대 배율. 데스크톱에서 그림만 거대해지지 않게. */
const MAX_STAGE_SCALE = 1.5;

/**
 * 첫 paint 전에 실행되는 effect. 서버(정적 HTML)에서는 layout effect 가 없으니 그때는 아무것도 하지 않는다
 * (서버 HTML 은 아래 0% 초기값 그대로 그려진다).
 */
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Product Story. 서비스를 '이해시키는' 서사 계층이다(실제 사용 중 상태 피드백인 UI Motion 과 별개).
 *
 * - 장면은 자동으로 넘어가고 마지막 장면에서 멈춰 CTA 를 기다린다.
 * - 언제든 건너뛰기 / 바로 시작하기, 위 진행 막대를 눌러 원하는 장면으로 이동, 끝에서 다시 보기.
 * - reduced motion: 장면 안 움직임 없이 완성된 그림을 바로 보여 주고, 장면 전환도 즉시. 자동 진행은 유지하되 막대로 이동할 수 있다.
 */
export function ProductStory({ onStart, onSkip, testID = 'product-story' }: {
  onStart: () => void;
  onSkip: () => void;
  testID?: string;
}) {
  const load = kioskEvent();
  const data = useMemo(() => (load.ok ? storyDataFrom(load.event) : null), [load]);
  const width = useKioskWidth();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [round, setRound] = useState(0);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const scene = STORY_SCENES[index];
  // 모든 값은 애니메이션 0% 로 만든다. 정적 HTML·hydration·첫 render 가 모두 이 값으로 그려진다.
  const progress = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;
  const scale = stage.width && stage.height ? Math.min(stage.width / STAGE.width, stage.height / STAGE.height, MAX_STAGE_SCALE) : 0;
  // 무대 크기를 재기 전에는 재생을 시작하지 않는다. 시작했다면 무대가 처음 보일 때 이미 중간 프레임이다.
  const ready = scale > 0;

  // 장면 하나: 그림이 완성되는 동안 progress 0→1, 막대는 holdMs 동안 채워지고 다음 장면으로.
  // paint 전에 값을 되돌리고 시작한다. 그래서 장면이 바뀌거나 다시 볼 때도 이전 장면의 마지막 값(1)으로 한 번 그려지지 않는다.
  useBeforePaint(() => {
    progress.setValue(reduced ? 1 : 0);
    fade.setValue(reduced ? 1 : 0);
    bar.setValue(0);
    if (!ready) return undefined;
    const animations: Animated.CompositeAnimation[] = [];
    if (!reduced) {
      animations.push(Animated.timing(fade, { toValue: 1, duration: duration.screen, easing: easing.enter, useNativeDriver: useNative }));
      animations.push(Animated.timing(progress, { toValue: 1, duration: scene.buildMs, easing: easing.standard, useNativeDriver: false }));
    }
    if (scene.holdMs > 0) {
      animations.push(Animated.timing(bar, { toValue: 1, duration: scene.holdMs, easing: Easing_linear, useNativeDriver: false }));
    } else {
      bar.setValue(1);
    }
    animations.forEach(animation => animation.start());
    const next = nextSceneIndex(index);
    const timer = scene.holdMs > 0 && next !== null ? setTimeout(() => setIndex(next), scene.holdMs) : null;
    return () => {
      animations.forEach(animation => animation.stop());
      if (timer) clearTimeout(timer);
    };
  }, [bar, fade, index, progress, ready, reduced, round, scene.buildMs, scene.holdMs]);

  if (!data) return null;
  const SceneView = SCENE_VIEWS[scene.id];
  const onStageLayout = (event: LayoutChangeEvent) => setStage({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height });
  const last = isLastScene(index);
  const replay = () => {
    setIndex(0);
    setRound(value => value + 1);
  };

  return (
    <View style={styles.root} testID={testID} accessibilityViewIsModal>
      <View style={styles.top}>
        <BrandMark size="hero" label={load.ok ? load.event.config.copy.brand : undefined} compact={width < 600} />
        <View style={styles.topRight}>
          <PartnerBadge compact />
          <MotionPressable accessibilityRole="button" accessibilityLabel="소개 건너뛰기" onPress={onSkip} style={styles.skip} testID="story-skip">
            <Text style={styles.skipText}>건너뛰기</Text>
            <MaterialIcons name="close" size={22} color={k.colors.textMuted} />
          </MotionPressable>
        </View>
      </View>

      <View style={styles.progress} accessibilityRole="progressbar" accessibilityLabel={`${STORY_SCENES.length}장면 중 ${index + 1}번째`}>
        {STORY_SCENES.map((item, position) => (
          <MotionPressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`${position + 1}번째 장면 보기`}
            onPress={() => { setIndex(position); setRound(value => value + 1); }}
            style={styles.segmentHit}
            testID={`story-segment-${position}`}
          >
            <View style={styles.segment}>
              {position < index ? <View style={[styles.segmentFill, { width: '100%' }]} /> : null}
              {position === index ? (
                <Animated.View style={[styles.segmentFill, { width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
              ) : null}
            </View>
          </MotionPressable>
        ))}
      </View>

      <Animated.View style={[styles.messageBox, { opacity: fade }]} accessibilityLiveRegion="polite">
        <Text style={[styles.message, width < 600 && styles.messageNarrow]} accessibilityRole="header" testID="story-message">{scene.message(data.region)}</Text>
      </Animated.View>

      <View style={styles.stageArea} onLayout={onStageLayout} accessibilityLabel={scene.description(data.region)} testID={`story-scene-${scene.id}`}>
        {scale ? (
          <Animated.View style={{ width: STAGE.width * scale, height: STAGE.height * scale, opacity: fade }}>
            <View style={{ width: STAGE.width, height: STAGE.height, transform: [{ translateX: (STAGE.width * scale - STAGE.width) / 2 }, { translateY: (STAGE.height * scale - STAGE.height) / 2 }, { scale }] }}>
              <SceneView key={`${scene.id}-${round}`} p={progress} data={data} />
            </View>
          </Animated.View>
        ) : null}
      </View>

      <View style={styles.footer}>
        {last ? (
          <>
            <MotionPressable accessibilityRole="button" accessibilityLabel="소개 처음부터 다시 보기" onPress={replay} style={styles.replay} testID="story-replay">
              <MaterialIcons name="replay" size={22} color={k.colors.primary} />
              <Text style={styles.replayText}>다시 보기</Text>
            </MotionPressable>
            <View style={styles.footerCta}>
              <KioskButton testID="story-start" label="내 신청유형 분석하기" icon="arrow-forward" onPress={onStart} large grow />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.footerHint}>{index + 1} / {STORY_SCENES.length}</Text>
            <KioskButton testID="story-start-now" label="바로 시작하기" variant="soft" icon="arrow-forward" onPress={onStart} />
          </>
        )}
      </View>
    </View>
  );
}

/** 진행 막대는 시간 그대로 채운다(곡선 없이). */
const Easing_linear = (value: number) => value;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: k.colors.background, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, gap: 14 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  skip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, minWidth: 48, paddingHorizontal: 14, borderRadius: 12 },
  skipText: { ...k.type.bodyStrong, color: k.colors.textMuted },
  progress: { flexDirection: 'row', gap: 6, width: '100%', maxWidth: 980, alignSelf: 'center' },
  segmentHit: { flex: 1, height: 44, justifyContent: 'center' },
  segment: { height: 4, borderRadius: 2, backgroundColor: k.colors.surfaceHighest, overflow: 'hidden' },
  segmentFill: { height: 4, borderRadius: 2, backgroundColor: k.colors.primary },
  messageBox: { width: '100%', maxWidth: 980, alignSelf: 'center', minHeight: 88, justifyContent: 'center' },
  // 한국어 문장이 단어 중간에서 끊기지 않게(웹: word-break keep-all).
  message: { ...k.type.hero, color: k.colors.text, wordBreak: 'keep-all' } as object,
  messageNarrow: { fontSize: 28, lineHeight: 39 },
  stageArea: { flex: 1, minHeight: 200, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', maxWidth: 980, alignSelf: 'center', flexWrap: 'wrap' },
  footerHint: { ...k.type.bodyStrong, color: k.colors.textSubtle },
  footerCta: { flex: 1, minWidth: 240, flexDirection: 'row' },
  replay: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 56, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: k.colors.outline },
  replayText: { ...k.type.bodyStrong, color: k.colors.primary },
});
