import { StyleSheet, View } from 'react-native';
import type { ServiceListing } from '../live/types';
import { useDensity } from '../layout/DensityContext';
import { ListingCautions, ListingFeatures, ListingMap, LocationSummary, NearbyPlaces } from '../location/LocationViews';

export function ListingHighlights({ listing, cautions }: { listing: ServiceListing | null; cautions: string[] }) {
  const { density, d } = useDensity();
  if (!listing?.sellingPoints.length) return null;
  const allCautions = [...new Set([...cautions, ...listing.locationCautions.map(item => item.text)])].slice(0, 4);
  return <View style={[styles.pair, density === 'compact' && styles.row, { gap: d.cardGap }]} testID="listing-highlights"><View style={styles.half}><ListingFeatures features={listing.sellingPoints} /></View>{allCautions.length ? <View style={styles.half}><ListingCautions items={allCautions} /></View> : null}</View>;
}

export function ListingPlace({ listing }: { listing: ServiceListing | null }) {
  const { density, d } = useDensity();
  if (!listing || (listing.location.status !== 'RESOLVED' && !listing.nearbyPois.length)) return null;
  return <View style={{ gap: d.cardGap }} testID="listing-place"><LocationSummary location={listing.location} nearby={listing.nearbyPois} title={listing.title} /><View style={[styles.pair, density === 'compact' && styles.row, { gap: d.cardGap }]}>{listing.location.status === 'RESOLVED' ? <View style={styles.half}><ListingMap location={listing.location} nearby={listing.nearbyPois} title={listing.title} /></View> : null}{listing.nearbyPois.length ? <View style={styles.half}><NearbyPlaces places={listing.nearbyPois} /></View> : null}</View></View>;
}

const styles = StyleSheet.create({ pair: { gap: 12 }, row: { flexDirection: 'row', alignItems: 'flex-start' }, half: { flex: 1, minWidth: 0 } });
