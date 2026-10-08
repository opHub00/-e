import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAttached } from '../../features/adminPortal/useIsWide';
import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import type { KioskOutcome } from '../../features/eventKiosk/evaluate';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';
import { KioskButton, Notice } from '../../features/eventKiosk/ui/controls';
import { KioskFrame } from '../../features/eventKiosk/ui/KioskFrame';
import { chatPath, goBack, resetToHome } from '../../features/eventKiosk/ui/navigation';
import { EmptyState, FavoriteToggle, OfficialScoreBlock, OfficialScoreStateBlock, StageBadge, StatusBadge, WanpanBlock } from '../../features/eventKiosk/ui/resultParts';
import type { OfficialScoreState } from '../../features/eventKiosk/evaluate';
import { k } from '../../features/eventKiosk/ui/theme';
import { listingMediaOf } from '../../features/eventKiosk/media/listingMedia';
import { ListingGallery } from '../../features/eventKiosk/media/ListingMediaView';
import { ConditionsSection, OrderSection, ScoreSection, SourcesSection, VerdictSection } from '../../features/eventKiosk/experience/ExplanationSections';
import type { ListingExplanation } from '../../features/eventKiosk/experience/explain';
import { useListingExplanation } from '../../features/eventKiosk/experience/useExplanation';
import { ListingMediaView } from '../../features/eventKiosk/ui/ListingMediaView';

/** 공고 상세. 왜 이 결과인지, 왜 이 순서인지, 공고의 어디에 근거하는지. */
export default function ListingDetail() {
  const load = kioskEvent();
  const attached = useAttached();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const evaluation = useKioskStore(state => state.evaluation);
  if (!load.ok) return null;
  const brand = load.event.config.copy.brand;
  // 주소의 id 는 미리 그린 화면에 없다. 이어받은 뒤에 내용을 그린다.
  if (!attached) return <KioskFrame brand={brand}><View /></KioskFrame>;

  const outcome = evaluation?.outcomes.find(item => item.id === id) ?? null;
  if (!outcome) {
    return (
      <KioskFrame brand={brand} confirmHome={false}>
        <EmptyState
          title="공고 결과를 찾을 수 없어요"
          body={evaluation ? '결과 화면에서 공고를 다시 골라 주세요.' : '처음부터 정보를 입력하면 공고별 결과를 보여 드려요.'}
          action={evaluation ? { label: '결과로 돌아가기', onPress: () => goBack('/event/results') } : { label: '처음부터 시작하기', onPress: resetToHome }}
        />
      </KioskFrame>
    );
  }

  return (
    <KioskFrame
      brand={brand}
      chatContextId={outcome.id}
      progress={{ label: `추천 순서 ${outcome.rank}번째 · 공고 상세` }}
      scrollKey={outcome.id}
      footer={
        <>
          <KioskButton label="결과 목록" variant="ghost" icon="arrow-back" onPress={() => goBack('/event/results')} testID="detail-back" />
          <View style={styles.footerRight}>
            <FavoriteToggle outcomeId={outcome.id} />
            <KioskButton label="이 공고 AI에게 묻기" icon="forum" onPress={() => router.push(chatPath(outcome.id) as never)} large />
          </View>
        </>
      }
    >
      <DetailBody outcome={outcome} />
    </KioskFrame>
  );
}

/** 판정 요약 → 조건 → 공식 점수 상태 → 순서 → 일정 → 근거. 문구는 모두 설명 계층에서 온다. */
function DetailBody({ outcome }: { outcome: KioskOutcome }) {
  const explanation = useListingExplanation(outcome);
  return (
    <>
      <Header outcome={outcome} explanation={explanation} />
      <View style={styles.sections}>
        <VerdictSection explanation={explanation} />
        <ConditionsSection explanation={explanation} outcome={outcome} />
        <ScoreSection explanation={explanation} />
        <OrderSection explanation={explanation} outcome={outcome} />
        <Schedule outcome={outcome} />
        <SourcesSection explanation={explanation} />
      </View>
    </>
  );
}

