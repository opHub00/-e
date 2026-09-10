import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, tracking, type } from '../../../design/tokens';
import { ListingVisualFrame } from './ListingVisualFrame';
import { resolveListingVisual } from './listingVisual';
import type { DiscoveryListing } from '../types';

/** 시각 자료가 있을 때만 화면 위쪽을 크게 쓴다. */
const HERO_HEIGHT = 176;
/** 자료가 없을 때는 빈 상자를 크게 두지 않고 주소를 읽히게 만드는 데 쓴다. */
const BAND_FRAME = 68;

/**
 * 상세 상단의 시각 자료.
 *
 * 목록 카드와 같은 상자를 쓰되 역할이 다르다.
 * 카드에서는 공고를 구분하는 표식이고, 여기서는 위치를 먼저 알려주는 자리다.
 *
 * 검증된 자료가 없으면 큰 빈 상자를 두지 않는다.
 * 아무것도 없는 176px 은 첫 화면에서 정보를 밀어낼 뿐이다.
 * 대신 회색 한 줄로 지나치기 쉬운 주소를 읽히는 크기로 올린다.
 */
export function ListingDetailHero({ listing }: { listing: DiscoveryListing }) {
  const visual = resolveListingVisual(listing);

  if (visual.kind === 'verified_image') {
    return (
      <View style={styles.hero}>
        <ListingVisualFrame
          visual={visual}
          housingType={listing.housingType}
          variant="hero"
          style={styles.heroFrame}
        />
        <Text style={styles.heroAddress} numberOfLines={2}>
          {listing.address}
        </Text>
        <Text style={styles.attribution}>
          {visual.attribution ? `${visual.source.name} · ${visual.attribution}` : visual.source.name}
        </Text>
      </View>
    );
  }

  /**
   * 사진이 없을 때는 큰 빈 상자를 두지 않는다.
   * 아무것도 없는 176px 은 첫 화면에서 정보를 밀어낼 뿐이다.
   * 대신 회색 한 줄로 지나치기 쉬운 주소를 읽히는 크기로 올린다.
   */
  return (
    <View style={styles.band}>
      <ListingVisualFrame
        visual={visual}
        housingType={listing.housingType}
        variant="thumbnail"
        placeLabel={listing.district}
        style={styles.bandFrame}
      />
      <View style={styles.bandCopy}>
        <Text style={styles.bandLabel}>
          {visual.kind === 'map_preview' ? visual.label : listing.housingType}
        </Text>
        <Text style={styles.bandAddress} numberOfLines={3}>
          {listing.address}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 6 },
  heroFrame: { width: '100%', height: HERO_HEIGHT },
  heroAddress: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  /** 출처는 주소보다 한 단계 아래다. 읽을 사람만 읽으면 된다. */
  attribution: { ...type.micro, color: colors.textSubtle },

  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceLow,
    padding: spacing.md,
  },
  bandFrame: { width: BAND_FRAME, height: BAND_FRAME },
  bandCopy: { flex: 1, minWidth: 0, gap: 3 },
  bandLabel: { ...type.micro, color: colors.textSubtle, letterSpacing: tracking.wide },
  bandAddress: {
    ...type.bodySmStrong,
    color: colors.text,
    lineHeight: 20,
    letterSpacing: tracking.normal,
  },
});
