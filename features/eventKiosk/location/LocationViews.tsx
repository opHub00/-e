import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { useDensity } from '../layout/DensityContext';
import { k } from '../ui/theme';
import {
  externalMapUrl,
  formatDistance,
  POI_CATEGORY_ICONS,
  POI_CATEGORY_LABELS,
  type ListingLocation,
  type NearbyPlace,
  type PoiCategory,
} from './locationModel';
import { FEATURE_KIND_ICONS, type VerifiedFeature } from './listingFeatures';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

function openUrl(url: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
  else void Linking.openURL(url).catch(() => undefined);
}

/** '도보 7분 · 470m' 같은 거리 표시. 카드·목록 어디서나 같은 모양. */
export function DistanceBadge({ place, tone = 'neutral' }: { place: Pick<NearbyPlace, 'distanceMeters' | 'walkMinutes'>; tone?: 'neutral' | 'primary' }) {
  const { d } = useDensity();
  const { primary, secondary } = formatDistance(place);
  return (
    <View style={[styles.badge, tone === 'primary' && styles.badgePrimary]} accessibilityLabel={secondary ? `${primary}, ${secondary}` : primary} testID="distance-badge">
      <MaterialIcons name={primary.startsWith('도보') ? 'directions-walk' : 'straighten'} size={14} color={tone === 'primary' ? k.colors.primary : k.colors.textMuted} />
      <Text style={[d.type.label, { color: tone === 'primary' ? k.colors.primary : k.colors.text }]}>{primary}</Text>
      {secondary ? <Text style={[d.type.caption, { color: k.colors.textMuted }]}>{secondary}</Text> : null}
    </View>
  );
}

