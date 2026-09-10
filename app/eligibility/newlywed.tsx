import { MaterialIcons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusPill } from '../../components/StatusPill';
import { TermHelp, type TermHelpContent } from '../../components/TermHelp';
import { WanpanCard } from '../../components/WanpanCard';
import { BackButton } from '../../components/BackButton';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProfilePromptSheet } from '../../components/ProfilePromptSheet';
import { Appear } from '../../components/motion/Appear';
import { AppearItem } from '../../components/motion/AppearItem';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { ScreenEnter } from '../../components/motion/ScreenEnter';
import { colors, radius, shadow, size, spacing, tint, tracking, type } from '../../design/tokens';
import { evaluateNewlywedEligibility, newlywedProfileRoute, NEWLYWED_CHECK_LABELS, type NewlywedAction as EligibilityAction, type NewlywedCheckStatus as EligibilityCheckStatus, type NewlywedEligibilityStatus } from '../../features/eligibility/newlywed';
import { buildNewlywedAiContext, buildNewlywedExplanation, parseNewlywedAiSelection } from '../../features/eligibility/newlywedAi';
import type { ProfileQuestionBundleId } from '../../features/profile/domain';
import { PROFILE_TERM_HELP } from '../../features/profile/terminology';
import { useUserStore } from '../../store/useUserStore';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * 자격 분석은 합격/불합격이 아니다.
 * green 은 합격, pink 는 탈락처럼 읽히므로 쓰지 않는다.
 * 사용자가 실제로 움직여야 하는 '정보 필요'에만 amber 로 시선을 남긴다.
 */
const STATUS_TONE: Record<NewlywedEligibilityStatus, keyof typeof tint> = {
  likely_eligible: 'neutral',
  needs_information: 'amber',
  needs_listing_confirmation: 'purple',
  not_eligible: 'neutral',
  unsupported: 'neutral',
};

/**
 * 결과 카드 pill 문구. 제목(engine 제공)보다 짧게 상태만 말한다.
 * 판정 어휘(가능/충족/적격)를 쓰지 않는다.
 */
const NEWLYWED_CHECK_SUMMARY: Record<NewlywedEligibilityStatus, string> = {
  likely_eligible: '입력 기준 확인',
  needs_information: '정보 필요',
  needs_listing_confirmation: '공고 확인',
  not_eligible: '조건 불충족',
  unsupported: '지원 범위 밖',
};

/** 처음에 펼쳐 둘 조건 수. 나머지는 "더 보기"로 연다. */
const VISIBLE_CHECKS = 3;

/**
 * 조건 이름만으로는 처음 보는 사람이 이해하기 어려운 용어에만 설명을 붙인다.
 * 이미 프로필에서 쓰는 설명은 그대로 가져오고, 신혼 전용 두 가지만 여기서 더한다.
 * 판정 기준이 아니라 용어 뜻만 설명한다.
 */
const CHECK_TERMS: Record<string, TermHelpContent> = {
  marriage_period: {
    title: '혼인기간이란?',
    description: '혼인신고일부터 지금까지 지난 기간이에요. 결혼식 날짜가 아니라 혼인신고일을 기준으로 봐요.',
  },
  income: {
    title: '신혼부부 소득 기준이란?',
    description: '가구의 월평균 소득을 도시근로자 가구 평균과 비교하는 기준이에요. 맞벌이 여부와 가구원 수에 따라 적용 비율이 달라져요.',
  },
  household_housing: PROFILE_TERM_HELP['household-home-ownership'],
  special_supply_restriction: PROFILE_TERM_HELP['special-supply-restriction'],
  real_estate: PROFILE_TERM_HELP['asset-range'],
  subscription_period: PROFILE_TERM_HELP['subscription-period'],
};

const CHECK_ICON: Record<EligibilityCheckStatus, React.ComponentProps<typeof MaterialIcons>['name']> = {
  met: 'check',
  needs_information: 'question-mark',
  needs_listing_confirmation: 'description',
  not_met: 'priority-high',
  unsupported: 'info-outline',
};

