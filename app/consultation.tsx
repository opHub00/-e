import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ScreenHeader } from '../components/ScreenHeader';
import { PrimaryButton } from '../components/PrimaryButton';
import { WanpanCard } from '../components/WanpanCard';
import { colors, spacing, type } from '../design/tokens';
import { ConsultationScreen } from '../features/assessmentConsultation/ConsultationScreen';
import { createAssessmentConsultationUiEngine } from '../features/assessmentConsultation/engineAdapter';
import { readAssessmentConsultationSeed } from '../features/assessmentConsultation/seedStore';
import { useAssessmentRules } from '../features/applicationAssessment/data/useAssessmentRules';
import { useUserStore } from '../store/useUserStore';

export default function ConsultationRoute() {
  const router = useRouter();
  const { listingId, seedId, supplyType } = useLocalSearchParams<{ listingId?: string; seedId?: string; supplyType?: string }>();
  const profile = useUserStore(state => state.applicantProfile);
  const hydrated = useUserStore(state => state.profileHydrated);
  const ruleLoad = useAssessmentRules(listingId);
  const storedSeed = useMemo(() => readAssessmentConsultationSeed(seedId), [seedId]);
  const seed = storedSeed?.listingId === listingId ? storedSeed : null;
  const engine = useMemo(() => {
    if (!listingId || !ruleLoad.rules || !hydrated) return null;
    const preferred = supplyType && ruleLoad.rules.supplies.some(item => item.type === supplyType)
      ? supplyType as 'youth' | 'newlywed' | 'firstHome'
      : undefined;
    const rules = preferred
      ? { ...ruleLoad.rules, supplies: [
        ...ruleLoad.rules.supplies.filter(item => item.type === preferred),
        ...ruleLoad.rules.supplies.filter(item => item.type !== preferred),
      ] }
      : ruleLoad.rules;
    return createAssessmentConsultationUiEngine({ rules, listingId, profile, seed });
  }, [hydrated, listingId, profile, ruleLoad.rules, seed, supplyType]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  if (!engine) {
    const loading = Boolean(listingId) && (ruleLoad.state.status === 'LOADING' || !hydrated);
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScreenHeader title="AI 청약 상담" onBack={back} />
        <View style={styles.content}>
          <WanpanCard style={styles.card}>
            {loading ? <>
              <ActivityIndicator color={colors.primary} />
              <Text accessibilityRole="header" style={styles.title}>공고 기준을 불러오고 있어요</Text>
            </> : <>
              <Text accessibilityRole="header" style={styles.title}>이 공고의 상담은 준비 중이에요</Text>
              <Text style={styles.body}>등록된 맞춤판정 규칙이 없어 공고 기준의 답변을 만들 수 없습니다. 다른 공고 규칙이나 일반 상식으로 대신 판정하지 않아요.</Text>
              <PrimaryButton label="맞춤판정 공고 확인하기" onPress={() => router.replace('/assessment' as Href)} />
            </>}
          </WanpanCard>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ConsultationScreen
      engine={engine}
      listingId={listingId!}
      seededFrom={seed ? 'ASSESSMENT_RESULT' : undefined}
      onBack={back}
      onOpenAssessment={() => router.push(`/assessment?listingId=${encodeURIComponent(listingId!)}` as Href)}
      onOpenProfile={() => router.push('/profile' as Href)}
      onOpenPreparation={() => router.push('/preparation' as Href)}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: spacing.screen },
  card: { gap: spacing.sm },
  title: { ...type.section, color: colors.text },
  body: { ...type.body, color: colors.textMuted },
});
