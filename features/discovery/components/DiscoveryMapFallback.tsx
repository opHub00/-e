import { MaterialIcons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { StatusPill } from '../../../components/StatusPill';
import { colors, radius, shadow, size, spacing, tracking, type } from '../../../design/tokens';
import {
  formatPrice,
  formatRecruitmentSchedule,
  hasListingPrice,
  hasListingCoordinates,
  projectListingPin,
  RECRUITMENT_STATUS_LABEL,
} from '../domain';
import type { DiscoveryListing, ListingRelevance } from '../types';

export type DiscoveryMapProps = {
  listings: DiscoveryListing[];
  referenceListings: DiscoveryListing[];
  selected: DiscoveryListing | null;
  getRelevance: (listing: DiscoveryListing) => ListingRelevance;
  onSelect: (listingId: string) => void;
  onOpen: (listingId: string) => void;
  isSaved: (listingId: string) => boolean;
  onToggleSaved: (listingId: string) => void;
  /** 지도 모드에서 화면을 가득 채운다. 카드형 박스 대신 전면 캔버스가 된다. */
  fill?: boolean;
  /** 지역 필터가 있을 때만 기존 bounds 방식으로 카메라를 맞춘다. */
  fitToMarkers?: boolean;
  fallbackLabel?: string;
};

export function DiscoveryMapFallback({
  listings,
  referenceListings,
  selected,
  getRelevance,
  onSelect,
  onOpen,
  isSaved,
  onToggleSaved,
  fill,
  fallbackLabel,
}: DiscoveryMapProps) {
  // 전면 지도에서는 투영 결과를 화면 높이에 맞게 편다.
  // projectListingPin 자체는 건드리지 않고, 표시 단계에서만 정규화한다.
  const mappableListings = listings.filter(hasListingCoordinates);
  const mappableReferenceListings = referenceListings.filter(hasListingCoordinates);
  const projected = mappableListings.map((listing) => projectListingPin(listing, mappableReferenceListings));
  const ys = projected.map((p) => p.y);
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : 1;
  const spanY = maxY - minY || 1;
  // 검색/필터가 지도 밖으로 나갔으므로 위쪽까지 쓸 수 있다.
  // 하단 시트가 덮는 영역만 피한다.
  const spreadY = (y: number) => (fill ? 7 + ((y - minY) / spanY) * 56 : y);

  return (
    <View style={[styles.map, fill && styles.mapFill]}>
      <View style={styles.water} />
      <View style={[styles.road, styles.roadOne]} />
      <View style={[styles.road, styles.roadTwo]} />
      <View style={[styles.road, styles.roadThree]} />
      <Text style={[styles.mapLabel, styles.nationwideLabel]}>전국 좌표 분포</Text>

      <View style={fill ? styles.demoBadgeFill : styles.demoBadge}>
        <MaterialIcons name="map" size={14} color={colors.primary} />
        <Text style={styles.demoBadgeText}>{fallbackLabel ?? '좌표 기반 지도'}</Text>
      </View>

      {mappableListings.map((listing, index) => {
        const position = projected[index];
        const top = spreadY(position.y);
        // 선택되지 않았고 관련도가 가장 낮으면(check) 점으로 접는다.
        const collapsed =
          fill && selected?.id !== listing.id && getRelevance(listing).level === 'check';
        const active = selected?.id === listing.id;
        return (
          <Pressable
            key={listing.id}
            accessibilityRole="button"
            accessibilityLabel={`${listing.complexName} 지도 핀`}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(listing.id)}
            style={[
              styles.pin,
              collapsed && styles.pinCollapsed,
              { left: `${position.x}%`, top: `${top}%` },
              active && styles.pinActive,
            ]}
          >
            {collapsed ? null : (
              <MaterialIcons
                name="location-on"
                size={16}
                color={active ? colors.onPrimary : colors.primary}
              />
            )}
            {collapsed ? null : (
              hasListingPrice(listing) ? (
                <Text style={[styles.pinText, active && styles.pinTextActive]}>
                  {formatPrice(listing.representativePrice)}
                </Text>
              ) : null
            )}
          </Pressable>
        );
      })}

      {fill ? null : selected ? (
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetTop}>
            <View style={styles.sheetCopy}>
              <View style={styles.sheetMeta}>
                <StatusPill
                  label={RECRUITMENT_STATUS_LABEL[selected.recruitmentStatus]}
                  tone={selected.recruitmentStatus === 'open' ? 'green' : 'amber'}
                />
                <Text style={styles.sheetLocation}>{selected.region} · {selected.district}</Text>
              </View>
              <Text style={styles.sheetTitle}>{selected.complexName}</Text>
              <Text style={styles.sheetSchedule}>
                {[
                  formatRecruitmentSchedule(selected),
                  hasListingPrice(selected) ? formatPrice(selected.representativePrice) : null,
                ].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel={isSaved(selected.id) ? '저장 취소' : '청약 저장'}
              onPress={() => onToggleSaved(selected.id)}
              style={styles.sheetSave}
            >
              <MaterialIcons
                name={isSaved(selected.id) ? 'bookmark' : 'bookmark-border'}
                size={22}
                color={colors.primary}
              />
            </MotionPressable>
          </View>
          <View style={styles.sheetBottom}>
            <View style={styles.relevancePill}>
              <MaterialIcons name="auto-awesome" size={15} color={colors.primary} />
              <Text style={styles.relevanceText}>{getRelevance(selected).label}</Text>
            </View>
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel={`${selected.complexName} 상세 보기`}
              onPress={() => onOpen(selected.id)}
              style={styles.detailButton}
            >
              <Text style={styles.detailText}>상세 보기</Text>
              <MaterialIcons name="arrow-forward" size={17} color={colors.onPrimary} />
            </MotionPressable>
          </View>
        </View>
      ) : (
        <View style={styles.emptySheet}>
          <Text style={styles.emptyText}>현재 필터에 표시할 청약이 없어요.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mapFill: {
    flex: 1,
    height: '100%',
    borderRadius: 0,
    borderWidth: 0,
    ...Platform.select({
      web: { boxShadow: 'none' },
      default: { shadowOpacity: 0, elevation: 0 },
    }),
  },
  map: {
    height: 520,
    borderRadius: radius.bento,
    borderWidth: 1,
    borderColor: colors.primaryFixed,
    backgroundColor: '#ECEAF8',
    overflow: 'hidden',
    ...shadow.card,
  },
  /** 전면 지도에서는 상단 overlay 에 가리지 않도록 좌하단에 둔다. */
  demoBadgeFill: {
    position: 'absolute',
    zIndex: 20,
    bottom: 200,
    left: spacing.screen,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  water: {
    position: 'absolute',
    width: '125%',
    height: 52,
    top: 148,
    left: -42,
    backgroundColor: '#D9E5F4',
    transform: [{ rotate: '-8deg' }],
  },
  road: { position: 'absolute', height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.72)' },
  roadOne: { width: '92%', top: 86, left: 16, transform: [{ rotate: '12deg' }] },
  roadTwo: { width: '70%', top: 224, right: -14, transform: [{ rotate: '-18deg' }] },
  roadThree: { width: '68%', top: 118, left: 98, transform: [{ rotate: '72deg' }] },
  mapLabel: { ...type.label, position: 'absolute', color: 'rgba(71,69,83,0.38)' },
  nationwideLabel: { top: 44, right: 30 },
  demoBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.88)',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  demoBadgeText: { ...type.caption, color: colors.primary },
  /* 미선택 마커: 겹칠 때 덜 혼잡하도록 무게를 낮춘다. */
  pin: {
    position: 'absolute',
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: 7,
    marginLeft: -22,
    ...shadow.card,
  },
  /* 선택 마커: 흰 링 + 진한 그림자로 한 단계 위에 띄운다. */
  /* 접힌 핀: 위치만 알리고 읽기 부담을 주지 않는다. */
  pinCollapsed: {
    minHeight: 14,
    width: 14,
    paddingHorizontal: 0,
    borderRadius: 7,
    marginLeft: -7,
    borderColor: colors.outline,
  },
  pinActive: {
    minHeight: 34,
    paddingHorizontal: 10,
    backgroundColor: colors.primary,
    borderColor: colors.onPrimary,
    borderWidth: 2.5,
    zIndex: 10,
    ...Platform.select({
      web: { boxShadow: '0 4px 8px rgba(28,27,34,0.28)' },
      default: {
        shadowColor: '#1C1B22',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
        elevation: 6,
      },
    }),
  },
  pinText: { ...type.micro, color: colors.textMuted },
  pinTextActive: { ...type.label, color: colors.onPrimary, letterSpacing: tracking.normal },
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    gap: spacing.sm,
    borderRadius: radius.bento,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    backgroundColor: colors.surface,
    padding: spacing.md,
    ...shadow.floating,
  },
  sheetHandle: { width: 34, height: 4, borderRadius: 2, backgroundColor: colors.surfaceHighest, alignSelf: 'center' },
  sheetTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  sheetCopy: { flex: 1, gap: spacing.xs },
  sheetMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sheetLocation: { ...type.caption, color: colors.textMuted },
  sheetTitle: { ...type.cardTitle, color: colors.text },
  sheetSchedule: { ...type.caption, color: colors.textMuted },
  sheetSave: { width: size.touch, height: size.touch, alignItems: 'center', justifyContent: 'center' },
  sheetBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  relevancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.lavender,
    paddingVertical: spacing.sm,
    paddingHorizontal: 10,
  },
  relevanceText: { ...type.label, color: colors.primary },
  detailButton: {
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
  },
  detailText: { ...type.label, color: colors.onPrimary },
  emptySheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  emptyText: { ...type.body, color: colors.textMuted, textAlign: 'center' },
});
