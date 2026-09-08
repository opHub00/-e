import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '../../components/BrandMark';
import { Appear } from '../../components/motion/Appear';
import { NewsBriefingSection } from '../../components/NewsBriefingSection';
import { NewsImpactSheet } from '../../components/NewsImpactSheet';
import { stagger, travel } from '../../design/motion';
import { colors, overlay, radius, spacing, tint, tracking, type } from '../../design/tokens';
import {
  calculatePreparationScore,
  getStage,
  MILESTONE_MONTHS,
  simulateFuture,
} from '../../domain/preparation';
import { XP_PER_QUIZ } from '../../domain/quiz';
import { hasCoreProfileForCalculations } from '../../features/profile/domain';
import { useNewsBriefing } from '../../features/news/useNewsBriefing';
import type { RankedNews } from '../../features/news/useNewsBriefing';
import { useUserStore } from '../../store/useUserStore';

type NodeState = 'done' | 'current' | 'next' | 'later';

type Node = {
  key: string;
  when: string;
  title: string;
  body: string;
  score: number | null;
  state: NodeState;
};

/** Duolingo 의 solid lip: 흐린 그림자가 아니라 자기 색의 어두운 톤을 아래에 깐다. */
const LIP = '#2A2178';

export default function PreparationRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useUserStore((state) => state.profile);
  const applicantProfile = useUserStore((state) => state.applicantProfile);
  const todayQuizDone = useUserStore((state) => state.todayQuizDone);
  const { state: newsState, reload: reloadNews } = useNewsBriefing(profile, 4);
  const [openedNews, setOpenedNews] = useState<RankedNews | null>(null);

  const score = calculatePreparationScore(profile);
  const stage = getStage(score);
  const accountKnown = applicantProfile.subscriptionAccount.hasAccount.status === 'known';
  const inOne = simulateFuture(profile, 1);
  const inTwo = simulateFuture(profile, 2);
  const inFive = simulateFuture(profile, 5);

  const monthsLeft = MILESTONE_MONTHS - profile.accountMonths;
  const milestoneBody = !accountKnown
    ? '통장 정보를 확인해 주세요'
    : !profile.hasSubscriptionAccount
    ? '통장을 열면 여기서부터 쌓여요'
    : monthsLeft > 0
      ? `${monthsLeft}개월 남았어요`
      : '이미 넘겼어요';

  const nodes: Node[] = [
    {
      key: 'start',
      when: '시작',
      title: !accountKnown
        ? '청약통장 정보 확인 전'
        : profile.hasSubscriptionAccount
          ? '청약통장 개설'
          : '청약통장 개설 전',
      body: !accountKnown
        ? '프로필에서 통장 상태를 알려주세요'
        : profile.hasSubscriptionAccount
          ? `${profile.accountMonths}개월 유지 중`
          : '아직 시작 전',
      score: null,
      state: accountKnown && profile.hasSubscriptionAccount ? 'done' : 'current',
    },
    {
      key: 'now',
      when: '지금',
      title: `${stage.emoji} ${stage.label}`,
      body: !accountKnown
        ? `${profile.age}세 · 통장 확인 필요`
        : profile.hasSubscriptionAccount
        ? `${profile.age}세 · 통장 ${profile.accountMonths}개월`
        : `${profile.age}세 · 통장 없음`,
      score,
      state: 'current',
    },
    {
      key: 'milestone',
      when: '다음 단계',
      title: '가입 2년 도달',
      body: milestoneBody,
      score: inOne.preparationScore,
      state: 'next',
    },
    {
      key: 'two',
      when: '2년 뒤',
      title: getStage(inTwo.preparationScore).label,
      body: `${inTwo.age}세 · 통장 ${inTwo.accountMonths}개월`,
      score: inTwo.preparationScore,
      state: 'later',
    },
    {
      key: 'five',
      when: '5년 뒤',
      title: getStage(inFive.preparationScore).label,
      body: `${inFive.age}세 · 통장 ${inFive.accountMonths}개월`,
      score: inFive.preparationScore,
      state: 'later',
    },
  ];

  const doneCount = nodes.filter((n) => n.state === 'done').length + 1;

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={[colors.primaryContainer, colors.primary]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.band, { paddingTop: Math.max(insets.top, 12) + 8 }]}
      >
        <View style={styles.bandGlow} />
        <View style={styles.bandTop}>
          <BrandMark size={26} />
          <Text style={styles.bandTitle}>준비</Text>
          <View style={styles.spacer} />
          <View style={styles.bandStep}>
            <Text style={styles.bandStepText}>
              {doneCount} / {nodes.length} 단계
            </Text>
          </View>
        </View>

        <View style={styles.bandBody}>
          <Text style={styles.bandLabel}>다음 목표까지</Text>
          <View style={styles.bandGoalRow}>
            <Text style={styles.bandGoal}>{milestoneBody}</Text>
            <View style={styles.bandScore}>
              <Text style={styles.bandScoreValue}>{score}</Text>
              <Text style={styles.bandScoreUnit}>점</Text>
            </View>
          </View>
          <View style={styles.bandTrack}>
            <View style={[styles.bandFill, { width: `${(doneCount / nodes.length) * 100}%` }]} />
          </View>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* 타임라인 캔버스: 카드가 아니라 배경 tint 위에 경로가 놓인다. */}
        <View style={styles.canvas}>
          {nodes.map((node, index) => {
            const last = index === nodes.length - 1;
            const current = node.state === 'current';
            const done = node.state === 'done';
            const later = node.state === 'later';

            return (
              <Appear
                key={node.key}
                // 3단계까지만 계단을 두고 나머지는 같이 뜬다. 노드마다 밀면 로드맵이 줄줄이 튄다.
                delay={index === 0 ? 0 : index === 1 ? stagger.short : stagger.normal}
                distance={travel.content}
                style={styles.node}
              >
                <View style={styles.rail}>
                  <View style={styles.dotSlot}>
                    {done ? (
                      <View style={styles.dotLip}>
                        <View style={styles.dotDone}>
                          <MaterialIcons name="check" size={13} color={colors.onPrimary} />
                        </View>
                      </View>
                    ) : current ? (
                      <View style={styles.dotHalo}>
                        <View style={styles.dotCurrent} />
                      </View>
                    ) : (
                      <View style={[styles.dotFuture, later && styles.dotFar]} />
                    )}
                  </View>
                  {last ? null : (
                    <View style={[styles.line, !done && styles.lineAhead, later && styles.lineFar]} />
                  )}
                </View>

                <View style={[styles.body, current && styles.bodyCurrent, last && styles.bodyLast]}>
                  <View style={styles.bodyTop}>
                    <Text style={[styles.when, current && styles.whenCurrent, later && styles.whenLater]}>
                      {node.when}
                    </Text>
                    {node.score === null ? null : (
                      <Text
                        style={[
                          styles.score,
                          current && styles.scoreCurrent,
                          node.state === 'next' && styles.scoreNext,
                          later && styles.scoreLater,
                        ]}
                      >
                        {node.score}
                        <Text style={styles.scoreUnit}>점</Text>
                      </Text>
                    )}
                  </View>

                  <Text
                    style={[
                      styles.title,
                      current && styles.titleCurrent,
                      done && styles.titleDone,
                      later && styles.titleLater,
                    ]}
                  >
                    {node.title}
                  </Text>
                  <Text style={[styles.text, later && styles.textLater]}>{node.body}</Text>
                </View>
              </Appear>
            );
          })}

          <Text style={styles.scopeNote}>시간이 쌓여 생기는 변화만 담았어요.</Text>
        </View>

        <SectionRule label="나에게 가능한 청약 경로" />
        <View style={styles.eligibilityBlock}>
          <Text style={styles.eligibilityIntro}>준비도와 별개로 공급유형의 기본조건을 확인해요.</Text>
          <MotionPressable
            accessibilityRole="button"
            onPress={() => router.push('/eligibility/first-home' as Href)}
            style={styles.eligibilityLead}
          >
            <View style={[styles.toolIcon, { backgroundColor: tint.green.bg }]}>
              <MaterialIcons name="home-work" size={17} color={tint.green.fg} />
            </View>
            <View style={styles.eligibilityCopy}>
              <Text style={styles.toolTitle}>생애최초 특별공급</Text>
              <Text style={styles.eligibilityMeta}>조건 확인하기</Text>
            </View>
            <MaterialIcons name="chevron-right" size={18} color={colors.outline} />
          </MotionPressable>
          {['일반공급', '신혼부부', '청년'].map((label) => (
            <View key={label} style={styles.eligibilityLater}>
              <Text style={styles.eligibilityLaterTitle}>{label}</Text>
              <Text style={styles.eligibilityLaterMeta}>준비 중</Text>
            </View>
          ))}
        </View>

        {/* Duolingo: 다음 구역은 라벨이 박힌 구분선으로 넘어간다. */}
        <SectionRule label="AI 영향 브리핑" />
        <View style={styles.briefingHead}>
          <Text style={styles.briefingTitle}>최근 나와 관련 있는 변화</Text>
        </View>
        <View style={styles.briefing}>
          <NewsBriefingSection
            state={newsState}
            onReload={reloadNews}
            onOpen={setOpenedNews}
          />
        </View>

        <SectionRule label="로드맵 도구" />
        <View style={styles.tools}>
          <ToolRow
            icon="calendar-month"
            tone="purple"
            title="미래의 나"
            meta="1 · 2 · 5년"
            onPress={() => router.push('/future')}
          />
          <ToolRow
            icon="quiz"
            tone="amber"
            title="30초 퀴즈"
            meta={todayQuizDone ? '오늘 완료' : `+${XP_PER_QUIZ} XP`}
            onPress={() => router.push('/quiz')}
            border
          />
        </View>

      </ScrollView>

      <NewsImpactSheet
        visible={openedNews !== null}
        profile={profile}
        aiAllowed={hasCoreProfileForCalculations(applicantProfile)}
        article={openedNews?.article ?? null}
        relevance={openedNews?.relevance ?? null}
        onClose={() => setOpenedNews(null)}
      />
    </View>
  );
}

