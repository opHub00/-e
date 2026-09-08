import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadow, spacing, tint, tracking, type } from '../../design/tokens';
import { DiscoveryMap } from '../../features/discovery/components/DiscoveryMap';
import { ListingCard } from '../../features/discovery/components/ListingCard';
import {
  DEFAULT_DISCOVERY_FILTERS,
  createDiscoveryFilters,
  formatHouseholdCount,
  formatPrice,
  formatRecruitmentSchedule,
  getListingRelevance,
  getVisibleListings,
  getMappableListings,
  hasListingPrice,
  RECRUITMENT_STATUS_LABEL,
  searchListings,
  toggleDiscoveryRegionSelection,
} from '../../features/discovery/domain';
import { useListingDataset } from '../../features/discovery/data/useListingDataset';
import { DISCOVERY_REGIONS } from '../../features/discovery/regions';
import type { DiscoveryFilters, DiscoveryRegion } from '../../features/discovery/types';
import { useDiscoveryStore } from '../../features/discovery/useDiscoveryStore';
import { Appear } from '../../components/motion/Appear';
import { Pop } from '../../components/motion/Pop';
import { duration, travel } from '../../design/motion';
import { toDiscoveryUserProfile } from '../../features/profile/domain';
import { useUserStore } from '../../store/useUserStore';

type ViewMode = 'map' | 'list';

const SUPPLY_CYCLE: DiscoveryFilters['supplyType'][] = [
  'all',
  '일반공급',
  '공공분양',
  '민간분양',
  '공공지원 민간임대',
];

