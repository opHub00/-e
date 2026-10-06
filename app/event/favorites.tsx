import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import type { KioskOutcome } from '../../features/eventKiosk/evaluate';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';
import { KioskButton } from '../../features/eventKiosk/ui/controls';
import { KioskFrame } from '../../features/eventKiosk/ui/KioskFrame';
import { goBack, resetToHome } from '../../features/eventKiosk/ui/navigation';
import { EmptyState, ListingCard } from '../../features/eventKiosk/ui/resultParts';
import { k } from '../../features/eventKiosk/ui/theme';

/** 관심 공고. 여러 개를 담아 두고 요약에 함께 가져간다. */
export default function FavoritesScreen() {
  const load = kioskEvent();
  const evaluation = useKioskStore(state => state.evaluation);
  const favorites = useKioskStore(state => state.favorites);
  if (!load.ok) return null;
  const brand = load.event.config.copy.brand;

  if (!evaluation) {
    return (
      <KioskFrame brand={brand} confirmHome={false}>
        <EmptyState title="아직 분석한 결과가 없어요" body="처음부터 정보를 입력하면 관심 공고를 담을 수 있어요." action={{ label: '처음부터 시작하기', onPress: resetToHome }} />
      </KioskFrame>
    );
  }
  const picked = favorites
    .map(id => evaluation.outcomes.find(outcome => outcome.id === id))
    .filter((outcome): outcome is KioskOutcome => Boolean(outcome));

  return (
    <KioskFrame
      brand={brand}
      progress={{ label: '관심 공고' }}
      footer={
        <>
          <KioskButton label="결과 목록" variant="ghost" icon="arrow-back" onPress={() => goBack('/event/results')} />
          <KioskButton testID="favorites-summary" label="결과 요약 받기" icon="qr-code-2" onPress={() => router.push('/event/summary' as never)} large />
        </>
      }
    >
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">관심 공고 {picked.length}개</Text>
        <Text style={styles.subtitle}>별표를 누른 공고예요. 결과 요약에 함께 담겨요.</Text>
      </View>
      {picked.length ? (
        <View style={styles.list} testID="favorites-list">
          {picked.map(outcome => <ListingCard key={outcome.id} outcome={outcome} />)}
        </View>
      ) : (
        <EmptyState title="담은 공고가 없어요" body="결과 목록에서 별표를 눌러 관심 공고를 담아 보세요." action={{ label: '결과 목록 보기', onPress: () => goBack('/event/results') }} />
      )}
    </KioskFrame>
  );
}

const styles = StyleSheet.create({
  head: { gap: 8, marginBottom: 24 },
  title: { ...k.type.hero, color: k.colors.text },
  subtitle: { ...k.type.bodyLg, color: k.colors.textMuted },
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
});