function SectionRule({ label }: { label: string }) {
  return (
    <View style={styles.rule}>
      <View style={styles.ruleLine} />
      <Text style={styles.ruleLabel}>{label}</Text>
      <View style={styles.ruleLine} />
    </View>
  );
}

function ToolRow({
  icon,
  tone,
  title,
  meta,
  onPress,
  border,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  tone: keyof typeof tint;
  title: string;
  meta: string;
  onPress: () => void;
  border?: boolean;
}) {
  return (
    <MotionPressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.toolRow, border && styles.toolBorder]}
    >
      <View style={[styles.toolIcon, { backgroundColor: tint[tone].bg }]}>
        <MaterialIcons name={icon} size={17} color={tint[tone].fg} />
      </View>
      <Text style={styles.toolTitle}>{title}</Text>
      <Text style={styles.toolMeta}>{meta}</Text>
      <MaterialIcons name="chevron-right" size={18} color={colors.outline} />
    </MotionPressable>
  );
}

const SIDE = spacing.screen;

const styles = StyleSheet.create({
  screen: { flex: 1, height: '100%', backgroundColor: colors.surface },
  scroll: { paddingBottom: 88 },
  spacer: { flex: 1 },
  band: { paddingHorizontal: SIDE, paddingBottom: 28, overflow: 'hidden' },
  bandGlow: {
    pointerEvents: 'none',
    position: 'absolute',
    right: -60,
    top: -70,
    width: 190,
    height: 190,
    borderRadius: radius.pill,
    backgroundColor: overlay.glow,
  },
  bandTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bandTitle: {
    ...type.title,
    fontSize: 19,
    lineHeight: 26,
    color: colors.onPrimary,
    letterSpacing: tracking.snug,
  },
  bandStep: {
    height: 26,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
  },
  bandStepText: { ...type.micro, color: colors.onPrimary },
  bandBody: { marginTop: 22 },
  bandLabel: { ...type.label, color: 'rgba(255,255,255,0.76)' },
  bandGoalRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 3 },
  bandGoal: {
    ...type.title,
    fontSize: 22,
    lineHeight: 29,
    color: colors.onPrimary,
    letterSpacing: tracking.tight,
    flex: 1,
  },
  bandScore: { flexDirection: 'row', alignItems: 'baseline', gap: 1 },
  bandScoreValue: {
    fontFamily: type.metric.fontFamily,
    fontSize: 30,
    lineHeight: 36,
    color: colors.onPrimary,
    letterSpacing: tracking.headline,
  },
  bandScoreUnit: { ...type.label, color: 'rgba(255,255,255,0.7)' },
  bandTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.24)',
    overflow: 'hidden',
    marginTop: 14,
  },
  bandFill: { height: '100%', borderRadius: 3, backgroundColor: colors.onPrimary },


  /* tinted 캔버스 위에 경로를 놓아 배경이 composition 의 일부가 되게 한다. */
  canvas: {
    marginTop: -16,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 22,
    paddingBottom: 16,
    paddingHorizontal: SIDE,
  },
  node: { flexDirection: 'row', gap: 10 },

  rail: { width: 30, alignItems: 'center' },
  dotSlot: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  dotLip: { borderRadius: radius.pill, backgroundColor: LIP, paddingBottom: 3 },
  dotDone: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotHalo: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotCurrent: {
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    borderWidth: 5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  dotFuture: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2.5,
    borderColor: colors.primaryFixed,
    backgroundColor: colors.surface,
  },
  dotFar: { width: 10, height: 10, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.surfaceHighest },

  line: { flex: 1, width: 3, borderRadius: 2, backgroundColor: colors.primary, marginVertical: 3 },
  lineAhead: { backgroundColor: colors.primaryFixed },
  lineFar: { backgroundColor: colors.surfaceHigh, width: 2 },

  body: { flex: 1, paddingBottom: 18, gap: 2, paddingTop: 4 },
  bodyLast: { paddingBottom: 2 },
  /* 캔버스가 흰색이므로 현재 단계는 tint 로 들어올린다. */
  bodyCurrent: {
    backgroundColor: colors.lavender,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 18,
    marginTop: -2,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },

  bodyTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  when: { ...type.micro, color: colors.textMuted },
  whenCurrent: { ...type.label, color: colors.primary },
  whenLater: { color: colors.textSubtle },

  score: { ...type.bodySmStrong, color: colors.textMuted, letterSpacing: tracking.snug },
  scoreCurrent: {
    fontFamily: type.metric.fontFamily,
    fontSize: 24,
    lineHeight: 30,
    color: colors.primary,
    letterSpacing: tracking.headline,
  },
  scoreNext: { ...type.cardTitle, color: colors.text, letterSpacing: tracking.snug },
  scoreLater: { ...type.bodySmStrong, color: colors.textSubtle },
  scoreUnit: { ...type.micro, color: colors.textSubtle },

  title: { ...type.rowTitle, color: colors.text },
  titleCurrent: { ...type.cardTitle, fontSize: 18, lineHeight: 26, color: colors.text, letterSpacing: tracking.tight },
  titleDone: { ...type.bodySm, color: colors.textSubtle },
  titleLater: { ...type.bodySm, color: colors.textSubtle },
  text: { ...type.caption, color: colors.textSubtle },
  textLater: { color: colors.outline },

  scopeNote: { ...type.caption, color: colors.textSubtle, marginTop: 2 },

  rule: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: SIDE, paddingVertical: 18 },
  ruleLine: { flex: 1, height: 1, backgroundColor: colors.surfaceHigh },
  ruleLabel: { ...type.micro, color: colors.textSubtle },

  briefingHead: { paddingHorizontal: SIDE, marginTop: -8, marginBottom: 8 },
  briefingTitle: { ...type.bodyLgStrong, color: colors.text, letterSpacing: tracking.snug },
  briefing: { paddingHorizontal: SIDE },
  eligibilityBlock: {
    marginHorizontal: SIDE,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
  eligibilityIntro: { ...type.caption, color: colors.textMuted, lineHeight: 18, paddingVertical: 12 },
  eligibilityLead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 58,
    borderRadius: radius.cardSm,
    backgroundColor: tint.green.bg,
    paddingHorizontal: 10,
  },
  eligibilityCopy: { flex: 1 },
  eligibilityMeta: { ...type.caption, color: tint.green.fg, marginTop: 1 },
  eligibilityLater: {
    minHeight: 45,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingHorizontal: 4,
  },
  eligibilityLaterTitle: { ...type.bodySm, color: colors.textMuted, flex: 1 },
  eligibilityLaterMeta: { ...type.micro, color: colors.textSubtle },
  tools: {
    marginHorizontal: SIDE,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    paddingHorizontal: 14,
  },
  toolBorder: { borderTopWidth: 1, borderTopColor: colors.hairline },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  toolIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.cardSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolTitle: { ...type.bodySmStrong, color: colors.text, flex: 1, letterSpacing: tracking.normal },
  toolMeta: { ...type.micro, color: colors.textSubtle },

});