export default function DiscoveryRoute() {
  const router = useRouter();
  const applicantProfile = useUserStore((state) => state.applicantProfile);
  const profileHydrated = useUserStore((state) => state.profileHydrated);
  const profile = useMemo(() => toDiscoveryUserProfile(applicantProfile), [applicantProfile]);
  const savedListingIds = useDiscoveryStore((state) => state.savedListingIds);
  const toggleSavedListing = useDiscoveryStore((state) => state.toggleSavedListing);
  const dataset = useListingDataset();
  const { listings: discoveryListings } = dataset;
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [filters, setFilters] = useState<DiscoveryFilters>(DEFAULT_DISCOVERY_FILTERS);
  const [filtersInitialized, setFiltersInitialized] = useState(false);
  const [query, setQuery] = useState('');
  const [regionSheetOpen, setRegionSheetOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!profileHydrated || filtersInitialized) return;
    setFilters(createDiscoveryFilters(applicantProfile.preferences.regions));
    setFiltersInitialized(true);
  }, [applicantProfile.preferences.regions, filtersInitialized, profileHydrated]);

  const filteredListings = useMemo(
    () => getVisibleListings(discoveryListings, profile, filters),
    [discoveryListings, filters, profile],
  );
  const visibleListings = useMemo(
    () => searchListings(filteredListings, query),
    [filteredListings, query],
  );
  const mapListings = useMemo(
    () => getMappableListings(visibleListings),
    [visibleListings],
  );
  const selected =
    mapListings.find((listing) => listing.id === selectedId) ?? mapListings[0] ?? null;
  /** 지도에 실제로 찍히는 건수. 좌표가 없는 공고는 marker 가 없다. */
  const mappedCount = useMemo(
    () => mapListings.length,
    [mapListings],
  );

  const patchFilters = (next: Partial<DiscoveryFilters>) =>
    setFilters((current) => ({ ...current, ...next }));

  const cycleSupply = () => {
    const nextIndex = (SUPPLY_CYCLE.indexOf(filters.supplyType) + 1) % SUPPLY_CYCLE.length;
    patchFilters({ supplyType: SUPPLY_CYCLE[nextIndex] });
  };

  const openListing = (id: string) => router.push({ pathname: '/discovery/[id]', params: { id } });

  if (dataset.status === 'loading' || !filtersInitialized) {
    return (
      <SafeAreaView style={[styles.safe, styles.stateScreen]} edges={['top']}>
        <Appear replayKey="discovery-loading" distance={0} style={styles.stateContent}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>청약홈 실제 공고를 불러오는 중이에요</Text>
        </Appear>
      </SafeAreaView>
    );
  }

  if (dataset.status === 'error') {
    return (
      <SafeAreaView style={[styles.safe, styles.stateScreen]} edges={['top']}>
        <Appear replayKey="discovery-error" distance={0} style={styles.stateContent}>
          <MaterialIcons name="error-outline" size={24} color={colors.warning} />
          <Text style={styles.stateText}>청약 공고를 불러오지 못했어요</Text>
          <MotionPressable accessibilityRole="button" onPress={() => void dataset.retry()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>다시 시도</Text>
          </MotionPressable>
        </Appear>
      </SafeAreaView>
    );
  }

  const filterChips = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterRow}
    >
      <FilterChip
        label="내 조건 추천"
        icon="auto-awesome"
        emphasis="primary"
        active={filters.personalizedOnly}
        onPress={() => patchFilters({ personalizedOnly: !filters.personalizedOnly })}
      />
      <FilterChip
        label="모집중"
        active={filters.status === 'open'}
        onPress={() => patchFilters({ status: filters.status === 'open' ? 'all' : 'open' })}
      />
      <FilterChip
        label="모집예정"
        active={filters.status === 'upcoming'}
        onPress={() => patchFilters({ status: filters.status === 'upcoming' ? 'all' : 'upcoming' })}
      />
      <FilterChip
        label={`지역 · ${formatRegionFilterLabel(filters.regions)}`}
        icon="place"
        active={filters.regions.length > 0}
        onPress={() => setRegionSheetOpen(true)}
      />
      <FilterChip
        label={`공급 · ${filters.supplyType === 'all' ? '전체' : filters.supplyType}`}
        icon="sync-alt"
        active={filters.supplyType !== 'all'}
        onPress={cycleSupply}
      />
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {dataset.isFallback ? (
        <View style={styles.fallbackNotice}>
          <MaterialIcons name="info-outline" size={16} color={colors.warning} />
          <Text style={styles.fallbackNoticeText}>
            실제 공고를 불러오지 못해 데모 데이터를 보여드리고 있어요.
          </Text>
        </View>
      ) : null}
      {viewMode === 'map' ? (
        /* Airbnb: 헤더(검색+필터) 아래로 지도가 남은 뷰포트를 전부 차지한다. */
        <View style={styles.mapStage}>
          <Appear distance={0} style={styles.mapHeader}>
            <View style={styles.searchRow}>
              <View style={styles.searchBar}>
                <MaterialIcons name="search" size={18} color={colors.textSubtle} />
                <View style={styles.searchCopy}>
                  <TextInput
                    accessibilityLabel="전국 청약 검색"
                    value={query}
                    onChangeText={setQuery}
                    placeholder="단지 · 주소 · 시도 검색"
                    placeholderTextColor={colors.textSubtle}
                    style={styles.searchInput}
                  />
                  <Text style={styles.searchSub}>
                    {formatRegionFilterLabel(filters.regions)} · 검색 결과 {visibleListings.length}건
                  </Text>
                </View>
              </View>
              <MotionPressable
                accessibilityRole="button"
                accessibilityLabel="목록으로 보기"
                onPress={() => setViewMode('list')}
                style={styles.headerIconButton}
              >
                <MaterialIcons name="view-agenda" size={18} color={colors.text} />
              </MotionPressable>
            </View>
            {filterChips}
          </Appear>

          <View style={styles.mapFill}>
            {mappedCount > 0 ? (
              <View style={styles.mapCount} pointerEvents="none">
                <Text style={styles.mapCountText}>현재 지도 {mappedCount}곳</Text>
              </View>
            ) : null}
            <DiscoveryMap
              fill
              fitToMarkers={filters.regions.length > 0}
              listings={mapListings}
              referenceListings={discoveryListings}
              selected={selected}
              getRelevance={(listing) => getListingRelevance(profile, listing)}
              onSelect={setSelectedId}
              onOpen={openListing}
              isSaved={(listingId) => savedListingIds.includes(listingId)}
              onToggleSaved={toggleSavedListing}
            />
          </View>

          {/* 핀 선택 결과 bottom sheet.
              핀을 바꾸면 내용은 즉시 갈아끼운다. 매번 페이드하면 시트가 깜빡인다. */}
          {selected ? (
            <Appear distance={travel.sheet} durationMs={duration.sheet} style={styles.sheet}>
              <View style={styles.sheetHandle} />

              <View style={styles.sheetTopRow}>
                <View
                  style={[
                    styles.sheetStatus,
                    selected.recruitmentStatus === 'open' && styles.sheetStatusOpen,
                    selected.recruitmentStatus === 'upcoming' && styles.sheetStatusSoon,
                  ]}
                >
                  <Text
                    style={[
                      styles.sheetStatusText,
                      selected.recruitmentStatus === 'open' && styles.sheetStatusTextOpen,
                      selected.recruitmentStatus === 'upcoming' && styles.sheetStatusTextSoon,
                    ]}
                  >
                    {RECRUITMENT_STATUS_LABEL[selected.recruitmentStatus]}
                  </Text>
                </View>
                <View style={styles.spacer} />
                <MotionPressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    savedListingIds.includes(selected.id) ? '저장 취소' : '청약 저장'
                  }
                  onPress={() => toggleSavedListing(selected.id)}
                  hitSlop={10}
                  // 켜지는 순간은 Pop 이 맡는다. 눌림 scale 까지 겹치면 두 번 튄다.
                  pressedScale={1}
                  style={styles.saveButton}
                >
                  <Pop active={savedListingIds.includes(selected.id)}>
                    <MaterialIcons
                      name={savedListingIds.includes(selected.id) ? 'favorite' : 'favorite-border'}
                      size={21}
                      color={savedListingIds.includes(selected.id) ? colors.primary : colors.outline}
                    />
                  </Pop>
                </MotionPressable>
              </View>

              <Text style={styles.sheetName} numberOfLines={2}>
                {selected.complexName}
              </Text>
              <Text style={styles.sheetPlace}>
                {selected.region} · {selected.district}
              </Text>

              <View style={styles.sheetFacts}>
                {formatRecruitmentSchedule(selected) ? (
                  <View style={styles.factCol}>
                    <Text style={styles.factLabel}>접수</Text>
                    <Text style={styles.factValue}>{formatRecruitmentSchedule(selected)}</Text>
                  </View>
                ) : null}
                {selected.householdCount !== null ? (
                  <View style={styles.factCol}>
                    <Text style={styles.factLabel}>규모</Text>
                    <Text style={styles.factValue}>
                      {formatHouseholdCount(selected.householdCount)}
                    </Text>
                  </View>
                ) : null}
                {hasListingPrice(selected) ? (
                  <View style={styles.factCol}>
                    <Text style={styles.factLabel}>분양가</Text>
                    <Text style={styles.factValue}>
                      {formatPrice(selected.representativePrice)}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.sheetFoot}>
                <View style={styles.relevance}>
                  <MaterialIcons name="auto-awesome" size={14} color={colors.primary} />
                  <Text style={styles.relevanceText}>
                    {getListingRelevance(profile, selected).label}
                  </Text>
                </View>
                <MotionPressable
                  accessibilityRole="button"
                  accessibilityLabel={`${selected.complexName} 상세 보기`}
                  onPress={() => openListing(selected.id)}
                  style={styles.detailCta}
                >
                  <Text style={styles.detailCtaText}>상세 보기</Text>
                  <MaterialIcons name="arrow-forward" size={15} color={colors.onPrimary} />
                </MotionPressable>
              </View>

              <Text style={styles.provenance}>
                {selected.isDemo ? '데모 데이터 기준' : '청약홈 모집공고 기준'}
              </Text>
            </Appear>
          ) : (
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetEmpty}>
                <MaterialIcons
                  name={visibleListings.length > 0 ? 'location-off' : 'filter-alt-off'}
                  size={19}
                  color={colors.primary}
                />
                <Text style={styles.sheetEmptyText}>
                  {visibleListings.length > 0
                    ? `검색 결과 ${visibleListings.length}건은 목록에서 확인할 수 있어요`
                    : '필터에 맞는 청약이 없어요'}
                </Text>
              </View>
            </View>
          )}
        </View>
      ) : (
        /* 목록 모드 */
        <Appear distance={0} style={styles.listStage}>
          <View style={styles.mapHeader}>
            <View style={styles.searchRow}>
              <View style={styles.searchBar}>
                <MaterialIcons name="search" size={18} color={colors.textSubtle} />
                <View style={styles.searchCopy}>
                  <TextInput
                    accessibilityLabel="전국 청약 검색"
                    value={query}
                    onChangeText={setQuery}
                    placeholder="단지 · 주소 · 시도 검색"
                    placeholderTextColor={colors.textSubtle}
                    style={styles.searchInput}
                  />
                  <Text style={styles.searchSub}>
                    {formatRegionFilterLabel(filters.regions)} · 검색 결과 {visibleListings.length}건
                  </Text>
                </View>
              </View>
              <MotionPressable
                accessibilityRole="button"
                accessibilityLabel="지도로 보기"
                onPress={() => setViewMode('map')}
                style={styles.headerIconButton}
              >
                <MaterialIcons name="map" size={18} color={colors.text} />
              </MotionPressable>
            </View>
            {filterChips}
          </View>

          <ScrollView
            contentContainerStyle={styles.listBody}
            showsVerticalScrollIndicator={false}
          >
            {visibleListings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                relevance={getListingRelevance(profile, listing)}
                saved={savedListingIds.includes(listing.id)}
                onToggleSaved={() => toggleSavedListing(listing.id)}
                onOpen={() => openListing(listing.id)}
              />
            ))}
            {visibleListings.length === 0 ? (
              <View style={styles.emptyCard}>
                <MaterialIcons name="filter-alt-off" size={26} color={colors.primary} />
                <Text style={styles.emptyTitle}>필터에 맞는 청약이 없어요</Text>
                <MotionPressable
                  accessibilityRole="button"
                  onPress={() => {
                    setFilters(createDiscoveryFilters(applicantProfile.preferences.regions));
                    setQuery('');
                  }}
                  style={styles.resetButton}
                >
                  <Text style={styles.resetText}>필터 초기화</Text>
                </MotionPressable>
              </View>
            ) : null}
          </ScrollView>
        </Appear>
      )}
      <RegionFilterSheet
        visible={regionSheetOpen}
        selectedRegions={filters.regions}
        onChange={(regions) => patchFilters({ regions, personalizedOnly: false })}
        onClose={() => setRegionSheetOpen(false)}
      />
    </SafeAreaView>
  );
}

