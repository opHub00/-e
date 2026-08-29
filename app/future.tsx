import { useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Appear } from '../components/motion/Appear';
import { AnimatedBar } from '../components/motion/AnimatedBar';
import { MotionPressable } from '../components/motion/MotionPressable';
import { ScreenEnter } from '../components/motion/ScreenEnter';
import { useCountUp } from '../hooks/useCountUp';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { NewsBriefingSection } from '../components/NewsBriefingSection';
import { NewsImpactSheet } from '../components/NewsImpactSheet';
import { duration, travel } from '../design/motion';
import { colors, radius, spacing, tint, type } from '../design/tokens';
import {
  FUTURE_TIMELINE_MONTHS,
  compareFutureScenarios,
  createFutureScenarios,
  getDefaultFutureScenarioInput,
  serializeFutureScenario,
  simulateFutureTimeline,
  type FutureChange,
  type FutureMonthOffset,
  type FutureScenarioId,
  type FutureScenarioInput,
} from '../domain/futureSimulation';
import { useNewsBriefing } from '../features/news/useNewsBriefing';
import type { RankedNews } from '../features/news/useNewsBriefing';
import { useUserStore } from '../store/useUserStore';
import { dismissActiveFocus, focusWebElementOnNextFrame } from '../utils/webFocus';

const CUSTOM_TRIGGER_ID = 'future-custom-trigger';
const CUSTOM_CLOSE_ID = 'future-custom-close';

const won = (value: number) =>
  value >= 10_000
    ? `${Math.round(value / 10_000).toLocaleString('ko-KR')}만원`
    : `${value.toLocaleString('ko-KR')}원`;

/** 시간 간격을 그대로 거리로 옮긴다. 1년→2년 보다 3년→5년 이 더 멀게 보여야 한다. */
const PX_PER_MONTH = 6.6;
const RAIL_START = 26;
const RAIL_END = 26;
const RAIL_WIDTH = RAIL_START + 60 * PX_PER_MONTH + RAIL_END;

const SHORT_LABEL: Record<number, string> = {
  0: '지금',
  6: '6개월',
  12: '1년',
  24: '2년',
  36: '3년',
  60: '5년',
};

const REGION_CHOICES = ['서울특별시', '경기도', '인천광역시'];

function formatAge(age: number) {
  const years = Math.floor(age);
  const months = Math.round((age - years) * 12);
  if (months === 0) return `${years}세`;
  if (months === 12) return `${years + 1}세`;
  return `${years}세 ${months}개월`;
}

function formatChangeValue(kind: FutureChange['kind'], value: string | number | boolean) {
  if (typeof value === 'boolean') {
    if (kind === 'home-ownership') return value ? '무주택' : '주택 보유';
    return value ? '있음' : '없음';
  }
  if (typeof value === 'number') {
    if (kind === 'age') return formatAge(value);
    if (kind === 'account-duration') return `${value}개월`;
    if (kind === 'monthly-payment' || kind === 'estimated-payment') return won(value);
    return String(value);
  }
  return value;
}

