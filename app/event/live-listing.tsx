import { Linking, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import { useServiceListingPortfolio } from '../../features/eventKiosk/live/useServiceListingPortfolio';
import { ListingGallery } from '../../features/eventKiosk/media/ListingMediaView';
import { KioskButton, Notice } from '../../features/eventKiosk/ui/controls';
import { KioskFrame } from '../../features/eventKiosk/ui/KioskFrame';
import { EmptyState } from '../../features/eventKiosk/ui/resultParts';
import { goBack } from '../../features/eventKiosk/ui/navigation';
import { k } from '../../features/eventKiosk/ui/theme';

const fmt = (value: string | null) => value?.replace(/-/g, '.') ?? '미정';

export default function LiveListingDetail() {
  const load = kioskEvent();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { portfolio, loading } = useServiceListingPortfolio(load.ok ? load.event.dataset : null);
  if (!load.ok) return null;
  const listing = portfolio?.listings.find(item => item.canonicalKey === id && item.origin === 'LIVE') ?? null;
  if (!listing) {
    return (
      <KioskFrame brand={load.event.config.copy.brand} confirmHome={false}>
        <EmptyState
          title={loading ? '최신 공고를 확인하고 있어요' : '공고 정보를 찾을 수 없어요'}
          body={loading ? '잠시만 기다려 주세요.' : '최신 공고 목록에서 다시 선택해 주세요.'}
          action={{ label: '결과로 돌아가기', onPress: () => goBack('/event/results') }}
        />
      </KioskFrame>
    );
  }
  return (
    <KioskFrame
      brand={load.event.config.copy.brand}
      progress={{ label: '최신 공고 정보' }}
      scrollKey={listing.canonicalKey}
      footer={
        <>
          <KioskButton label="결과 목록" variant="ghost" icon="arrow-back" onPress={() => goBack('/event/results')} />
          <KioskButton label="공식 공고 열기" icon="open-in-new" onPress={() => void Linking.openURL(listing.sourceUrl)} large />
        </>
      }
    >
      <View style={styles.header} testID="live-listing-detail">
        <View testID="live-listing-media">
          <ListingGallery media={listing.media} housingType={listing.supplyTypes.join(' · ')} district={listing.region} title={listing.title} />
        </View>
        <View style={styles.badges}>
          <Text style={styles.liveBadge}>실제 최신 공고</Text>
          <Text style={styles.infoBadge}>공고 정보만 제공</Text>
        </View>
        <Text style={styles.title} accessibilityRole="header">{listing.title}</Text>
        <Text style={styles.meta}>{listing.address}</Text>
        <Notice tone="warn">검수된 Rule Package가 없어 COMPLETE 또는 신청 가능 판정을 만들지 않아요.</Notice>
      </View>
      <View style={styles.block}>
        <Text style={styles.section}>모집 정보</Text>
        <Row label="공고기관" value={listing.provider} />
        <Row label="모집공고일" value={fmt(listing.announcementDate)} />
        <Row label="접수기간" value={`${fmt(listing.applicationStart)} ~ ${fmt(listing.applicationEnd)}`} />
        <Row label="결과 발표" value={fmt(listing.resultDate)} />
        <Row label="공급유형" value={listing.supplyTypes.join(' · ')} />
        {listing.units[0]?.households !== null ? <Row label="공급 세대" value={`${listing.units[0]?.households}세대`} /> : null}
      </View>
      <View style={styles.block}>
        <Text style={styles.section}>공식 source</Text>
        <Text style={styles.body}>{listing.sourceUrl}</Text>
        <Text style={styles.caption}>수집 시각 {new Date(listing.fetchedAt).toLocaleString('ko-KR')}</Text>
      </View>
    </KioskFrame>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  header: { gap: 14 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  liveBadge: { ...k.type.label, color: k.colors.primary, backgroundColor: k.colors.lavender, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  infoBadge: { ...k.type.label, color: '#8A4900', backgroundColor: '#FFF4E5', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  title: { ...k.type.hero, color: k.colors.text },
  meta: { ...k.type.bodyLg, color: k.colors.textMuted },
  block: { marginTop: 24, borderRadius: 20, borderWidth: 1, borderColor: k.colors.outline, backgroundColor: k.colors.surface, padding: 24, gap: 12 },
  section: { ...k.type.section, color: k.colors.text },
  row: { flexDirection: 'row', gap: 16, justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: k.colors.hairline },
  label: { ...k.type.body, color: k.colors.textMuted },
  value: { ...k.type.bodyStrong, color: k.colors.text, textAlign: 'right', flexShrink: 1 },
  body: { ...k.type.body, color: k.colors.text },
  caption: { ...k.type.caption, color: k.colors.textMuted },
});