function formatRegionFilterLabel(regions: readonly DiscoveryRegion[]): string {
  if (regions.length === 0) return '전국';
  if (regions.length === 1) return regions[0];
  return `${regions.length}개 지역`;
}

function RegionFilterSheet({
  visible,
  selectedRegions,
  onChange,
  onClose,
}: {
  visible: boolean;
  selectedRegions: DiscoveryRegion[];
  onChange: (regions: DiscoveryRegion[]) => void;
  onClose: () => void;
}) {
  const toggleRegion = (region: DiscoveryRegion) => {
    const next = selectedRegions.includes(region)
      ? selectedRegions.filter((item) => item !== region)
      : toggleDiscoveryRegionSelection(selectedRegions, region);
    onChange(next);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <MotionPressable
          accessibilityRole="button"
          accessibilityLabel="지역 선택 닫기"
          onPress={onClose}
          style={styles.modalBackdrop}
        />
        <Appear distance={travel.sheet} durationMs={duration.sheet} style={styles.regionSheet}>
          <View style={styles.regionSheetHandle} />
          <View style={styles.regionSheetHeader}>
            <View style={styles.regionSheetCopy}>
              <Text style={styles.regionSheetTitle}>관심 지역 선택</Text>
              <Text style={styles.regionSheetBody}>여러 지역을 함께 선택할 수 있어요</Text>
            </View>
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel="지역 선택 완료"
              onPress={onClose}
              style={styles.regionDoneButton}
            >
              <Text style={styles.regionDoneText}>완료</Text>
            </MotionPressable>
          </View>
          <ScrollView contentContainerStyle={styles.regionGrid}>
            <MotionPressable
              accessibilityRole="button"
              accessibilityState={{ selected: selectedRegions.length === 0 }}
              onPress={() => onChange([])}
              style={[styles.regionOption, selectedRegions.length === 0 && styles.regionOptionActive]}
            >
              <Text style={[styles.regionOptionText, selectedRegions.length === 0 && styles.regionOptionTextActive]}>
                전국
              </Text>
            </MotionPressable>
            {DISCOVERY_REGIONS.map((region) => {
              const active = selectedRegions.includes(region);
              return (
                <MotionPressable
                  key={region}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => toggleRegion(region)}
                  style={[styles.regionOption, active && styles.regionOptionActive]}
                >
                  <Text style={[styles.regionOptionText, active && styles.regionOptionTextActive]}>
                    {region}
                  </Text>
                </MotionPressable>
              );
            })}
          </ScrollView>
        </Appear>
      </View>
    </Modal>
  );
}