export default function NewlywedEligibilityRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const applicantProfile = useUserStore((state) => state.applicantProfile);
  const requestProfileBundle = useUserStore((state) => state.requestProfileBundle);
  const dismissProfileBundle = useUserStore((state) => state.dismissProfileBundle);
  const [profilePrompt, setProfilePrompt] = useState<ProfileQuestionBundleId | null>(null);
  const [aiState, setAiState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiFallback, setAiFallback] = useState(false);
  const [showAllChecks, setShowAllChecks] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const result = useMemo(() => evaluateNewlywedEligibility(applicantProfile), [applicantProfile]);
  const metCount = result.checks.filter((item) => item.status === 'met').length;
  const missingCount = result.checks.filter(c => c.status === 'needs_information').length;
  const listingCount = result.checks.filter(c => c.status === 'needs_listing_confirmation').length;
  const failedCount = result.checks.filter(c => c.status === 'not_met').length;

  /**
   * 조건이 10개 넘게 한 번에 펼쳐지면 모바일에서 다음 행동까지 스크롤이 너무 길다.
   * 손댈 항목(정보 필요 → 불충족 → 공고 확인)을 앞으로 올리고 3개만 먼저 보여준다.
   * 정렬은 표시 순서만 바꾸며 판정이나 개수에는 영향을 주지 않는다.
   */
  const orderedChecks = useMemo(() => {
    const weight: Record<EligibilityCheckStatus, number> = {
      needs_information: 0,
      not_met: 1,
      unsupported: 2,
      needs_listing_confirmation: 3,
      met: 4,
    };
    return [...result.checks]
      .map((check, index) => ({ check, index }))
      .sort((a, b) => weight[a.check.status] - weight[b.check.status] || a.index - b.index)
      .map(({ check }) => check);
  }, [result.checks]);
  const visibleChecks = showAllChecks ? orderedChecks : orderedChecks.slice(0, VISIBLE_CHECKS);
  const hiddenCount = orderedChecks.length - visibleChecks.length;

  useEffect(() => {
    generation.current += 1;
    pending.current?.abort(); pending.current = null;
    setAiState('idle'); setAiAnswer(''); setAiFallback(false);
    return () => { generation.current += 1; pending.current?.abort(); };
  }, [result]);

  /**
   * 진입하자마자 시트를 띄우지 않는다. 결과를 먼저 보여준다.
   * fatigue 는 실제로 보여준 순간에만 기록되어야 하므로 여기서 호출한다.
   * 사용자가 직접 누른 경우에는 fatigue 로 막지 않고 미입력 묶음으로 대신 연다.
   */
  const openMissingPrompt = () => {
    const bundleId = requestProfileBundle('newlywed') ?? result.missingBundles[0];
    if (bundleId) setProfilePrompt(bundleId);
  };

  const openBundle = (bundleId: ProfileQuestionBundleId) => {
    setProfilePrompt(null);
    router.push(newlywedProfileRoute(bundleId) as Href);
  };

  const handleAction = (action: EligibilityAction) => {
    if (action.bundleId) openBundle(action.bundleId);
    else if (action.route) router.push(action.route as Href);
  };

  const explain = async () => {
    if (pending.current) return;
    const context = buildNewlywedAiContext(result);
    const requestGeneration = generation.current;
    const controller = new AbortController();
    pending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 25_000);
    setAiState('loading');
    let selection = null;
    try {
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('not_configured');
      const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-newlywed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
        signal: controller.signal,
        body: JSON.stringify({ newlywed: context }),
      });
      const body = await response.json();
      if (response.ok) selection = parseNewlywedAiSelection(body.selection, context);
    } catch { /* A local explanation is always available. */ }
    finally {
      clearTimeout(timeout);
      if (pending.current === controller) pending.current = null;
    }
    if (generation.current !== requestGeneration) return;
    setAiAnswer(buildNewlywedExplanation(context, selection));
    setAiFallback(!selection);
    setAiState('done');
  };

  return (
    <ScreenEnter style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/newlywed' as Href)} accessibilityLabel="뒤로" />
        <Text style={styles.headerTitle}>신혼부부 조건 분석</Text>
        <View style={styles.backGhost} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.scope}>{result.metadata.supportedScope}</Text>
        {/* 프레임은 상태와 무관하게 고정한다. 상태는 아래 pill 하나로만 전달한다. */}
        <Appear replayKey={result.status} style={styles.resultCard}>
          <View style={styles.resultTop}>
            <View style={styles.resultIcon}>
              <MaterialIcons name="fact-check" size={22} color={colors.primary} />
            </View>
            <Text style={styles.resultEyebrow}>현재 확인 결과</Text>
          </View>
          <Text style={styles.resultTitle}>{result.title}</Text>
          <StatusPill label={NEWLYWED_CHECK_SUMMARY[result.status]} tone={STATUS_TONE[result.status]} />
          <Text style={styles.resultBody}>{result.summary}</Text>
        </Appear>

        <View style={styles.progressNote}>
          <Text style={styles.progressStrong}>{result.checks.length}개 조건 중 {metCount}개 확인</Text>
          <Text style={styles.progressText}> · 정보 필요 {missingCount} · 공고 확인 {listingCount}{failedCount > 0 ? ` · 불충족 ${failedCount}` : ''}</Text>
        </View>

        {/* 다음 행동을 요약 바로 아래 둔다. 조건 목록 아래로 내리면 모바일에서 묻힌다. */}
        {result.actions.length > 0 ? (
          <>
            <SectionTitle label="다음에 할 일" />
            <Text style={styles.ctaValue}>
              정보를 채우면 공고에서 따로 확인할 조건이 줄어들어요.
            </Text>
            <View style={styles.actionList}>
              {result.actions.map((action, index) => (
                <MotionPressable
                  key={action.id}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  // 첫 항목만 시트로 연다. 무엇을 왜 묻는지 보고 나서 입력으로 들어가게 한다.
                  onPress={() => (index === 0 && action.bundleId ? openMissingPrompt() : handleAction(action))}
                  style={[styles.actionRow, index === 0 && styles.actionLead]}
                >
                  <MaterialIcons name={action.bundleId ? 'edit-note' : 'arrow-forward'} size={19} color={index === 0 ? colors.primary : colors.textMuted} />
                  <Text style={[styles.actionText, index === 0 && styles.actionTextLead]}>{action.label}</Text>
                  <MaterialIcons name="chevron-right" size={18} color={colors.outline} />
                </MotionPressable>
              ))}
            </View>
          </>
        ) : null}

        <SectionTitle label="조건별 확인" />
        <View style={styles.checkList}>
          {visibleChecks.map((item, index) => {
            const checkTone = checkStatusTone(item.status);
            return (
              <AppearItem key={item.key} index={index}>
                <View style={[styles.checkRow, index > 0 && styles.checkBorder]}>
                  <View style={[styles.checkIcon, { backgroundColor: checkTone.bg }]}>
                    <MaterialIcons name={CHECK_ICON[item.status]} size={15} color={checkTone.fg} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.checkLabel}>{item.label} · {NEWLYWED_CHECK_LABELS[item.status]}</Text>
                    <Text style={styles.checkReason}>{item.reason}</Text>
                    {CHECK_TERMS[item.key] ? <TermHelp term={CHECK_TERMS[item.key]} /> : null}
                    {item.requiredBundle && item.status === 'needs_information' ? <MotionPressable accessibilityRole="button" accessibilityLabel={`${item.label} 정보 입력하기`} onPress={() => openBundle(item.requiredBundle!)} style={styles.checkEdit}><Text style={styles.discoveryLinkText}>정보 입력하기</Text></MotionPressable> : null}
                  </View>
                </View>
              </AppearItem>
            );
          })}
        </View>
        {orderedChecks.length > VISIBLE_CHECKS ? (
          <MotionPressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showAllChecks }}
            aria-expanded={showAllChecks}
            accessibilityLabel={showAllChecks ? '조건 접기' : `조건 ${hiddenCount}개 더 보기`}
            onPress={() => setShowAllChecks((current) => !current)}
            style={styles.moreChecks}
          >
            <Text style={styles.discoveryLinkText}>
              {showAllChecks ? '간단히 보기' : `조건 ${hiddenCount}개 더 보기`}
            </Text>
            <MaterialIcons name={showAllChecks ? 'expand-less' : 'expand-more'} size={18} color={colors.primary} />
          </MotionPressable>
        ) : null}

        <SectionTitle label="AI에게 쉽게 설명받기" />
        <WanpanCard tone="lavender" style={styles.aiCard}>
          <View style={styles.aiHead}>
            <View style={styles.aiIcon}>
              <MaterialIcons name="auto-awesome" size={18} color={colors.primary} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.aiTitle}>확인 결과 쉽게 이해하기</Text>
              <Text style={styles.aiBody}>AI가 확인할 항목을 골라 안내해요. 프로필 원본은 보내지 않아요.</Text>
            </View>
          </View>
          {aiFallback ? <Text style={styles.aiBody}>AI 연결 대신 현재 결과로 기본 설명을 준비했어요.</Text> : null}
          {aiState === 'done' ? <Text style={styles.aiAnswer}>{aiAnswer}</Text> : null}
          <PrimaryButton
            label={aiState === 'done' ? '다시 설명받기' : '결과 쉽게 설명받기'}
            loading={aiState === 'loading'}
            onPress={() => void explain()}
          />
        </WanpanCard>

        <View style={styles.notice}>
          <MaterialIcons name="verified-user" size={16} color={colors.textMuted} />
          <Text style={styles.noticeText}>
            {result.disclaimer}
          </Text>
        </View>
        <MotionPressable
          accessibilityRole="button"
          onPress={() => router.push('/newlywed' as Href)}
          style={styles.discoveryLink}
        >
          <Text style={styles.discoveryLinkText}>관련 공고·일정 보기</Text>
          <MaterialIcons name="arrow-forward" size={18} color={colors.primary} />
        </MotionPressable>
        <Text style={styles.checkReason}>관련 공고는 특별공급 일정 기준이며 신혼부부 대상 확정을 뜻하지 않아요.</Text>
        <SectionTitle label="적용 범위와 공식 근거" />
        <Text style={styles.checkReason}>이번 분석에서 제외: {result.metadata.unsupportedScopes.join(' · ')}</Text>
        <Text style={styles.checkReason}>규정 버전 {result.metadata.ruleSetVersion}{'\n'}시행 {result.metadata.effectiveDate} · 확인 {result.metadata.reviewedAt}</Text>
        {result.metadata.sources.map(source => (
          <MotionPressable key={source.id} accessibilityRole="link" onPress={() => void Linking.openURL(source.url)} style={styles.sourceLink}>
            <Text style={styles.discoveryLinkText}>{source.title}</Text>
            <Text style={styles.checkReason}>시행 {source.effectiveDate} · 국가법령정보센터</Text>
          </MotionPressable>
        ))}
      </ScrollView>

      <ProfilePromptSheet
        bundleId={profilePrompt}
        onEdit={openBundle}
        onLater={(bundleId) => {
          dismissProfileBundle(bundleId);
          setProfilePrompt(null);
        }}
      />
    </ScreenEnter>
  );
}

