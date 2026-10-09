import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BUCKET_LABELS, type KioskBucket } from '../../features/eventKiosk/evaluate';
import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import { HOUSEHOLD_TYPES } from '../../features/eventKiosk/model';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';
import { KioskButton, Notice } from '../../features/eventKiosk/ui/controls';
import { KioskFrame } from '../../features/eventKiosk/ui/KioskFrame';
import { BucketTiles, EmptyState, ListingCard } from '../../features/eventKiosk/ui/resultParts';
import { resetToHome } from '../../features/eventKiosk/ui/navigation';
import { k } from '../../features/eventKiosk/ui/theme';
import { Appear } from '../../components/motion/Appear';
import { travel } from '../../design/motion';
import { eventMotion } from '../../features/eventKiosk/motion/eventMotion';
import { StaggerList } from '../../features/eventKiosk/motion/StaggerList';
import { useFocusReplay } from '../../features/eventKiosk/motion/useFocusReplay';
import { useDensity } from '../../features/eventKiosk/layout/DensityContext';
import { useServiceListingPortfolio } from '../../features/eventKiosk/live/useServiceListingPortfolio';
import { LiveListingCard } from '../../features/eventKiosk/ui/LiveListingCard';

/** 결과 대시보드. 위에 세 묶음의 수, 아래에 모든 공고를 추천 순서대로. */
export default function ResultsScreen() {
  const load = kioskEvent();
  const evaluation = useKioskStore(state => state.evaluation);
  const stale = useKioskStore(state => state.stale);
  const favorites = useKioskStore(state => state.favorites);
  const householdType = useKioskStore(state => state.answers.householdType);
  const sessionKey = useKioskStore(state => state.sessionKey);
  const [filter, setFilter] = useState<KioskBucket | null>(null);
  const replay = useFocusReplay();
  // 카드 기준 폭·간격은 밀도를 따른다: desktop 은 한 줄에 세 장, iPad 는 두 장, 휴대폰은 한 장.
  const { d } = useDensity();
  const { portfolio: servicePortfolio, loading: liveLoading } = useServiceListingPortfolio(load.ok ? load.event.dataset : null);

  const outcomes = useMemo(
    () => (evaluation?.outcomes ?? []).filter(outcome => !filter || outcome.bucket === filter),
    [evaluation, filter],
  );
  const notes = useMemo(
    () => [...new Set((evaluation?.outcomes ?? []).map(outcome => outcome.listing.sourceNote))],
    [evaluation],
  );
  const liveInformationOnly = useMemo(
    () => (servicePortfolio?.listings ?? []).filter(listing => listing.origin === 'LIVE' && listing.assessmentAvailability === 'INFORMATION_ONLY'),
    [servicePortfolio],
  );

  if (!load.ok) return null;
  const brand = load.event.config.copy.brand;

  if (!evaluation) {
    return (
      <KioskFrame brand={brand} confirmHome={false}>
        <EmptyState title="아직 분석한 결과가 없어요" body="정보를 입력하면 내 조건으로 신청할 수 있는 공고를 보여 드려요." action={{ label: '처음부터 시작하기', onPress: resetToHome }} />
      </KioskFrame>
    );
  }

  const household = HOUSEHOLD_TYPES.find(type => type.key === householdType)?.label;
  const total = evaluation.outcomes.length;
  const listingCount = new Set(evaluation.outcomes.map(outcome => outcome.listing.listingId)).size;

  return (
    <KioskFrame
      brand={brand}
      progress={{ label: '분석 결과' }}
      scrollKey={`${sessionKey}-results`}
      footer={
        <>
          <KioskButton testID="open-favorites" label={`관심 공고 ${favorites.length}개`} icon="star" variant="soft" onPress={() => router.push('/event/favorites' as never)} />
          <View style={styles.footerAction}><KioskButton testID="open-summary" label="결과 요약 받기" icon="qr-code-2" onPress={() => router.push('/event/summary' as never)} large grow /></View>
        </>
      }
    >
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header" testID="results-title">
          {load.event.config.regionLabel} 공고 {listingCount}개, 공급 {total}건을 분석했어요
        </Text>
        <Text style={styles.subtitle}>{household ? `${household} 기준이에요. ` : ''}공고 하나에 공급이 여럿이면 공급마다 따로 보여 드려요.</Text>
      </View>

      {stale ? (
        <View style={styles.block}>
          <Notice tone="warn">입력한 정보가 바뀌었어요. 아래 결과는 바뀌기 전 기준이에요.</Notice>
          <KioskButton testID="reanalyze" label="바뀐 정보로 다시 분석하기" icon="refresh" onPress={() => router.push('/event/analysis' as never)} />
        </View>
      ) : null}

      {/* 요약 숫자가 먼저, 결과 카드는 그다음 차례로. 필터를 바꿀 때도 같은 순서로 다시 보인다. */}
      <Appear replayKey={replay} distance={travel.sm}>
        <BucketTiles counts={evaluation.counts} selected={filter} onSelect={setFilter} />
      </Appear>

      <View style={styles.listHead}>
        <Text style={styles.section} accessibilityRole="header">
          {filter ? `${BUCKET_LABELS[filter]} 공고` : '추천 순서로 본 전체 공고'}
        </Text>
        {filter ? <KioskButton label="전체 보기" variant="ghost" onPress={() => setFilter(null)} /> : null}
      </View>
      <Text style={styles.orderNote}>
        신청 가능 → 추가 확인 필요 → 신청 어려움 순서이고, 같은 묶음 안에서는 완판e 추천도가 높은 순서예요. 완판e 추천도는 공고 배점과 다른 값이에요.
      </Text>

      {outcomes.length ? (
        <StaggerList key={filter ?? 'all'} after={eventMotion.sequence} style={[styles.list, { gap: d.gridGap }]} itemStyle={[styles.listItem, { flexBasis: d.cardBasis }]} testID="results-list">
          {outcomes.map(outcome => <ListingCard key={outcome.id} outcome={outcome} />)}
        </StaggerList>
      ) : (
        evaluation.outcomes.length
          ? <EmptyState title={`${filter ? BUCKET_LABELS[filter] : ''} 공고가 없어요`} body="다른 묶음을 눌러 보세요." action={{ label: '전체 보기', onPress: () => setFilter(null) }} />
          : <EmptyState title="분석할 수 있는 공고를 찾지 못했어요" body="입력을 다시 확인하거나 처음부터 다시 시작해 주세요. 계속되면 행사 안내 직원에게 알려 주세요." action={{ label: '처음부터 시작하기', onPress: resetToHome }} />
      )}

      <View style={styles.liveSection} testID="live-listings-section">
        <View style={styles.listHead}>
          <Text style={styles.section} accessibilityRole="header">최신 제주 공고</Text>
          <Text style={styles.liveCount}>{liveLoading ? '확인 중' : `${liveInformationOnly.length}개`}</Text>
        </View>
        <Text style={styles.orderNote}>공식 source에서 가져온 최신 공고예요. 검수된 Rule Package가 없는 공고는 정보만 제공하고 현재 판정 결과에는 섞지 않아요.</Text>
        {liveInformationOnly.length ? (
          <View style={[styles.list, { gap: d.gridGap }]}>{liveInformationOnly.map(listing => <LiveListingCard key={listing.canonicalKey} listing={listing} />)}</View>
        ) : (
          <Notice tone="info">현재 새로 연결된 제주 공고가 없거나 공식 source를 확인하는 중이에요. 위 판정은 검수된 frozen dataset으로 계속 이용할 수 있어요.</Notice>
        )}
      </View>

      <View style={styles.notes}>
        {notes.map(note => <Text key={note} style={styles.note}>· {note}</Text>)}
        <Text style={styles.note}>· 이 결과는 입력한 정보로 계산한 예상이에요. 실제 신청 자격은 모집공고와 증빙 서류로 확정돼요.</Text>
      </View>
    </KioskFrame>
  );
}

const styles = StyleSheet.create({
  head: { gap: 8, marginBottom: 28 },
  title: { ...k.type.hero, color: k.colors.text },
  subtitle: { ...k.type.bodyLg, color: k.colors.textMuted },
  block: { gap: 12, marginBottom: 24, alignItems: 'flex-start' },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 40, gap: 12 },
  section: { ...k.type.title, color: k.colors.text },
  orderNote: { ...k.type.body, color: k.colors.textMuted, marginTop: 6, marginBottom: 20 },
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  /** 카드(resultParts)의 flex 몫과 같게. 감싸는 등장 래퍼 때문에 줄 배치가 바뀌지 않게. */
  // 래퍼를 row 로 두어야 카드의 flexBasis 가 높이가 아니라 폭으로 읽힌다.
  listItem: { flexGrow: 1, flexBasis: 360, flexDirection: 'row' },
  notes: { gap: 6, marginTop: 32 },
  note: { ...k.type.caption, color: k.colors.textMuted },
  footerAction: { flex: 1, maxWidth: 520, flexDirection: 'row' },
  liveSection: { gap: 12, marginTop: 40 },
  liveCount: { ...k.type.bodyStrong, color: k.colors.primary },
});
