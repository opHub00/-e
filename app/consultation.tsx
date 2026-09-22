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
            </> : ruleLoad.state.status === 'SERVICE_UNAVAILABLE' ? <>
              {/* 연결 문제는 규칙이 없는 것과 다르다. 다시 시도하면 해결될 수 있음을 알린다. */}
              <Text accessibilityRole="header" style={styles.title}>공고 기준을 불러오지 못했어요</Text>
              <Text style={styles.body}>지금은 판정 규칙 서버에 연결할 수 없어요. 연결이 확인되기 전에는 다른 규칙이나 일반 상식으로 대신 판정하지 않아요.</Text>
              <PrimaryButton label="다시 불러오기" onPress={ruleLoad.retry} />
            </> : ruleLoad.state.status === 'INVALID_RULE_SET' || ruleLoad.state.status === 'UNSUPPORTED_SCHEMA' ? <>
              <Text accessibilityRole="header" style={styles.title}>이 공고의 규칙을 확인할 수 없어요</Text>
              <Text style={styles.body}>등록된 규칙 형식을 검증하지 못해 상담을 열지 않았어요. 검증되지 않은 규칙으로 판정하지 않아요.</Text>
              <PrimaryButton label="맞춤판정 공고 확인하기" onPress={() => router.replace('/assessment' as Href)} />
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
