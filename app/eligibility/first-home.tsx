import { MaterialIcons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WanpanCard } from '../../components/WanpanCard';
import { BackButton } from '../../components/BackButton';
import { ProfilePromptSheet } from '../../components/ProfilePromptSheet';
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

const STATUS_TONE: Record<FirstHomeEligibilityStatus, keyof typeof tint> = {
  likely_eligible: 'green',
  needs_information: 'amber',
  needs_listing_confirmation: 'purple',
  not_eligible: 'pink',
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
  const tone = tint[STATUS_TONE[result.status]];
  const metCount = result.checks.filter((item) => item.status === 'met').length;
  const unresolvedCount = result.checks.length - metCount;

  useEffect(() => {
    const bundleId = requestProfileBundle('first-home');
    if (bundleId) setProfilePrompt(bundleId);
  }, [requestProfileBundle]);

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
        <Appear style={[styles.resultCard, { backgroundColor: tone.bg, borderColor: tone.fg }]}>
          <View style={[styles.resultIcon, { backgroundColor: colors.surface }]}>
            <MaterialIcons name={result.status === 'not_eligible' ? 'priority-high' : 'fact-check'} size={22} color={tone.fg} />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.resultEyebrow, { color: tone.fg }]}>현재 확인 결과</Text>
            <Text style={styles.resultTitle}>{result.title}</Text>
            <Text style={styles.resultBody}>{result.summary}</Text>
          </View>
        </Appear>

        <View style={styles.progressNote}>
          <Text style={styles.progressStrong}>{result.checks.length}개 조건 중 {metCount}개 확인</Text>
          <Text style={styles.progressText}> · {unresolvedCount}개는 정보 또는 공고 확인이 필요해요</Text>
        </View>

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

function checkStatusTone(status: EligibilityCheckStatus) {
  if (status === 'met') return tint.green;
  if (status === 'needs_information') return tint.amber;
  if (status === 'needs_listing_confirmation') return tint.purple;
  return tint.pink;
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
  resultCard: { flexDirection: 'row', gap: spacing.sm, borderRadius: radius.bento, borderWidth: 1, padding: spacing.md, ...shadow.card },
  resultIcon: { width: 42, height: 42, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  resultEyebrow: { ...type.micro },
  resultTitle: { ...type.title, color: colors.text, marginTop: 2, letterSpacing: tracking.tight },
  resultBody: { ...type.bodySm, color: colors.textMuted, lineHeight: 21, marginTop: 5 },
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
