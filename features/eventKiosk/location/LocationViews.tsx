import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import type { ListingHighlight, ListingLocation, NearbyPoi } from '../live/types';
import { useDensity } from '../layout/DensityContext';
import { k } from '../ui/theme';

type IconName = ComponentProps<typeof MaterialIcons>['name'];
const CATEGORY_LABEL: Record<NearbyPoi['category'], string> = {
  TRANSIT: '대중교통', EDUCATION: '학교·교육', HOSPITAL: '병원', SHOPPING: '마트·편의', PARK: '공원', GOVERNMENT: '관공서', LANDMARK: '주요 거점',
};
const CATEGORY_ICON: Record<NearbyPoi['category'], IconName> = {
  TRANSIT: 'directions-bus', EDUCATION: 'school', HOSPITAL: 'local-hospital', SHOPPING: 'shopping-cart', PARK: 'park', GOVERNMENT: 'account-balance', LANDMARK: 'place',
};

export const formatDistance = (meters: number) => meters >= 1_000 ? `${(meters / 1_000).toFixed(1)}km` : `${Math.max(10, Math.round(meters / 10) * 10)}m`;
function mapUrl(location: ListingLocation, title: string): string | null {
  if (location.latitude === null || location.longitude === null) return null;
  return `https://map.kakao.com/link/map/${encodeURIComponent(title)},${location.latitude},${location.longitude}`;
}

export function LocationSummary({ location, nearby, title }: { location: ListingLocation; nearby: NearbyPoi[]; title: string }) {
  const { d } = useDensity();
  const url = mapUrl(location, title);
  return (
    <View style={[styles.summary, { padding: d.cardPadding, gap: d.cardGap }]} testID="location-summary">
      <View style={styles.row}><MaterialIcons name="place" size={20} color={k.colors.primary} /><Text style={[d.type.section, { color: k.colors.text, flex: 1 }]} accessibilityRole="header">위치와 주변 생활</Text></View>
      {location.normalizedAddress ? <Text style={[d.type.body, { color: k.colors.text }]}>{location.normalizedAddress}</Text> : null}
      {nearby.length ? <View style={styles.chips}>{nearby.slice(0, 3).map(place => <View key={place.id} style={styles.chip}><MaterialIcons name={CATEGORY_ICON[place.category]} size={14} color={k.colors.primary} /><Text style={[d.type.caption, { color: k.colors.text }]}>{CATEGORY_LABEL[place.category]} {formatDistance(place.straightDistanceMeters)}</Text></View>)}</View> : null}
      {url ? <MotionPressable accessibilityRole="link" accessibilityLabel="지도 앱에서 위치 보기" onPress={() => void Linking.openURL(url)} style={styles.link}><MaterialIcons name="open-in-new" size={16} color={k.colors.primary} /><Text style={[d.type.label, { color: k.colors.primary }]}>지도 앱에서 보기</Text></MotionPressable> : null}
    </View>
  );
}

export function NearbyPlaces({ places }: { places: NearbyPoi[] }) {
  const { d } = useDensity();
  if (!places.length) return null;
  const sources = [...new Set(places.map(place => place.source).filter(Boolean))];
  return (
    <View style={[styles.summary, { padding: d.cardPadding, gap: d.cardGap }]} testID="nearby-places">
      <Text style={[d.type.section, { color: k.colors.text }]} accessibilityRole="header">가까운 시설</Text>
      <View style={[styles.grid, { gap: d.gridGap }]}>{places.map(place => <View key={place.id} style={[styles.place, { paddingHorizontal: d.controlPaddingX, paddingVertical: 10, flexBasis: d.cardBasis / 2 }]}><View style={styles.placeIcon}><MaterialIcons name={CATEGORY_ICON[place.category]} size={20} color={k.colors.primary} /></View><View style={{ flex: 1 }}><Text style={[d.type.bodyStrong, { color: k.colors.text }]} numberOfLines={1}>{place.name}</Text><Text style={[d.type.caption, { color: k.colors.textMuted }]}>{CATEGORY_LABEL[place.category]}</Text></View><Text style={[d.type.label, { color: k.colors.primary }]}>{formatDistance(place.straightDistanceMeters)}</Text></View>)}</View>
      {sources.length ? <Text style={[d.type.caption, { color: k.colors.textSubtle }]}>주변 시설 출처 · {sources.join(', ')}</Text> : null}
    </View>
  );
}