function Header({ outcome, explanation }: { outcome: KioskOutcome; explanation: ListingExplanation }) {
  const { listing } = outcome;
  return (
    <View style={styles.header} testID="listing-detail">
      <ListingMediaView media={listing.media} variant="detail" testID="listing-detail-media" />
      <Text style={styles.title} accessibilityRole="header">{listing.title}</Text>
      <Text style={styles.meta}>
        {outcome.supplyType ? `${outcome.supplyLabel} · ` : ''}{listing.housingType} · {listing.address ?? listing.district}
      </Text>
      <View style={styles.badges}>
        <StatusBadge outcome={outcome} large />
        {outcome.stageLabel ? <StageBadge label={outcome.stageLabel} /> : null}
      </View>
      {/* 판정 상태를 먼저 보여 준 다음, 신청할 집을 실제로 본다. 이미지가 없으면 placeholder. */}
      <ListingGallery
        media={listingMediaOf(listing as unknown as { title: string } & Record<string, unknown>)}
        housingType={listing.housingType}
        district={listing.district}
        title={listing.title}
      />
      <View style={styles.scores}>
        {outcome.officialScore
          ? <OfficialScoreBlock score={outcome.officialScore} />
          : <OfficialScoreStateBlock state={outcome.officialScoreState as Exclude<OfficialScoreState, { status: 'AVAILABLE' }>} title={explanation.score.title} note={explanation.score.body} />}
        <WanpanBlock wanpan={outcome.wanpan} />
      </View>
      <Notice>{listing.sourceNote}</Notice>
    </View>
  );
}

function Block({ title, icon, children, testID }: { title: string; icon: React.ComponentProps<typeof MaterialIcons>['name']; children: ReactNode; testID?: string }) {
  return (
    <View style={styles.block} testID={testID}>
      <View style={styles.blockHead}>
        <MaterialIcons name={icon} size={26} color={k.colors.primary} />
        <Text style={styles.blockTitle} accessibilityRole="header">{title}</Text>
      </View>
      <View style={styles.blockBody}>{children}</View>
    </View>
  );
}

const fmt = (date: string | null) => (date ? date.replace(/-/g, '.') : null);

function Schedule({ outcome }: { outcome: KioskOutcome }) {
  const { listing } = outcome;
  const rows: [string, string][] = [];
  if (listing.announcementDate) rows.push(['모집공고일', fmt(listing.announcementDate)!]);
  if (listing.recruitment.startDate) {
    rows.push(['청약 접수', `${fmt(listing.recruitment.startDate)}${listing.recruitment.endDate ? ` ~ ${fmt(listing.recruitment.endDate)}` : ''}`]);
  }
  if (listing.winnerAnnouncementDate) rows.push(['당첨자 발표', fmt(listing.winnerAnnouncementDate)!]);
  if (listing.households) rows.push(['공급 세대', `${listing.households}세대`]);
  return (
    <Block title="중요 일정" icon="event" testID="detail-schedule">
      {rows.length ? (
        <View style={styles.table}>
          {rows.map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={[styles.lineText, { flex: 1 }]}>{label}</Text>
              <Text style={styles.points}>{value}</Text>
            </View>
          ))}
        </View>
      ) : <Text style={styles.muted}>아직 확정된 일정이 없어요. 최종 공고가 나오면 일정이 정해져요.</Text>}
    </Block>
  );
}

const styles = StyleSheet.create({
  footerRight: { flex: 1, flexDirection: 'row', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' },
  header: { gap: 14 },
  title: { ...k.type.hero, color: k.colors.text },
  meta: { ...k.type.bodyLg, color: k.colors.textMuted },
  badges: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  scores: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  sections: { gap: 20, marginTop: 32 },
  block: { backgroundColor: k.colors.surface, borderRadius: 20, padding: 24, gap: 14, borderWidth: 1, borderColor: k.colors.outline },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  blockTitle: { ...k.type.section, color: k.colors.text },
  blockBody: { gap: 12 },
  body: { ...k.type.bodyLg, color: k.colors.text },
  muted: { ...k.type.body, color: k.colors.textMuted },
  subhead: { ...k.type.bodyStrong, color: k.colors.textMuted, marginTop: 4 },
  lines: { gap: 10 },
  line: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  lineText: { ...k.type.body, color: k.colors.text, flexShrink: 1 },
  factors: { gap: 8 },
  factor: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: k.colors.hairline },
  factorEffect: { ...k.type.bodyStrong, color: k.colors.primary },
  table: { gap: 0 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: k.colors.hairline, alignItems: 'center' },
  rowTotal: { borderBottomWidth: 0 },
  points: { ...k.type.bodyLgStrong, color: k.colors.text },
  evidence: { gap: 4, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: k.colors.hairline },
  excerpt: { ...k.type.caption, color: k.colors.textMuted, fontStyle: 'italic' },
});
