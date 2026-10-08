import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { ServiceListing } from '../live/types.ts';
import { KioskButton } from './controls.tsx';
import { ListingMediaView } from './ListingMediaView.tsx';
import { liveListingPath } from './navigation.ts';
import { k } from './theme.ts';

const statusLabel = (listing: ServiceListing) => {
  if (listing.applicationStatus === 'OPEN') return '접수 중';
  if (listing.applicationStatus === 'UPCOMING') return '접수 예정';
  if (listing.applicationStatus === 'CLOSED') return '접수 마감';
  return '일정 확인 필요';
};

export function LiveListingCard({ listing }: { listing: ServiceListing }) {
  return (
    <View style={styles.card} testID={`live-listing-${listing.noticeId}`}>
      <ListingMediaView media={listing.media} variant="card" />
      <View style={styles.badges}>
        <Text style={styles.liveBadge}>실제 최신 공고</Text>
        <Text style={styles.infoBadge}>공고 정보만 제공</Text>
        <Text style={styles.statusBadge}>{statusLabel(listing)}</Text>
      </View>
      <Text style={styles.title} numberOfLines={2}>{listing.title}</Text>
      <Text style={styles.meta} numberOfLines={2}>{listing.address}</Text>
      <Text style={styles.period}>
        모집기간 {listing.applicationStart ?? '미정'} ~ {listing.applicationEnd ?? '미정'}
      </Text>
      <Text style={styles.notice}>검수된 Rule Package가 없어 자격 판정에는 포함하지 않아요.</Text>
      <KioskButton label="공고 정보 보기" icon="chevron-right" onPress={() => router.push(liveListingPath(listing.canonicalKey) as never)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexGrow: 1, flexBasis: 360, backgroundColor: k.colors.surface, borderRadius: 20, padding: 20, gap: 12, borderWidth: 1, borderColor: k.colors.outline },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  liveBadge: { ...k.type.label, color: k.colors.primary, backgroundColor: k.colors.lavender, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  infoBadge: { ...k.type.label, color: '#8A4900', backgroundColor: '#FFF4E5', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusBadge: { ...k.type.label, color: k.colors.textMuted, backgroundColor: k.colors.surfaceHighest, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  title: { ...k.type.section, color: k.colors.text },
  meta: { ...k.type.body, color: k.colors.textMuted },
  period: { ...k.type.bodyStrong, color: k.colors.text },
  notice: { ...k.type.caption, color: k.colors.textMuted },
});
