import { StyleSheet, View } from 'react-native';
import { useDensity } from '../layout/DensityContext';
import { featuresOf } from '../location/listingFeatures';
import { locationOf } from '../location/locationModel';
import { ListingCautions, ListingFeatures, ListingMap, LocationSummary, NearbyPlaces } from '../location/LocationViews';

/**
 * 공고 상세의 '집과 동네' 묶음: 이 주택의 특징 / 확인할 점, 위치·지도·주변 시설.
 * Codex 의 location·POI·selling point 데이터가 없으면 아무것도 그리지 않는다(지금 화면 그대로).
 * desktop 에서는 특징과 확인할 점, 지도와 주변 시설을 나란히 둔다.
 */
export function ListingHighlights({ listing, cautions }: { listing: Record<string, unknown>; cautions: string[] }) {
  const { density, d } = useDensity();
  const features = featuresOf(listing);
  // 특징이 없을 때 확인할 점만 따로 띄우면 판정 블록과 겹친다. 특징이 있을 때만 짝으로 보여 준다.
  if (!features.length) return null;
  return (
    <View style={[styles.pair, density === 'compact' && styles.row, { gap: d.cardGap }]} testID="listing-highlights">
      <View style={styles.half}><ListingFeatures features={features} /></View>
      {cautions.length ? <View style={styles.half}><ListingCautions items={cautions.slice(0, 4)} /></View> : null}
    </View>
  );
}

export function ListingPlace({ listing, title }: { listing: Record<string, unknown>; title: string }) {
  const { density, d } = useDensity();
  const { location, nearby } = locationOf(listing);
  if (!location && !nearby.length) return null;
  return (
    <View style={{ gap: d.cardGap }} testID="listing-place">
      <LocationSummary location={location} nearby={nearby} title={title} />
      <View style={[styles.pair, density === 'compact' && styles.row, { gap: d.cardGap }]}>
        {location?.lat !== null && location?.lat !== undefined ? <View style={styles.half}><ListingMap location={location} nearby={nearby} title={title} /></View> : null}
        {nearby.length ? <View style={styles.half}><NearbyPlaces places={nearby} /></View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pair: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  half: { flex: 1, minWidth: 0 },
});