export function ListingMap({ location, nearby, title }: { location: ListingLocation; nearby: NearbyPoi[]; title: string }) {
  const { d } = useDensity();
  if (location.latitude === null || location.longitude === null) return null;
  const center = { lat: location.latitude, lng: location.longitude };
  const cos = Math.cos((center.lat * Math.PI) / 180);
  const offsets = nearby.map(place => ({ place, x: (place.longitude - center.lng) * cos, y: -(place.latitude - center.lat) }));
  const reach = Math.max(0.0005, ...offsets.map(item => Math.max(Math.abs(item.x), Math.abs(item.y))));
  const pos = (value: number) => `${50 + (value / reach) * 36}%`;
  const url = mapUrl(location, title);
  return (
    <View style={[styles.map, { borderRadius: d.cardPadding }]} testID="listing-map" accessibilityLabel={`${title} 위치 개요도, 주변 시설 ${nearby.length}곳`}>
      <View style={styles.mapGrid} pointerEvents="none">{[25, 50, 75].map(line => <View key={`h${line}`} style={[styles.mapLineH, { top: `${line}%` }]} />)}{[25, 50, 75].map(line => <View key={`v${line}`} style={[styles.mapLineV, { left: `${line}%` }]} />)}</View>
      {offsets.map(({ place, x, y }) => <View key={place.id} style={[styles.poi, { left: pos(x), top: pos(y) } as object]} accessibilityLabel={`${place.name}, ${formatDistance(place.straightDistanceMeters)}`}><MaterialIcons name={CATEGORY_ICON[place.category]} size={14} color={k.colors.onPrimary} /></View>)}
      <View style={[styles.pin, { left: '50%', top: '50%' } as object]}><MaterialIcons name="home" size={20} color={k.colors.onPrimary} /></View>
      <Text style={[styles.mapNote, d.type.caption]}>위치 개요도 · 실제 지도와 거리 비율이 다를 수 있어요</Text>
      {url ? <MotionPressable accessibilityRole="link" accessibilityLabel="지도 앱에서 크게 보기" onPress={() => void Linking.openURL(url)} style={styles.mapOpen} testID="listing-map-open"><MaterialIcons name="open-in-new" size={16} color={k.colors.primary} /><Text style={[d.type.label, { color: k.colors.primary }]}>지도 앱에서 보기</Text></MotionPressable> : null}
    </View>
  );
}

export function ListingFeatures({ features }: { features: ListingHighlight[] }) {
  const { d } = useDensity();
  if (!features.length) return null;
  return <View style={[styles.features, { padding: d.cardPadding, gap: d.cardGap }]} testID="listing-features"><View style={styles.row}><MaterialIcons name="verified" size={20} color={k.tint.green.fg} /><Text style={[d.type.section, { color: k.colors.text }]} accessibilityRole="header">이 주택의 특징</Text></View>{features.map(feature => <View key={`${feature.category}:${feature.text}`} style={styles.featureRow}><MaterialIcons name="check-circle" size={18} color={k.tint.green.fg} /><View style={{ flex: 1, gap: 2 }}><Text style={[d.type.body, { color: k.colors.text }]}>{feature.text}</Text><Text style={[d.type.caption, { color: k.colors.textMuted }]}>근거 · {feature.evidence.source}</Text></View></View>)}</View>;
}

export function ListingCautions({ items }: { items: string[] }) {
  const { d } = useDensity();
  if (!items.length) return null;
  return <View style={[styles.cautions, { padding: d.cardPadding, gap: d.cardGap }]} testID="listing-cautions"><View style={styles.row}><MaterialIcons name="error-outline" size={20} color={k.tint.amber.fg} /><Text style={[d.type.section, { color: k.colors.text }]} accessibilityRole="header">확인할 점</Text></View>{items.map(item => <View key={item} style={styles.featureRow}><MaterialIcons name="priority-high" size={18} color={k.tint.amber.fg} /><Text style={[d.type.body, { color: k.colors.text, flex: 1 }]}>{item}</Text></View>)}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, summary: { borderRadius: 16, borderWidth: 1, borderColor: k.colors.outline, backgroundColor: k.colors.surface }, link: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: k.colors.lavender, alignSelf: 'flex-start' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: k.colors.surfaceLow }, grid: { flexDirection: 'row', flexWrap: 'wrap' }, place: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: k.colors.outline, backgroundColor: k.colors.surface }, placeIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: k.colors.lavender, alignItems: 'center', justifyContent: 'center' }, map: { width: '100%', aspectRatio: 16 / 9, maxHeight: 360, overflow: 'hidden', backgroundColor: '#EEF1F6', borderWidth: 1, borderColor: k.colors.outline }, mapGrid: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }, mapLineH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#DCE1EA' }, mapLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: '#DCE1EA' }, poi: { position: 'absolute', width: 26, height: 26, marginLeft: -13, marginTop: -13, borderRadius: 13, backgroundColor: '#7B87A6', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: k.colors.surface }, pin: { position: 'absolute', width: 40, height: 40, marginLeft: -20, marginTop: -20, borderRadius: 20, backgroundColor: k.colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: k.colors.surface }, mapNote: { position: 'absolute', left: 12, bottom: 10, color: k.colors.textMuted }, mapOpen: { position: 'absolute', right: 10, top: 10, flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: k.colors.surface }, features: { borderRadius: 16, backgroundColor: k.tint.green.bg }, cautions: { borderRadius: 16, backgroundColor: k.tint.amber.bg }, featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
});
