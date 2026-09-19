import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ScreenHeader } from '../components/ScreenHeader';
import { PrimaryButton } from '../components/PrimaryButton';
import { WanpanCard } from '../components/WanpanCard';
import { colors, spacing, type } from '../design/tokens';
import { ConsultationScreen } from '../features/assessmentConsultation/ConsultationScreen';
import { mockConsultationEngine } from '../features/assessmentConsultation/mockEngine';

/**
 * The consultation engine is being built on another branch, so this route is not yet a
 * product surface: nothing links to it, and without `?preview=1` it says so instead of
 * answering. The preview path runs a scripted mock and labels every answer as such, so a
 * fabricated consultation result can never reach a user who arrived here by accident.
 *
 * When the engine lands, swap `mockConsultationEngine` for it and drop the gate.
 */
export default function ConsultationRoute() {
  const router = useRouter();
  const { listingId, preview, seed } = useLocalSearchParams<{ listingId?: string; preview?: string; seed?: string }>();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  if (preview !== '1') {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScreenHeader title="AI 청약 상담" onBack={back} />
        <View style={styles.content}>
          <WanpanCard style={styles.card}>
            <Text accessibilityRole="header" style={styles.title}>공고 기반 상담은 준비 중이에요</Text>
            <Text style={styles.body}>
              공고 원문에서 조건을 읽어 답변하는 상담 기능을 만들고 있어요. 준비되면 공고 상세와 맞춤판정
              결과에서 바로 열 수 있어요. 지금은 맞춤판정으로 신청 가능 여부를 확인할 수 있어요.
            </Text>
            <PrimaryButton label="맞춤판정으로 확인하기" onPress={() => router.replace('/assessment' as Href)} />
          </WanpanCard>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ConsultationScreen
      engine={mockConsultationEngine}
      listingId={listingId ?? 'preview'}
      seededFrom={seed === 'assessment' ? 'ASSESSMENT_RESULT' : undefined}
      previewNotice="설계 검토용 미리보기예요. 답변은 실제 판정이 아니라 미리 작성된 예시이며, 실제 신청 판단에 사용할 수 없어요."
      onBack={back}
      onOpenAssessment={() => router.push((listingId ? `/assessment?listingId=${encodeURIComponent(listingId)}` : '/assessment') as Href)}
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