/** 주소와 주변 시설 요약 한 덩어리. 위치 정보가 없으면 아무것도 그리지 않는다. */
export function LocationSummary({ location, nearby, title }: { location: ListingLocation | null; nearby: NearbyPlace[]; title: string }) {
  const { d } = useDensity();
  if (!location && !nearby.length) return null;
  const categories = [...new Set(nearby.map(place => place.category))].slice(0, 4);
  const mapUrl = location ? externalMapUrl(location, title) : null;
  return (
    <View style={[styles.summary, { padding: d.cardPadding, gap: d.cardGap }]} testID="location-summary">
      <View style={styles.row}>
        <MaterialIcons name="place" size={20} color={k.colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[d.type.bodyStrong, { color: k.colors.text }]} numberOfLines={2}>{location?.address ?? location?.district ?? '위치 정보 확인 중'}</Text>
          {location?.precision && location.precision !== 'EXACT' ? (
            <Text style={[d.type.caption, { color: k.colors.textMuted }]}>{location.precision === 'DISTRICT' ? '행정구역 기준 위치예요' : '대략적인 위치예요'}</Text>
          ) : null}
        </View>
        {mapUrl ? (
          <MotionPressable accessibilityRole="link" accessibilityLabel="지도 앱에서 보기" onPress={() => openUrl(mapUrl)} style={styles.link} testID="location-open-map">
            <Text style={[d.type.label, { color: k.colors.primary }]}>지도 보기</Text>
            <MaterialIcons name="open-in-new" size={16} color={k.colors.primary} />
          </MotionPressable>
        ) : null}
      </View>
      {categories.length ? (
        <View style={styles.chips}>
          {categories.map(category => (
            <View key={category} style={styles.chip}>
              <MaterialIcons name={POI_CATEGORY_ICONS[category] as IconName} size={14} color={k.colors.textMuted} />
              <Text style={[d.type.caption, { color: k.colors.text }]}>{POI_CATEGORY_LABELS[category]}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {location?.source ? <Text style={[d.type.caption, { color: k.colors.textSubtle }]}>위치 출처 · {location.source.label}</Text> : null}
    </View>
  );
}

/** 주변 시설 목록. 종류별 아이콘, 거리, 출처. */
export function NearbyPlaces({ places, max = 6 }: { places: NearbyPlace[]; max?: number }) {
  const { d, density } = useDensity();
  if (!places.length) return null;
  const shown = places.slice(0, max);
  const sources = [...new Set(shown.map(place => place.source?.label).filter(Boolean))];
  return (
    <View style={{ gap: d.cardGap }} testID="nearby-places">
      <View style={[styles.grid, { gap: d.cardGap }]}>
        {shown.map(place => (
          <View key={place.id} style={[styles.place, { flexBasis: density === 'touch' ? '100%' : 260, padding: density === 'compact' ? 12 : 16 }]}>
            <View style={styles.placeIcon}><MaterialIcons name={POI_CATEGORY_ICONS[place.category] as IconName} size={18} color={k.colors.primary} /></View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[d.type.bodyStrong, { color: k.colors.text }]} numberOfLines={1}>{place.name}</Text>
              <Text style={[d.type.caption, { color: k.colors.textMuted }]}>{POI_CATEGORY_LABELS[place.category]}</Text>
            </View>
            <DistanceBadge place={place} />
          </View>
        ))}
      </View>
      {sources.length ? <Text style={[d.type.caption, { color: k.colors.textSubtle }]}>주변 시설 출처 · {sources.join(', ')}</Text> : null}
    </View>
  );
}

const MAP_PADDING = 0.14;

/**
 * 공고 위치 지도. 지금은 provider SDK 없이 좌표로 그린 개요도다(공고 핀 + 주변 시설 점).
 * provider 를 붙일 때는 renderProvider 로 실제 지도를 넣으면 같은 자리·같은 크기로 바뀐다.
 * 좌표가 없으면 그리지 않는다.
 */
export function ListingMap({ location, nearby, title, renderProvider }: {
  location: ListingLocation | null;
  nearby: NearbyPlace[];
  title: string;
  renderProvider?: (location: ListingLocation, nearby: NearbyPlace[]) => ReactNode;
}) {
  const { d } = useDensity();
  if (!location || location.lat === null || location.lng === null) return null;
  const center = { lat: location.lat, lng: location.lng };
  const points = nearby.filter(place => place.lat !== null && place.lng !== null);
  // 위도 1도 ≈ 111km, 경도는 위도에 따라 줄어든다. 가장 먼 점이 가장자리 안쪽에 오도록 맞춘다.
  const cos = Math.cos((center.lat * Math.PI) / 180);
  const offsets = points.map(place => ({ place, x: (place.lng! - center.lng) * cos, y: -(place.lat! - center.lat) }));
  const reach = Math.max(0.0005, ...offsets.map(item => Math.max(Math.abs(item.x), Math.abs(item.y))));
  const pos = (value: number) => `${50 + (value / reach) * (50 - MAP_PADDING * 100)}%`;
  const mapUrl = externalMapUrl(location, title);
  return (
    <View style={[styles.map, { borderRadius: d.cardPadding }]} testID="listing-map" accessibilityLabel={`${title} 위치 지도, 주변 시설 ${points.length}곳`}>
      {renderProvider ? renderProvider(location, nearby) : (
        <>
          <View style={styles.mapGrid} pointerEvents="none">
            {[25, 50, 75].map(line => <View key={`h${line}`} style={[styles.mapLineH, { top: `${line}%` }]} />)}
            {[25, 50, 75].map(line => <View key={`v${line}`} style={[styles.mapLineV, { left: `${line}%` }]} />)}
          </View>
          {offsets.map(({ place, x, y }) => (
            <View key={place.id} style={[styles.poi, { left: pos(x), top: pos(y) } as object]} accessibilityLabel={`${place.name}, ${formatDistance(place).primary}`}>
              <MaterialIcons name={POI_CATEGORY_ICONS[place.category] as IconName} size={14} color={k.colors.onPrimary} />
            </View>
          ))}
          <View style={[styles.pin, { left: '50%', top: '50%' } as object]}>
            <MaterialIcons name="home" size={20} color={k.colors.onPrimary} />
          </View>
          <Text style={[styles.mapNote, d.type.caption]}>위치 개요도 · 실제 지도와 거리 비율이 다를 수 있어요</Text>
        </>
      )}
      {mapUrl ? (
        <MotionPressable accessibilityRole="link" accessibilityLabel="지도 앱에서 크게 보기" onPress={() => openUrl(mapUrl)} style={styles.mapOpen} testID="listing-map-open">
          <MaterialIcons name="open-in-new" size={16} color={k.colors.primary} />
          <Text style={[d.type.label, { color: k.colors.primary }]}>지도 앱에서 보기</Text>
        </MotionPressable>
      ) : null}
    </View>
  );
}

/** '이 주택의 특징'. 검증된 항목만, 출처와 함께. 없으면 그리지 않는다. */
export function ListingFeatures({ features }: { features: VerifiedFeature[] }) {
  const { d } = useDensity();
  if (!features.length) return null;
  return (
    <View style={[styles.features, { padding: d.cardPadding, gap: d.cardGap }]} testID="listing-features">
      <View style={styles.row}>
        <MaterialIcons name="verified" size={20} color={k.tint.green.fg} />
        <Text style={[d.type.section, { color: k.colors.text }]} accessibilityRole="header">이 주택의 특징</Text>
      </View>
      {features.map(feature => (
        <View key={feature.text} style={styles.featureRow}>
          <MaterialIcons name={FEATURE_KIND_ICONS[feature.kind] as IconName} size={18} color={k.tint.green.fg} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[d.type.body, { color: k.colors.text }]}>{feature.text}</Text>
            <Text style={[d.type.caption, { color: k.colors.textMuted }]}>근거 · {feature.evidence.label}{feature.evidence.page ? ` ${feature.evidence.page}쪽` : ''}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** '확인할 점'. 특징과 다른 색(주황)·아이콘으로 구분한다. 없으면 그리지 않는다. */
export function ListingCautions({ items, title = '확인할 점' }: { items: string[]; title?: string }) {
  const { d } = useDensity();
  if (!items.length) return null;
  return (
    <View style={[styles.cautions, { padding: d.cardPadding, gap: d.cardGap }]} testID="listing-cautions">
      <View style={styles.row}>
        <MaterialIcons name="error-outline" size={20} color={k.tint.amber.fg} />
        <Text style={[d.type.section, { color: k.colors.text }]} accessibilityRole="header">{title}</Text>
      </View>
      {items.map(item => (
        <View key={item} style={styles.featureRow}>
          <MaterialIcons name="priority-high" size={18} color={k.tint.amber.fg} />
          <Text style={[d.type.body, { color: k.colors.text, flex: 1 }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export type { PoiCategory };

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: k.colors.surfaceLow, alignSelf: 'flex-start' },
  badgePrimary: { backgroundColor: k.colors.lavender },
  summary: { borderRadius: 16, borderWidth: 1, borderColor: k.colors.outline, backgroundColor: k.colors.surface },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: k.colors.lavender },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: k.colors.surfaceLow },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  place: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: k.colors.outline, backgroundColor: k.colors.surface },
  placeIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: k.colors.lavender, alignItems: 'center', justifyContent: 'center' },
  map: { width: '100%', aspectRatio: 16 / 9, maxHeight: 360, overflow: 'hidden', backgroundColor: '#EEF1F6', borderWidth: 1, borderColor: k.colors.outline },
  mapGrid: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  mapLineH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#DCE1EA' },
  mapLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: '#DCE1EA' },
  poi: { position: 'absolute', width: 26, height: 26, marginLeft: -13, marginTop: -13, borderRadius: 13, backgroundColor: '#7B87A6', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: k.colors.surface },
  pin: { position: 'absolute', width: 40, height: 40, marginLeft: -20, marginTop: -20, borderRadius: 20, backgroundColor: k.colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: k.colors.surface },
  mapNote: { position: 'absolute', left: 12, bottom: 10, color: k.colors.textMuted },
  mapOpen: { position: 'absolute', right: 10, top: 10, flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: k.colors.surface },
  features: { borderRadius: 16, backgroundColor: k.tint.green.bg },
  cautions: { borderRadius: 16, backgroundColor: k.tint.amber.bg },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
});
