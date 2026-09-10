import { MaterialIcons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WanpanCard } from '../../components/WanpanCard';
import { BackButton } from '../../components/BackButton';
import { ProfilePromptSheet } from '../../components/ProfilePromptSheet';
import { StatusPill } from '../../components/StatusPill';
import { Appear } from '../../components/motion/Appear';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { ScreenEnter } from '../../components/motion/ScreenEnter';
import { colors, radius, shadow, size, spacing, tint, tracking, type } from '../../design/tokens';
import {
  buildFirstHomeAiContext,
  evaluateFirstHomeEligibility,
  type EligibilityAction,
  type EligibilityCheckStatus,
  type FirstHomeEligibilityStatus,
} from '../../features/eligibility/firstHome';
import type { ProfileQuestionBundleId } from '../../features/profile/domain';
import { useUserStore } from '../../store/useUserStore';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * 조건 분석은 합격/불합격이 아니다.
 * green 은 합격, pink 는 탈락처럼 읽히므로 결과 요약에는 쓰지 않는다.
 * 사용자가 실제로 움직여야 하는 '정보 필요'에만 amber 로 시선을 남긴다.
 */
const STATUS_TONE: Record<FirstHomeEligibilityStatus, keyof typeof tint> = {
  likely_eligible: 'neutral',
  needs_information: 'amber',
  needs_listing_confirmation: 'purple',
  not_eligible: 'neutral',
};

/** 결과 pill 문구. 제목보다 짧게 상태만 말한다. 판정 어휘를 쓰지 않는다. */
const STATUS_PILL: Record<FirstHomeEligibilityStatus, string> = {
  likely_eligible: '입력 기준 확인',
  needs_information: '정보 필요',
  needs_listing_confirmation: '공고 확인',
  not_eligible: '조건 불충족',
};

const CHECK_ICON: Record<EligibilityCheckStatus, React.ComponentProps<typeof MaterialIcons>['name']> = {
  met: 'check',
  needs_information: 'question-mark',
  needs_listing_confirmation: 'description',
  not_met: 'priority-high',
};