function SectionTitle({ label }: { label: string }) {
  return <Text style={styles.sectionTitle}>{label}</Text>;
}

/** 행 단위도 같은 원칙. 확인된 항목은 쉬는 색, 손댈 항목만 눈에 띄게 둔다. */
function checkStatusTone(status: EligibilityCheckStatus) {
  if (status === 'needs_information') return tint.amber;
  if (status === 'needs_listing_confirmation') return tint.purple;
  return tint.neutral;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screen,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  backGhost: { width: size.iconButton },
  headerTitle: { ...type.bodyLgStrong, color: colors.text },
  scope: { ...type.caption, color: colors.primary, lineHeight: 19 },
  checkEdit: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  sourceLink: { minHeight: 48, justifyContent: 'center' },
  scroll: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: spacing.screen, paddingBottom: 52, gap: spacing.md },
  resultCard: {
    gap: spacing.sm,
    borderRadius: radius.bento,
    borderWidth: 1,
    borderColor: colors.primaryFixed,
    backgroundColor: colors.lavender,
    padding: spacing.md,
  },
  resultTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  resultIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  resultEyebrow: { ...type.micro, color: colors.primary },
  resultTitle: { ...type.title, color: colors.text, letterSpacing: tracking.tight },
  resultBody: { ...type.bodySm, color: colors.textMuted, lineHeight: 21 },
  progressNote: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 3 },
  progressStrong: { ...type.bodySmStrong, color: colors.text },
  progressText: { ...type.bodySm, color: colors.textMuted },
  sectionTitle: { ...type.bodyLgStrong, color: colors.text, marginTop: spacing.xs, letterSpacing: tracking.snug },
  checkList: { borderRadius: radius.card, backgroundColor: colors.surface, paddingHorizontal: spacing.md, ...shadow.card },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 13 },
  checkBorder: { borderTopWidth: 1, borderTopColor: colors.hairline },
  checkIcon: { width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  checkLabel: { ...type.bodySmStrong, color: colors.text },
  checkReason: { ...type.caption, color: colors.textMuted, lineHeight: 18, marginTop: 2 },
  /** 액션 목록 위 한 줄. 요구 전에 얻는 것을 말한다. */
  ctaValue: { ...type.bodySm, color: colors.textMuted, paddingHorizontal: 3, marginBottom: -4 },
  actionList: { borderRadius: radius.card, borderWidth: 1, borderColor: colors.surfaceHigh, backgroundColor: colors.surface, overflow: 'hidden' },
  actionRow: { minHeight: size.touch, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderTopWidth: 1, borderTopColor: colors.hairline },
  actionLead: { borderTopWidth: 0, backgroundColor: colors.lavender },
  actionText: { ...type.bodySm, color: colors.textMuted, flex: 1 },
  actionTextLead: { ...type.bodySmStrong, color: colors.text },
  aiCard: { gap: spacing.sm },
  aiHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  aiIcon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  aiTitle: { ...type.bodySmStrong, color: colors.text },
  aiBody: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  aiAnswer: { ...type.bodySm, color: colors.text, lineHeight: 21, borderRadius: radius.cardSm, backgroundColor: colors.surface, padding: 12 },
  moreChecks: {
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  aiButton: { minHeight: 48, borderRadius: radius.button, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  aiButtonText: { ...type.bodySmStrong, color: colors.onPrimary },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderRadius: radius.cardSm, backgroundColor: colors.surfaceLow, padding: 12 },
  noticeText: { ...type.caption, color: colors.textMuted, flex: 1, lineHeight: 18 },
  discoveryLink: { minHeight: size.touch, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.button, borderWidth: 1, borderColor: colors.primaryFixed, backgroundColor: colors.lavender },
  discoveryLinkText: { ...type.bodySmStrong, color: colors.primary },
});