export default function FutureRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useUserStore((s) => s.profile);

  const [offsetMonths, setOffsetMonths] = useState<FutureMonthOffset>(24);
  const [scenarioId, setScenarioId] = useState<FutureScenarioId>('baseline');
  const [customOpen, setCustomOpen] = useState(false);
  const [customInput, setCustomInput] = useState<FutureScenarioInput>(() =>
    getDefaultFutureScenarioInput(profile),
  );
  const railRef = useRef<ScrollView>(null);
  const { state: newsState, reload: reloadNews } = useNewsBriefing(profile, 1);
  const [openedNews, setOpenedNews] = useState<RankedNews | null>(null);

  const scenarios = createFutureScenarios(profile, customInput);
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0];
  const simulation = simulateFutureTimeline(profile, scenario);
  const now = simulation.timeline[0];
  const future = simulation.timeline.find((p) => p.offsetMonths === offsetMonths) ?? now;
  const delta = future.preparationScore - now.preparationScore;
  const comparison = compareFutureScenarios(profile, customInput, offsetMonths);
  const baselinePoint = comparison.results.find((result) => result.scenario.id === 'baseline')!.point;
  const customPoint = comparison.results.find((result) => result.scenario.id === 'custom')!.point;
  const customScoreDelta = customPoint.preparationScore - baselinePoint.preparationScore;
  const customFeedbackLines: string[] = [];

  if (offsetMonths === 0) {
    customFeedbackLines.push('6개월 이후 시점을 선택하면 바꾼 조건의 차이를 확인할 수 있어요.');
  } else {
    if (baselinePoint.estimatedPaidAmount !== customPoint.estimatedPaidAmount) {
      customFeedbackLines.push(
        `${customScoreDelta === 0 ? '하지만 ' : ''}예상 납입액은 ${won(
          baselinePoint.estimatedPaidAmount,
        )} → ${won(customPoint.estimatedPaidAmount)}으로 달라져요.`,
      );
    }
    if (baselinePoint.hasSubscriptionAccount !== customPoint.hasSubscriptionAccount) {
      customFeedbackLines.push(
        `청약통장 가정은 ${baselinePoint.hasSubscriptionAccount ? '유지' : '해지'} → ${
          customPoint.hasSubscriptionAccount ? '유지' : '해지'
        }로 달라져요.`,
      );
    }
    if (baselinePoint.region !== customPoint.region) {
      customFeedbackLines.push(`거주지역 가정은 ${baselinePoint.region} → ${customPoint.region}으로 달라져요.`);
    }
    if (baselinePoint.isNoHomeOwner !== customPoint.isNoHomeOwner) {
      customFeedbackLines.push(
        `주택 상태 가정은 ${baselinePoint.isNoHomeOwner ? '무주택' : '주택 보유'} → ${
          customPoint.isNoHomeOwner ? '무주택' : '주택 보유'
        }로 달라져요.`,
      );
    }
    if (customFeedbackLines.length === 0) {
      customFeedbackLines.push('현재 입력은 기본 가정과 같아요. 값을 바꾸면 바로 비교해드려요.');
    }
  }

  const animatedFuture = useCountUp(future.preparationScore, { durationMs: duration.screen });
  const scoreChanges = future.changes.filter((c) => c.affectsPreparationScore);
  const infoChanges = future.changes.filter((c) => !c.affectsPreparationScore);
  const milestone = future.nextMilestone;

  const scoreByOffset = useMemo(
    () => new Map(simulation.timeline.map((p) => [p.offsetMonths, p.preparationScore])),
    [simulation],
  );

  const maxCompare = Math.max(...comparison.results.map((r) => r.point.preparationScore), 100);

  function updateCustom<K extends keyof FutureScenarioInput>(key: K, value: FutureScenarioInput[K]) {
    setCustomInput((current) => ({ ...current, [key]: value }));
    setScenarioId('custom');
  }

  const openCustomSheet = () => {
    dismissActiveFocus();
    setCustomOpen(true);
    focusWebElementOnNextFrame(CUSTOM_CLOSE_ID);
  };

  const closeCustomSheet = () => {
    dismissActiveFocus();
    setCustomOpen(false);
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/preparation');
  };

  const askWhy = () =>
    router.push({
      pathname: '/ai',
      params: {
        q: `${scenario.label} 가정에서 ${future.label} 완판e 준비도가 ${now.preparationScore}점에서 ${future.preparationScore}점으로 표시돼요. 제공된 변화만으로 왜 달라지는지 설명해 주세요.`,
        auto: '1',
        futureScenario: serializeFutureScenario(scenario),
      },
    });

  return (
    <ScreenEnter style={styles.screen}>
      <View style={[styles.head, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <MotionPressable
          accessibilityRole="button"
          accessibilityLabel="뒤로"
          onPress={goBack}
          style={styles.backButton}
        >
          <MaterialIcons name="arrow-back" size={20} color={colors.text} />
        </MotionPressable>
        <Text style={styles.headTitle}>미래 시뮬레이션</Text>
        <View style={styles.spacer} />
        <View style={styles.headChip}>
          <Text style={styles.headChipText}>완판e 준비도</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── 1. 시간 레일 (선 + 노드) ── */}
        <View style={styles.railBlock}>
          <Text style={styles.railHint}>시점을 옮겨 보세요</Text>
          <ScrollView
            ref={railRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ width: RAIL_WIDTH, paddingVertical: 8 }}
          >
            <View style={styles.rail}>
              <View style={styles.railLine} />
              <View
                style={[
                  styles.railLineDone,
                  { width: RAIL_START + offsetMonths * PX_PER_MONTH },
                ]}
              />
              {FUTURE_TIMELINE_MONTHS.map((months) => {
                const left = RAIL_START + months * PX_PER_MONTH;
                const active = months === offsetMonths;
                const passed = months < offsetMonths;
                const score = scoreByOffset.get(months) ?? 0;
                return (
                  <MotionPressable
                    key={months}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${SHORT_LABEL[months]} 시점`}
                    onPress={() => setOffsetMonths(months)}
                    style={[styles.railNode, { left: left - 26 }]}
                  >
                    <View style={styles.railScoreSlot}>
                      <Text style={[styles.railScore, active && styles.railScoreActive]}>
                        {score}
                      </Text>
                    </View>
                    <View style={styles.railDotSlot}>
                      <View
                        style={[
                          styles.railDot,
                          passed && styles.railDotPassed,
                          active && styles.railDotActive,
                        ]}
                      />
                    </View>
                    <View style={styles.railLabelSlot}>
                      <Text style={[styles.railLabel, active && styles.railLabelActive]}>
                        {SHORT_LABEL[months]}
                      </Text>
                    </View>
                  </MotionPressable>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* ── 2. 미래 상태 (full-bleed 밝은 밴드 + 숫자 전이) ── */}
        {/* 시점을 옮길 때 읽혀야 하는 변화는 점수 하나다.
            밴드까지 매번 페이드하면 숫자가 바뀌는 게 안 보이고 화면이 깜빡인다. */}
        <View style={styles.stateBand}>
          <Text style={styles.stateLabel}>
            {offsetMonths === 0 ? '지금의' : `${future.label}의`} {profile.name}님
          </Text>

          <View style={styles.transition}>
            <View style={styles.fromBlock}>
              <Text style={styles.fromValue}>{now.preparationScore}</Text>
              <Text style={styles.fromCaption}>지금</Text>
            </View>
            <MaterialIcons name="arrow-forward" size={18} color={colors.outline} />
            <View style={styles.toBlock}>
              <Text style={styles.toValue}>{animatedFuture}</Text>
              <Text style={styles.toUnit}>점</Text>
            </View>
            {delta !== 0 ? (
              <View style={[styles.deltaChip, delta < 0 && styles.deltaChipDown]}>
                <MaterialIcons
                  name={delta > 0 ? 'arrow-drop-up' : 'arrow-drop-down'}
                  size={17}
                  color={delta > 0 ? colors.success : colors.warning}
                />
                <Text style={[styles.deltaText, delta < 0 && styles.deltaTextDown]}>
                  {delta > 0 ? `+${delta}` : delta}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.stateFoot}>
            <Text style={styles.stageText}>
              {future.stage.emoji} {future.stage.label}
            </Text>
            <Text style={styles.stateMeta}>
              {formatAge(future.age)} ·{' '}
              {future.hasSubscriptionAccount ? `통장 ${future.accountMonths}개월` : '통장 없음'}
            </Text>
          </View>
        </View>

        {/* ── 3. 마일스톤 (좌측 accent 행) ── */}
        <View style={styles.milestone}>
          <View style={styles.milestoneBar} />
          <View style={styles.milestoneCopy}>
            <Text style={styles.milestoneLabel}>다음 변화</Text>
            <Text style={styles.milestoneTitle}>{milestone.title}</Text>
            <Text style={styles.milestoneDetail}>{milestone.detail}</Text>
          </View>
          {typeof milestone.remainingValue === 'number' ? (
            <View style={styles.milestoneValue}>
              <Text style={styles.milestoneValueNum}>{milestone.remainingValue}</Text>
              <Text style={styles.milestoneValueUnit}>개월</Text>
            </View>
          ) : null}
        </View>

        {/* ── 4. 시나리오 비교 (막대) ── */}
        <Section label="가정 비교" note={`${future.label} 기준`} />
        <View style={styles.compare}>
          {comparison.results.map(({ scenario: s, point, deltaFromCurrent }) => {
            const active = s.id === scenarioId;
            return (
              <MotionPressable
                key={s.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setScenarioId(s.id)}
                style={[
                  styles.compareRow,
                  active && styles.compareRowActive,
                ]}
              >
                <View style={styles.compareTop}>
                  <Text style={[styles.compareName, active && styles.compareNameActive]}>
                    {s.label}
                  </Text>
                  <Text style={styles.compareNums}>
                    {now.preparationScore} <Text style={styles.compareArrow}>→</Text>{' '}
                    <Text style={[styles.compareScore, active && styles.compareScoreActive]}>
                      {point.preparationScore}
                    </Text>
                    {deltaFromCurrent !== 0 ? (
                      <Text style={styles.compareDelta}>
                        {' '}
                        {deltaFromCurrent > 0 ? `+${deltaFromCurrent}` : deltaFromCurrent}
                      </Text>
                    ) : null}
                  </Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barBase,
                      { width: `${(now.preparationScore / maxCompare) * 100}%` },
                    ]}
                  />
                  <AnimatedBar
                    ratio={point.preparationScore / maxCompare}
                    style={[styles.barFill, active && styles.barFillActive]}
                  />
                </View>
                <Text style={styles.compareDesc} numberOfLines={1}>
                  {s.description}
                </Text>
              </MotionPressable>
            );
          })}
        </View>

        {/* ── 5. 조건 바꿔보기 (bottom sheet trigger) ── */}
        <MotionPressable
          nativeID={CUSTOM_TRIGGER_ID}
          accessibilityRole="button"
          accessibilityState={{ expanded: customOpen }}
          onPress={openCustomSheet}
          style={styles.tweakToggle}
        >
          <MaterialIcons name="tune" size={17} color={colors.primary} />
          <Text style={styles.tweakToggleText}>조건 바꿔보기</Text>
          <View style={styles.spacer} />
          <MaterialIcons
            name="keyboard-arrow-up"
            size={20}
            color={colors.textSubtle}
          />
        </MotionPressable>

        {scenarioId === 'custom' && !customOpen ? (
          <ScenarioFeedback
            scoreDelta={customScoreDelta}
            lines={customFeedbackLines}
          />
        ) : null}

        {/* ── 6. 무엇이 달라졌나요 (전/후 행) ── */}
        {offsetMonths > 0 ? (
          <>
            <Section label="무엇이 달라지나요" note={`${future.changes.length}가지`} />

            {scoreChanges.length > 0 ? (
              <View style={styles.changeGroup}>
                <Text style={styles.changeGroupLabel}>준비도에 영향을 준 변화</Text>
                {scoreChanges.map((change, index) => (
                  <View
                    key={change.id}
                    style={[styles.changeRow, index > 0 && styles.changeDivider]}
                  >
                    <View style={styles.changeAccent} />
                    <View style={styles.changeCopy}>
                      <Text style={styles.changeTitle}>{change.title}</Text>
                      <View style={styles.changeValues}>
                        <Text style={styles.changeBefore}>
                          {formatChangeValue(change.kind, change.before)}
                        </Text>
                        <MaterialIcons name="arrow-forward" size={13} color={colors.outline} />
                        <Text style={styles.changeAfter}>
                          {formatChangeValue(change.kind, change.after)}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.scoreDelta,
                        change.scoreEffect === 'decrease' && styles.scoreDeltaDown,
                      ]}
                    >
                      <Text
                        style={[
                          styles.scoreDeltaText,
                          change.scoreEffect === 'decrease' && styles.scoreDeltaTextDown,
                        ]}
                      >
                        {change.scoreDelta > 0 ? `+${change.scoreDelta}` : change.scoreDelta}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {infoChanges.length > 0 ? (
              <View style={styles.infoGroup}>
                <Text style={styles.infoGroupLabel}>참고할 변화 · 점수에는 반영되지 않아요</Text>
                {infoChanges.map((change) => (
                  <View key={change.id} style={styles.infoRow}>
                    <Text style={styles.infoTitle}>{change.title}</Text>
                    <Text style={styles.infoValues}>
                      {formatChangeValue(change.kind, change.before)} →{' '}
                      <Text style={styles.infoAfter}>
                        {formatChangeValue(change.kind, change.after)}
                      </Text>
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        {/* ── 7. 최근 변화 (뉴스는 점수에 반영되지 않는다) ── */}
        <Section label="최근 변화도 함께 확인해보세요" />
        <View style={styles.newsNote}>
          <MaterialIcons name="info-outline" size={14} color={colors.textSubtle} />
          <Text style={styles.newsNoteText}>
            이 뉴스는 완판e 준비도 계산에 직접 반영되지 않아요.
          </Text>
        </View>
        <View style={styles.newsBlock}>
          <NewsBriefingSection
            state={newsState}
            onReload={reloadNews}
            onOpen={setOpenedNews}
            variant="compact"
          />
        </View>

        {/* ── 8. AI 설명 CTA ── */}
        <MotionPressable
          accessibilityRole="button"
          onPress={askWhy}
          style={styles.aiCta}
        >
          <View style={styles.aiIcon}>
            <MaterialIcons name="auto-awesome" size={18} color={colors.primary} />
          </View>
          <View style={styles.aiCopy}>
            <Text style={styles.aiTitle}>
              왜 {future.label} {future.preparationScore}점이 되나요?
            </Text>
            <Text style={styles.aiNote}>완판e가 계산한 결과를 AI가 말로 풀어드려요</Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={colors.primary} />
        </MotionPressable>

        <Text style={styles.disclaimer}>{simulation.disclaimer}</Text>
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={customOpen}
        statusBarTranslucent
        onRequestClose={closeCustomSheet}
        onDismiss={() => focusWebElementOnNextFrame(CUSTOM_TRIGGER_ID)}
      >
        <View style={styles.sheetLayer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="조건 설정 닫기"
            onPress={closeCustomSheet}
            style={styles.sheetBackdrop}
          />

          <Appear
            distance={travel.sheet}
            durationMs={duration.sheet}
            style={[styles.customSheet, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}
          >
            <View
              role="dialog"
              accessibilityLabel="미래 조건 바꿔보기"
              accessibilityViewIsModal
              style={styles.customSheetContent}
            >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderCopy}>
                <Text style={styles.sheetEyebrow}>CUSTOM SCENARIO</Text>
                <Text style={styles.sheetTitle}>미래 조건 바꿔보기</Text>
                <Text style={styles.sheetDescription}>공식 자격이 아닌 준비도 변화만 비교해요.</Text>
              </View>
              <MotionPressable
                nativeID={CUSTOM_CLOSE_ID}
                accessibilityRole="button"
                accessibilityLabel="조건 설정 닫기"
                onPress={closeCustomSheet}
                style={styles.sheetClose}
              >
                <MaterialIcons name="close" size={20} color={colors.text} />
              </MotionPressable>
            </View>

            <ScrollView contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator={false}>
              <View style={styles.tweakRow}>
                <Text style={styles.tweakLabel}>미래 월 납입액</Text>
                <View style={styles.stepper}>
                  <MotionPressable
                    accessibilityRole="button"
                    accessibilityLabel="납입액 줄이기"
                    onPress={() =>
                      updateCustom(
                        'futureMonthlyPayment',
                        Math.max(0, customInput.futureMonthlyPayment - 50_000),
                      )
                    }
                    style={styles.stepperButton}
                  >
                    <MaterialIcons name="remove" size={18} color={colors.primary} />
                  </MotionPressable>
                  <Text style={styles.stepperValue}>{won(customInput.futureMonthlyPayment)}</Text>
                  <MotionPressable
                    accessibilityRole="button"
                    accessibilityLabel="납입액 늘리기"
                    onPress={() =>
                      updateCustom(
                        'futureMonthlyPayment',
                        customInput.futureMonthlyPayment + 50_000,
                      )
                    }
                    style={styles.stepperButton}
                  >
                    <MaterialIcons name="add" size={18} color={colors.primary} />
                  </MotionPressable>
                </View>
              </View>

              <View style={styles.tweakRow}>
                <Text style={styles.tweakLabel}>청약통장</Text>
                <Segmented
                  options={[
                    { key: 'keep', label: '유지' },
                    { key: 'stop', label: '해지' },
                  ]}
                  value={customInput.keepSubscriptionAccount ? 'keep' : 'stop'}
                  onChange={(key) => updateCustom('keepSubscriptionAccount', key === 'keep')}
                />
              </View>

              <View style={styles.tweakRow}>
                <Text style={styles.tweakLabel}>주택 상태</Text>
                <Segmented
                  options={[
                    { key: 'none', label: '무주택' },
                    { key: 'own', label: '보유' },
                  ]}
                  value={customInput.futureIsNoHomeOwner ? 'none' : 'own'}
                  onChange={(key) => updateCustom('futureIsNoHomeOwner', key === 'none')}
                />
              </View>

              <View style={styles.tweakColumn}>
                <Text style={styles.tweakLabel}>거주 지역</Text>
                <View style={styles.regionRow}>
                  {REGION_CHOICES.map((region) => {
                    const active = customInput.futureRegion === region;
                    return (
                      <MotionPressable
                        key={region}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => updateCustom('futureRegion', region)}
                        style={[styles.regionChip, active && styles.regionChipActive]}
                      >
                        <Text style={[styles.regionText, active && styles.regionTextActive]}>
                          {region.replace('특별시', '').replace('광역시', '').replace('도', '')}
                        </Text>
                      </MotionPressable>
                    );
                  })}
                </View>
              </View>

              <ScenarioFeedback scoreDelta={customScoreDelta} lines={customFeedbackLines} inSheet />
            </ScrollView>

            <MotionPressable
              accessibilityRole="button"
              onPress={closeCustomSheet}
              style={styles.sheetDone}
            >
              <Text style={styles.sheetDoneText}>결과에 적용하기</Text>
            </MotionPressable>
            </View>
          </Appear>
        </View>
      </Modal>

      <NewsImpactSheet
        visible={openedNews !== null}
        profile={profile}
        article={openedNews?.article ?? null}
        relevance={openedNews?.relevance ?? null}
        onClose={() => setOpenedNews(null)}
      />
    </ScreenEnter>
  );
}

function ScenarioFeedback({
  scoreDelta,
  lines,
  inSheet = false,
}: {
  scoreDelta: number;
  lines: string[];
  inSheet?: boolean;
}) {
  return (
    <View style={[styles.feedback, inSheet && styles.feedbackInSheet]}>
      <View style={styles.feedbackHeading}>
        <MaterialIcons
          name={scoreDelta === 0 ? 'remove-circle-outline' : 'insights'}
          size={18}
          color={colors.primary}
        />
        <Text style={styles.feedbackTitle}>
          {scoreDelta === 0
            ? '준비도 점수 변화 없음'
            : `기본 가정보다 준비도 ${scoreDelta > 0 ? '+' : ''}${scoreDelta}점`}
        </Text>
      </View>
      {lines.map((line) => (
        <Text key={line} style={styles.feedbackLine}>{line}</Text>
      ))}
    </View>
  );
}

function Section({ label, note }: { label: string; note?: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {note ? <Text style={styles.sectionNote}>{note}</Text> : null}
    </View>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <MotionPressable
            key={option.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.key)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {option.label}
            </Text>
          </MotionPressable>
        );
      })}
    </View>
  );
}

const SIDE = spacing.screen;

const styles = StyleSheet.create({
  screen: { flex: 1, height: '100%', backgroundColor: colors.surface },
  scroll: { paddingBottom: 40 },
  spacer: { flex: 1 },

  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SIDE,
    paddingBottom: 10,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainer,
  },
  headTitle: { ...type.bodyLgStrong, color: colors.text, letterSpacing: -0.3 },
  headChip: {
    height: 24,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.lavender,
    paddingHorizontal: 9,
  },
  headChipText: { ...type.micro, color: colors.primary },

  /* 1. 레일 */
  railBlock: {
    paddingTop: 6,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  railHint: { ...type.micro, color: colors.textSubtle, paddingHorizontal: SIDE, marginBottom: 2 },
  rail: { height: 78, justifyContent: 'center' },
  railLine: {
    position: 'absolute',
    left: RAIL_START,
    right: RAIL_END,
    top: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.surfaceHigh,
  },
  railLineDone: {
    position: 'absolute',
    left: 0,
    top: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  railNode: { position: 'absolute', width: 52, alignItems: 'center', top: 6 },
  railScoreSlot: { height: 18, justifyContent: 'flex-end' },
  railScore: { ...type.micro, color: colors.textSubtle },
  railScoreActive: { ...type.label, color: colors.primary },
  railDotSlot: { height: 22, alignItems: 'center', justifyContent: 'center' },
  railLabelSlot: { height: 18, justifyContent: 'center' },
  railDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2.5,
    borderColor: colors.surfaceHigh,
    backgroundColor: colors.surface,
  },
  railDotPassed: { borderColor: colors.primary, backgroundColor: colors.primary },
  railDotActive: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 6,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  railLabel: { ...type.micro, color: colors.textSubtle },
  railLabelActive: { ...type.label, color: colors.text },

  /* 2. 미래 상태: full-bleed 밝은 밴드 */
  stateBand: {
    backgroundColor: colors.lavender,
    paddingHorizontal: SIDE,
    paddingTop: 18,
    paddingBottom: 18,
  },
  stateLabel: { ...type.label, color: colors.primary },
  transition: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 8 },
  fromBlock: { alignItems: 'flex-start' },
  fromValue: {
    fontFamily: type.metric.fontFamily,
    fontSize: 28,
    lineHeight: 34,
    color: colors.textSubtle,
    letterSpacing: -1,
  },
  fromCaption: { ...type.micro, color: colors.textSubtle },
  toBlock: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  toValue: {
    fontFamily: type.metric.fontFamily,
    fontSize: 52,
    lineHeight: 58,
    color: colors.primary,
    letterSpacing: -2.2,
  },
  toUnit: { ...type.title, color: colors.primary },
  deltaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingRight: 9,
    paddingLeft: 1,
  },
  deltaChipDown: { backgroundColor: colors.surface },
  deltaText: { ...type.label, color: colors.success },
  deltaTextDown: { color: colors.warning },
  stateFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  stageText: { ...type.bodySmStrong, color: colors.text, letterSpacing: -0.2 },
  stateMeta: { ...type.micro, color: colors.textMuted },

  /* 3. 마일스톤 */
  milestone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceLow,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    paddingHorizontal: SIDE,
    paddingVertical: 12,
  },
  milestoneBar: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors.primary },
  milestoneCopy: { flex: 1, gap: 2 },
  milestoneLabel: { ...type.micro, color: colors.primary, letterSpacing: 0.6 },
  milestoneTitle: { ...type.bodySmStrong, color: colors.text, letterSpacing: -0.2 },
  milestoneDetail: { ...type.caption, color: colors.textMuted },
  milestoneValue: { flexDirection: 'row', alignItems: 'baseline', gap: 1 },
  milestoneValueNum: {
    fontFamily: type.metric.fontFamily,
    fontSize: 24,
    lineHeight: 30,
    color: colors.primary,
    letterSpacing: -0.8,
  },
  milestoneValueUnit: { ...type.micro, color: colors.primary },

  /* 섹션 라벨 */
  section: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: SIDE,
    paddingTop: 22,
    paddingBottom: 8,
  },
  sectionLabel: { ...type.bodyLgStrong, color: colors.text, letterSpacing: -0.35 },
  sectionNote: { ...type.micro, color: colors.textSubtle },

  /* 4. 비교 막대 */
  compare: { paddingHorizontal: SIDE, gap: 8 },
  compareRow: {
    borderRadius: radius.cardSm,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    paddingHorizontal: 13,
    paddingVertical: 11,
    gap: 8,
  },
  compareRowActive: { borderColor: colors.primary, backgroundColor: colors.surfaceLow },
  compareTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  compareName: { ...type.bodySmStrong, color: colors.textMuted, letterSpacing: -0.2 },
  compareNameActive: { color: colors.text },
  compareNums: { ...type.bodySmStrong, color: colors.textSubtle },
  compareArrow: { color: colors.outline },
  compareScore: { fontFamily: type.metric.fontFamily, fontSize: 17, color: colors.text },
  compareScoreActive: { color: colors.primary },
  compareDelta: { ...type.micro, color: colors.success },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceHigh,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  barBase: {
    position: 'absolute',
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.outline,
    opacity: 0.45,
  },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.primaryFixed },
  barFillActive: { backgroundColor: colors.primary },
  compareDesc: { ...type.micro, color: colors.textSubtle },

  /* 5. 조건 바꿔보기 */
  tweakToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginHorizontal: SIDE,
    height: 46,
    borderRadius: radius.cardSm,
    backgroundColor: colors.surfaceLow,
    paddingHorizontal: 13,
  },
  tweakToggleText: { ...type.bodySmStrong, color: colors.primary, letterSpacing: -0.2 },
  feedback: {
    marginTop: 8,
    marginHorizontal: SIDE,
    gap: 5,
    borderRadius: radius.cardSm,
    borderWidth: 1,
    borderColor: colors.primaryFixed,
    backgroundColor: colors.lavender,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  feedbackInSheet: { marginHorizontal: 0, marginTop: 6 },
  feedbackHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  feedbackTitle: { ...type.bodySmStrong, color: colors.primary, letterSpacing: -0.2 },
  feedbackLine: { ...type.caption, color: colors.textMuted, paddingLeft: 25 },

  sheetLayer: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(28,27,34,0.42)',
  },
  customSheet: {
    maxHeight: '86%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surface,
    paddingTop: 7,
  },
  customSheetContent: { flexShrink: 1 },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceHighest,
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: SIDE,
    paddingBottom: 10,
  },
  sheetHeaderCopy: { flex: 1, gap: 2 },
  sheetEyebrow: { ...type.micro, color: colors.primary, letterSpacing: 0.7 },
  sheetTitle: { ...type.title, color: colors.text, letterSpacing: -0.4 },
  sheetDescription: { ...type.caption, color: colors.textMuted },
  sheetClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainer,
  },
  sheetBody: {
    paddingHorizontal: SIDE,
    paddingBottom: spacing.md,
  },
  sheetDone: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: SIDE,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
  },
  sheetDoneText: { ...type.bodySmStrong, fontSize: 15, color: colors.onPrimary },
  tweakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 58,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  tweakColumn: {
    paddingVertical: 11,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  tweakLabel: { ...type.bodySm, color: colors.textMuted },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceLow,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  stepperButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  stepperValue: { ...type.bodySmStrong, color: colors.text, minWidth: 56, textAlign: 'center' },

  segmented: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceLow,
    padding: 3,
    gap: 2,
  },
  segment: { paddingHorizontal: 15, height: 36, justifyContent: 'center', borderRadius: radius.pill },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { ...type.micro, color: colors.textMuted },
  segmentTextActive: { color: colors.onPrimary },

  regionRow: { flexDirection: 'row', gap: 6 },
  regionChip: {
    flex: 1,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
  },
  regionChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  regionText: { ...type.micro, color: colors.textMuted },
  regionTextActive: { color: colors.onPrimary },

  /* 6. 변화 */
  changeGroup: { paddingHorizontal: SIDE },
  changeGroupLabel: { ...type.micro, color: colors.primary, letterSpacing: 0.6, marginBottom: 4 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12 },
  changeDivider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  changeAccent: {
    width: 3,
    height: 30,
    borderRadius: 2,
    backgroundColor: colors.primaryFixed,
  },
  changeCopy: { flex: 1, gap: 3 },
  changeTitle: { ...type.bodySmStrong, color: colors.text, letterSpacing: -0.2 },
  changeValues: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  changeBefore: { ...type.caption, color: colors.textSubtle },
  changeAfter: { ...type.bodySmStrong, color: colors.primary },
  scoreDelta: {
    height: 24,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: tint.green.bg,
    paddingHorizontal: 9,
  },
  scoreDeltaDown: { backgroundColor: tint.amber.bg },
  scoreDeltaText: { ...type.label, color: tint.green.fg },
  scoreDeltaTextDown: { color: tint.amber.fg },

  infoGroup: {
    marginTop: 14,
    marginHorizontal: SIDE,
    borderRadius: radius.cardSm,
    backgroundColor: colors.surfaceLow,
    paddingHorizontal: 13,
    paddingVertical: 11,
    gap: 7,
  },
  infoGroupLabel: { ...type.micro, color: colors.textSubtle, letterSpacing: 0.4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  infoTitle: { ...type.caption, color: colors.textMuted, flex: 1 },
  infoValues: { ...type.caption, color: colors.textSubtle },
  infoAfter: { ...type.bodySmStrong, fontSize: 12, color: colors.textMuted },

  newsNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SIDE,
    marginTop: -4,
    marginBottom: 10,
  },
  newsNoteText: { ...type.caption, color: colors.textSubtle, flex: 1 },
  newsBlock: { paddingHorizontal: SIDE },

  /* 8. AI */
  aiCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 24,
    marginHorizontal: SIDE,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.primaryFixed,
    backgroundColor: colors.surfaceLow,
    paddingHorizontal: 13,
    paddingVertical: 13,
  },
  aiIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.cardSm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryFixed,
  },
  aiCopy: { flex: 1, gap: 2 },
  aiTitle: { ...type.bodySmStrong, fontSize: 15, color: colors.text, letterSpacing: -0.3 },
  aiNote: { ...type.caption, color: colors.textSubtle },

  disclaimer: {
    ...type.caption,
    color: colors.textSubtle,
    paddingHorizontal: SIDE,
    paddingTop: 20,
    lineHeight: 18,
  },
});