export default function FirstHomeEligibilityRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const applicantProfile = useUserStore((state) => state.applicantProfile);
  const requestProfileBundle = useUserStore((state) => state.requestProfileBundle);
  const dismissProfileBundle = useUserStore((state) => state.dismissProfileBundle);
  const [profilePrompt, setProfilePrompt] = useState<ProfileQuestionBundleId | null>(null);
  const [aiState, setAiState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [aiAnswer, setAiAnswer] = useState('');
  const result = useMemo(() => evaluateFirstHomeEligibility(applicantProfile), [applicantProfile]);
  const metCount = result.checks.filter((item) => item.status === 'met').length;
  const unresolvedCount = result.checks.length - metCount;

  /**
   * 진입하자마자 시트를 띄우지 않는다.
   * 결과를 먼저 보여주고, 사용자가 눌렀을 때만 연다.
   *
   * fatigue 는 "실제로 보여준 순간"에만 기록되어야 하므로
   * requestProfileBundle 도 여기서 호출한다. 자동 호출은 보여주지도 않고
   * 예산만 깎았다. 사용자가 직접 요청한 경우에는 fatigue 로 막지 않고
   * 가장 우선순위가 높은 미입력 묶음으로 대신 연다.
   */
  const openMissingPrompt = () => {
    const bundleId = requestProfileBundle('first-home') ?? result.missingBundles[0];
    if (bundleId) setProfilePrompt(bundleId);
  };

  const openBundle = (bundleId: ProfileQuestionBundleId) => {
    setProfilePrompt(null);
    router.push(`/profile?bundle=${bundleId}&returnTo=/eligibility/first-home` as Href);
  };

  const handleAction = (action: EligibilityAction) => {
    if (action.bundleId) openBundle(action.bundleId);
    else if (action.route) router.push(action.route as Href);
  };

  const explain = async () => {
    if (aiState === 'loading') return;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setAiState('error');
      return;
    }
    setAiState('loading');
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          question: '현재 확인 결과를 처음 보는 사람도 이해하기 쉽게 설명해 주세요.',
          eligibility: buildFirstHomeAiContext(result),
        }),
      });
      const body = await response.json();
      if (!response.ok || typeof body.answer !== 'string') throw new Error('AI explanation failed');
      setAiAnswer(body.answer);
      setAiState('done');
    } catch {
      setAiState('error');
    }
  };

  return (
    <ScreenEnter style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <BackButton onPress={() => router.back()} accessibilityLabel="뒤로" />
        <Text style={styles.headerTitle}>생애최초 특별공급</Text>
        <View style={styles.backGhost} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* 프레임은 상태와 무관하게 고정한다. 상태는 pill 하나로만 전달한다.
            아이콘이 왼쪽에 서는 가로 구성은 이 화면의 고유한 형태라 유지한다. */}
        <Appear replayKey={result.status} style={styles.resultCard}>
          <View style={styles.resultIcon}>
            <MaterialIcons name="fact-check" size={22} color={colors.primary} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.resultEyebrow}>현재 확인 결과</Text>
            <Text style={styles.resultTitle}>{result.title}</Text>
            <View style={styles.resultPill}>
              <StatusPill label={STATUS_PILL[result.status]} tone={STATUS_TONE[result.status]} />
            </View>
            <Text style={styles.resultBody}>{result.summary}</Text>
          </View>
        </Appear>

        <View style={styles.progressNote}>
          <Text style={styles.progressStrong}>{result.checks.length}개 조건 중 {metCount}개 확인</Text>
          <Text style={styles.progressText}> · {unresolvedCount}개는 정보 또는 공고 확인이 필요해요</Text>
        </View>

        {/* 채울 정보가 있을 때만 보여준다. 이미 충분하면 자리를 차지하지 않는다. */}
        {result.missingBundles.length > 0 ? (
          <MotionPressable
            accessibilityRole="button"
            accessibilityLabel={`부족한 정보 ${result.missingBundles.length}개 채우기`}
            onPress={openMissingPrompt}
            style={styles.fillCta}
          >
            <MaterialIcons name="edit-note" size={19} color={colors.primary} />
            <Text style={styles.fillCtaText}>부족한 정보 {result.missingBundles.length}개 채우기</Text>
            <MaterialIcons name="chevron-right" size={18} color={colors.primary} />
          </MotionPressable>
        ) : null}

        <SectionTitle label="조건별 확인" />
        <View style={styles.checkList}>
          {result.checks.map((item, index) => {
            const checkTone = checkStatusTone(item.status);
            return (
              <View key={item.id} style={[styles.checkRow, index > 0 && styles.checkBorder]}>
                <View style={[styles.checkIcon, { backgroundColor: checkTone.bg }]}>
                  <MaterialIcons name={CHECK_ICON[item.status]} size={15} color={checkTone.fg} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.checkLabel}>{item.label}</Text>
                  <Text style={styles.checkReason}>{item.reason}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {result.actions.length > 0 ? (
          <>
            <SectionTitle label="다음에 할 일" />
            <View style={styles.actionList}>
              {result.actions.map((action, index) => (
                <MotionPressable
                  key={action.id}
                  accessibilityRole="button"
                  onPress={() => handleAction(action)}
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

        <SectionTitle label="AI에게 쉽게 설명받기" />
        <WanpanCard tone="lavender" style={styles.aiCard}>
          <View style={styles.aiHead}>
            <View style={styles.aiIcon}>
              <MaterialIcons name="auto-awesome" size={18} color={colors.primary} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.aiTitle}>판정은 그대로, 설명만 쉽게</Text>
              <Text style={styles.aiBody}>AI에는 위의 구조화된 결과만 전달해요.</Text>
            </View>
          </View>
          {aiState === 'done' ? <Text style={styles.aiAnswer}>{aiAnswer}</Text> : null}
          {aiState === 'error' ? (
            <Text style={styles.aiError}>설명은 지금 불러오지 못했어요. 위의 조건 분석 결과는 그대로 확인할 수 있어요.</Text>
          ) : null}
          <MotionPressable accessibilityRole="button" onPress={() => void explain()} style={styles.aiButton}>
            {aiState === 'loading' ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.aiButtonText}>{aiState === 'done' ? '다시 설명받기' : '결과 쉽게 설명받기'}</Text>}
          </MotionPressable>
        </WanpanCard>

        <View style={styles.notice}>
          <MaterialIcons name="verified-user" size={16} color={colors.textMuted} />
          <Text style={styles.noticeText}>
            이 결과는 준비도 점수와 별개예요. 실제 신청 가능 여부는 모집공고와 청약홈에서 최종 확인해 주세요.
          </Text>
        </View>
        <MotionPressable
          accessibilityRole="button"
          onPress={() => router.push('/discovery' as Href)}
          style={styles.discoveryLink}
        >
          <Text style={styles.discoveryLinkText}>전국 실제 공고 둘러보기</Text>
          <MaterialIcons name="arrow-forward" size={18} color={colors.primary} />
        </MotionPressable>
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
  scroll: { padding: spacing.screen, paddingBottom: 52, gap: spacing.md },
  resultCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radius.bento,
    borderWidth: 1,
    borderColor: colors.primaryFixed,
    backgroundColor: colors.lavender,
    padding: spacing.md,
  },
  resultIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  resultEyebrow: { ...type.micro, color: colors.primary },
  resultPill: { alignSelf: 'flex-start', marginTop: spacing.xs },
  resultTitle: { ...type.title, color: colors.text, marginTop: 2, letterSpacing: tracking.tight },
  resultBody: { ...type.bodySm, color: colors.textMuted, lineHeight: 21, marginTop: 5 },
  /** 결과 바로 아래의 단일 행동. 조건 목록 아래 액션 목록과 역할이 겹치지 않게 형태를 다르게 둔다. */
  fillCta: {
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.primaryFixed,
    backgroundColor: colors.lavender,
    paddingHorizontal: spacing.md,
  },
  fillCtaText: { ...type.bodySmStrong, color: colors.primary, flex: 1 },
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
  aiError: { ...type.caption, color: colors.error, lineHeight: 18 },
  aiButton: { minHeight: 48, borderRadius: radius.button, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  aiButtonText: { ...type.bodySmStrong, color: colors.onPrimary },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderRadius: radius.cardSm, backgroundColor: colors.surfaceLow, padding: 12 },
  noticeText: { ...type.caption, color: colors.textMuted, flex: 1, lineHeight: 18 },
  discoveryLink: { minHeight: size.touch, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.button, borderWidth: 1, borderColor: colors.primaryFixed, backgroundColor: colors.lavender },
  discoveryLinkText: { ...type.bodySmStrong, color: colors.primary },
});
