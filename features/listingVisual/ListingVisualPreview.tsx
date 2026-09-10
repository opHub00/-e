import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState, type ComponentProps, type ComponentType } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../../design/tokens';
import type { DiscoveryListing } from '../discovery/types';
import { getListingVisualErrorFallback, selectListingVisual } from './selectListingVisual';
import type { ListingVisual } from './types';

type Props = {
  listing: DiscoveryListing;
  variant?: 'thumbnail' | 'hero';
};

type LazyImageProps = ComponentProps<typeof Image> & { loading?: 'lazy' };
const LazyImage = Image as ComponentType<LazyImageProps>;

/**
 * ListingVisual contract의 최소 renderer.
 * 좌표 preview는 지도 인스턴스나 tile 요청을 만들지 않고 위치임을 명시한다.
 */
export function ListingVisualPreview({ listing, variant = 'thumbnail' }: Props) {
  const selected = useMemo(() => selectListingVisual(listing), [listing]);
  const [visual, setVisual] = useState<ListingVisual>(selected);

  useEffect(() => setVisual(selected), [selected]);

  const frameStyle = variant === 'hero' ? styles.hero : styles.thumbnail;
  if (visual.kind === 'verified_image') {
    return (
      <View
        accessibilityLabel={`${listing.complexName} 공식 이미지, ${visual.source.name} 제공`}
        style={[styles.frame, frameStyle]}
      >
        <LazyImage
          loading={Platform.OS === 'web' ? 'lazy' : undefined}
          onError={() => setVisual(getListingVisualErrorFallback(visual))}
          resizeMode="cover"
          source={{ uri: visual.url }}
          style={styles.image}
        />
        <View style={styles.sourceBadge}>
          <Text style={styles.sourceText}>공식 이미지 · {visual.source.name}</Text>
        </View>
      </View>
    );
  }

  if (visual.kind === 'map_preview') {
    return (
      <LinearGradient
        accessibilityLabel={`${listing.complexName} 위치 미리보기, ${listing.address}`}
        colors={[listing.imagePlaceholder.from, listing.imagePlaceholder.to]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={[styles.frame, styles.location, frameStyle]}
      >
        <View pointerEvents="none" style={styles.grid}>
          <View style={[styles.road, styles.roadOne]} />
          <View style={[styles.road, styles.roadTwo]} />
        </View>
        <View style={styles.pin}>
          <MaterialIcons name="location-on" size={22} color={colors.primary} />
        </View>
        <View style={styles.locationCopy}>
          <Text style={styles.locationLabel}>{visual.label}</Text>
          <Text numberOfLines={1} style={styles.locationPlace}>
            {listing.district || listing.region}
          </Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <View
      accessibilityLabel={`${listing.complexName} 이미지와 위치 미리보기 없음`}
      style={[styles.frame, styles.none, frameStyle]}
    >
      <MaterialIcons name="image-not-supported" size={22} color={colors.textSubtle} />
      <Text style={styles.noneText}>위치 정보 없음</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', overflow: 'hidden', borderRadius: radius.cardSm },
  thumbnail: { height: 86 },
  hero: { height: 176 },
  image: { width: '100%', height: '100%' },
  sourceBadge: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(28,27,34,0.72)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  sourceText: { ...type.micro, color: colors.onPrimary },
  location: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 14,
  },
  grid: { ...StyleSheet.absoluteFill, opacity: 0.18 },
  road: {
    position: 'absolute',
    height: 16,
    width: '125%',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  roadOne: { left: -28, top: '28%', transform: [{ rotate: '-8deg' }] },
  roadTwo: { left: -18, bottom: '18%', transform: [{ rotate: '13deg' }] },
  pin: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  locationCopy: { gap: 1 },
  locationLabel: { ...type.micro, color: colors.onPrimary },
  locationPlace: { ...type.bodySmStrong, color: colors.onPrimary },
  none: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceContainer,
  },
  noneText: { ...type.caption, color: colors.textSubtle },
});