function FilterChip({
  label,
  icon,
  active,
  onPress,
  /** primary 는 '내 조건 추천' 하나만. 나머지 필터는 조용하게 둔다. */
  emphasis = 'quiet',
}: {
  label: string;
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
  active: boolean;
  onPress: () => void;
  emphasis?: 'primary' | 'quiet';
}) {
  const primary = emphasis === 'primary';
  const filled = primary && active;
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.chip,
        primary && styles.chipPrimary,
        filled && styles.chipFilled,
        !primary && active && styles.chipQuietActive,
      ]}
    >
      {/* 선택은 배경색이 이미 말해준다. 라벨까지 페이드하면 누를 때마다 글자가 깜빡인다. */}
      <View style={styles.chipContent}>
        {icon ? (
          <MaterialIcons
            name={icon}
            size={13}
            color={filled ? colors.onPrimary : primary ? colors.primary : colors.textSubtle}
          />
        ) : null}
        <Text
          style={[
            styles.chipText,
            primary && styles.chipTextPrimary,
            filled && styles.chipTextFilled,
            !primary && active && styles.chipTextQuietActive,
          ]}
        >
          {label}
        </Text>
      </View>
    </MotionPressable>
  );
}

const SIDE = spacing.screen;

const styles = StyleSheet.create({
  safe: { flex: 1, height: '100%', backgroundColor: colors.background },
  spacer: { flex: 1 },
  stateScreen: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  stateContent: { alignItems: 'center', gap: spacing.sm },
  stateText: { ...type.bodySm, color: colors.textMuted },
  retryButton: { marginTop: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  retryButtonText: { ...type.label, color: colors.onPrimary },
  fallbackNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: tint.amber.bg,
    paddingHorizontal: spacing.screen,
    paddingVertical: spacing.sm,
  },
  fallbackNoticeText: { ...type.caption, color: tint.amber.fg, flex: 1 },

  /* ── 지도 모드 ── */
  mapStage: { flex: 1, position: 'relative' },
  mapFill: { flex: 1 },

  /* Airbnb: 검색과 필터는 지도 위가 아니라 지도 위쪽 solid 헤더에 산다. */
  mapHeader: {
    backgroundColor: colors.surface,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceHigh,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SIDE },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 50,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: 16,
  },
  searchCopy: { flex: 1, gap: 1 },
  searchInput: { ...type.bodySmStrong, color: colors.text, letterSpacing: tracking.normal, padding: 0 },
  searchSub: { ...type.micro, color: colors.textSubtle },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  filterRow: { gap: 6, paddingHorizontal: SIDE, paddingVertical: 1 },
  /* quiet: 테두리 없는 옅은 표면. primary 만 브랜드 색을 쓴다. */
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: 11,
  },
  chipQuietActive: { backgroundColor: colors.surfaceHighest },
  chipPrimary: { backgroundColor: colors.lavender },
  chipFilled: { backgroundColor: colors.primary },
  chipText: { ...type.micro, color: colors.textSubtle },
  chipTextQuietActive: { color: colors.text },
  chipTextPrimary: { color: colors.primary },
  chipTextFilled: { color: colors.onPrimary },

  /* floating 계층 4: 시트. 위쪽으로만 큰 라운드. */
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: spacing.screen,
    paddingBottom: 14,
    ...Platform.select({
      web: { boxShadow: '0 -6px 18px rgba(28,27,34,0.10)' },
      default: {
        shadowColor: '#1C1B22',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.1,
        shadowRadius: 18,
        elevation: 8,
      },
    }),
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceHighest,
    marginTop: 7,
    marginBottom: 10,
  },

  /* 지도 위 lightweight 카운트 */
  mapCount: {
    position: 'absolute',
    zIndex: 30,
    top: 10,
    alignSelf: 'center',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    paddingHorizontal: 11,
    paddingVertical: 4,
  },
  chipContent: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  mapCountText: { ...type.micro, color: colors.textMuted },

  /* 시트: 상태 → 단지명 → 지역 → 사실 → 관련성 */
  sheetTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetStatus: {
    height: 22,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: 9,
  },
  sheetStatusOpen: { backgroundColor: tint.green.bg },
  sheetStatusSoon: { backgroundColor: tint.amber.bg },
  sheetStatusText: { ...type.micro, color: colors.textSubtle },
  sheetStatusTextOpen: { color: tint.green.fg },
  sheetStatusTextSoon: { color: tint.amber.fg },
  saveButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },

  sheetName: {
    ...type.section,
    color: colors.text,
    letterSpacing: tracking.tight,
    lineHeight: 26,
    marginTop: 8,
  },
  sheetPlace: { ...type.caption, color: colors.textMuted, marginTop: 3 },

  sheetFacts: { flexDirection: 'row', gap: 22, marginTop: 12 },
  factCol: { gap: 2 },
  factLabel: { ...type.micro, color: colors.textSubtle },
  factValue: { ...type.bodySmStrong, color: colors.text, letterSpacing: tracking.normal },

  sheetFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    marginTop: 13,
    paddingTop: 12,
  },
  relevance: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  relevanceText: { ...type.label, color: colors.primary, letterSpacing: tracking.normal },
  detailCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 42,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
  },
  detailCtaText: { ...type.bodySmStrong, color: colors.onPrimary, letterSpacing: tracking.normal },
  provenance: { ...type.micro, color: colors.textSubtle, marginTop: 9 },

  sheetEmpty: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: 10 },
  sheetEmptyText: { ...type.bodySm, color: colors.textSubtle, flex: 1 },

  /* ── 목록 모드 ── */
  listStage: { flex: 1 },
  listBody: { paddingHorizontal: spacing.screen, paddingBottom: spacing.xl, gap: spacing.sm },

  emptyCard: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
  },
  emptyTitle: { ...type.bodySmStrong, color: colors.text },
  resetButton: {
    borderRadius: radius.pill,
    backgroundColor: colors.lavender,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  resetText: { ...type.label, color: colors.primary },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(28,27,34,0.34)',
  },
  regionSheet: {
    maxHeight: '76%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.screen,
    paddingBottom: spacing.xl,
    ...shadow.floating,
  },
  regionSheetHandle: {
    alignSelf: 'center',
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceHighest,
    marginTop: 8,
    marginBottom: spacing.md,
  },
  regionSheetHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  regionSheetCopy: { flex: 1, gap: 2 },
  regionSheetTitle: { ...type.title, color: colors.text },
  regionSheetBody: { ...type.caption, color: colors.textMuted },
  regionDoneButton: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
  },
  regionDoneText: { ...type.label, color: colors.onPrimary },
  regionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.lg,
  },
  regionOption: {
    width: '30%',
    minWidth: 82,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.cardSm,
    backgroundColor: colors.surfaceContainer,
  },
  regionOptionActive: { backgroundColor: colors.primary },
  regionOptionText: { ...type.bodySmStrong, color: colors.textMuted },
  regionOptionTextActive: { color: colors.onPrimary },
});
