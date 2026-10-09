import { StyleSheet, Text, View } from 'react-native';
import { isDemoModeEnabled } from '../../features/eventKiosk/demo/demoMode';
import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import { useDensity } from '../../features/eventKiosk/layout/DensityContext';
import { normalizeListingFeatures } from '../../features/eventKiosk/location/listingFeatures';
import { normalizeListingLocation, normalizeNearbyPlaces } from '../../features/eventKiosk/location/locationModel';
import { DistanceBadge, ListingCautions, ListingFeatures, ListingMap, LocationSummary, NearbyPlaces } from '../../features/eventKiosk/location/LocationViews';
import { normalizeListingMedia } from '../../features/eventKiosk/media/listingMedia';
import { KioskButton, Notice } from '../../features/eventKiosk/ui/controls';
import { KioskFrame } from '../../features/eventKiosk/ui/KioskFrame';
import { resetToHome } from '../../features/eventKiosk/ui/navigation';
import { k } from '../../features/eventKiosk/ui/theme';
import type { ListingCardModel } from '../../features/eventKiosk/v2/listingCardModel';
import { ListingCardV2 } from '../../features/eventKiosk/v2/ListingCardV2';
import type { RecommendationSummaryV2 } from '../../features/eventKiosk/v2/recommendationSummary';
import { RecommendationSummaryV2View } from '../../features/eventKiosk/v2/RecommendationSummaryV2View';

/**
 * 운영·디자인 확인용: V2 presentation component 를 '모든 칸이 찬 예시 데이터'로 한 화면에 모은다.
 * Figma `Jeju Listing Experience V2` 비교와 Codex 데이터 연결 확인에 쓴다. Demo Mode 에서만 열린다.
 * 예시 값은 실제 공고·장소가 아니다.
 */
const svg = (fill: string) =>
  `data:image/svg+xml;base64,${typeof btoa === 'function' ? btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="${fill}"/><g fill="#fff" opacity=".85"><rect x="200" y="200" width="110" height="320" rx="8"/><rect x="345" y="120" width="130" height="400" rx="8"/><rect x="510" y="250" width="110" height="270" rx="8"/></g></svg>`) : ''}`;

const MEDIA = normalizeListingMedia([{ uri: svg('#7A75AE'), alt: '예시 단지', sourceLabel: '예시 이미지', kind: 'photo' }], '예시 단지');
const LOCATION = normalizeListingLocation({ lat: 33.5, lng: 126.53, address: '○○시 ○○동 123 (예시 주소)', district: '○○시', source: { label: '공고문 주소(예시)' } });
const NEARBY = normalizeNearbyPlaces([
  { id: 'bus', name: '예시 버스정류장', category: 'TRANSIT', distanceMeters: 180, lat: 33.5012, lng: 126.5306, sourceLabel: '예시 데이터' },
  { id: 'school', name: '예시 초등학교', category: 'SCHOOL', distanceMeters: 520, lat: 33.4968, lng: 126.5338, sourceLabel: '예시 데이터' },
  { id: 'mart', name: '예시 마트', category: 'MART', distanceMeters: 760, walkMinutes: 11, lat: 33.5049, lng: 126.5259, sourceLabel: '예시 데이터' },
  { id: 'hospital', name: '예시 병원', category: 'HOSPITAL', distanceMeters: 1900, lat: 33.5135, lng: 126.5402, sourceLabel: '예시 데이터' },
  { id: 'park', name: '예시 근린공원', category: 'PARK', distanceMeters: 340, lat: 33.4981, lng: 126.5281, sourceLabel: '예시 데이터' },
]);
const FEATURES = normalizeListingFeatures([
  { text: '전용 36㎡·46㎡ 두 가지 면적으로 공급해요', kind: 'SUPPLY', evidence: { label: '모집공고 2. 공급 개요(예시)', page: 3 } },
  { text: '임대 조건은 시세 대비 낮게 책정돼요', kind: 'COST', evidence: { label: '모집공고 4. 임대 조건(예시)', page: 6 } },
  { text: '근거 없는 문구는 표시하지 않아요' }, // 근거가 없어 화면에서 빠지는 예
]);

const CARD: ListingCardModel = {
  key: 'preview-1',
  rank: 1,
  title: '예시 행복주택',
  subtitle: '신혼부부 계층 · 행복주택 · 공공임대 · ○○시',
  status: { tone: 'eligible', label: '신청 가능' },
  stage: '1순위 거주·소득 기준',
  media: MEDIA,
  housingType: '행복주택',
  district: '○○시',
  location: { label: '○○시 ○○동 123 (예시 주소)' },
  application: { label: '접수 10.20 ~ 10.22', state: 'UPCOMING', stateLabel: '접수 예정' },
  recommendation: { label: '적극 검토', level: 'high' },
  officialScore: { title: '해당 없음', detail: null, available: false },
  nearby: [{ key: 'bus', label: '교통 예시 버스정류장', distance: '도보 3분' }, { key: 'school', label: '학교 예시 초등학교', distance: '도보 8분' }],
  advantages: ['신혼·예비신혼·한부모', '가구 무주택'],
  cautions: ['서류 확인 · 신청자 등록장애인 여부'],
  note: null,
};
const CARD_EMPTY: ListingCardModel = { ...CARD, key: 'preview-2', rank: 2, media: null, location: null, application: null, nearby: [], recommendation: null, officialScore: null, advantages: [], cautions: [], stage: null, status: { tone: 'info', label: '공고 정보만 제공' }, note: '데이터가 비어 있을 때의 모습이에요.' };

const SUMMARY: RecommendationSummaryV2 = {
  top: { outcomeId: 'preview-1', title: '예시 행복주택', supply: '신혼부부 계층', tone: 'eligible', statusLabel: '신청 가능', stage: '1순위', next: '모집공고의 접수 일정과 제출 서류를 확인하세요.', reasons: ['신혼·예비신혼·한부모', '가구 무주택', '가구원수·맞벌이별 소득기준'] },
  favorites: [{ outcomeId: 'preview-3', title: '예시 매입임대', supply: '신혼·신생아 매입임대', tone: 'eligible', statusLabel: '신청 가능', stage: null, next: null }],
  alsoReview: [{ outcomeId: 'preview-4', title: '예시 일반 매입임대', supply: '일반 매입임대', tone: 'review', statusLabel: '추가 확인 필요', stage: null, next: null }],
  schedule: [{ listingId: 'a', title: '예시 행복주택', label: '10.20 ~ 10.22 · 접수 예정', state: 'upcoming', startDate: '2026-10-20' }],
  why: ['입력하신 조건으로는 1순위에 해당해요.', '신혼·예비신혼·한부모'],
  cautions: ['서류 확인 · 신청자 등록장애인 여부'],
  profile: { household: '자녀가 있는 가구', lines: ['행사 지역 거주', '세대 무주택', '주택청약종합저축 보유', '자녀 1명'] },
};

export default function ComponentsPreview() {
  const load = kioskEvent();
  const brand = load.ok ? load.event.config.copy.brand : '완판e';
  if (!isDemoModeEnabled()) {
    return (
      <KioskFrame brand={brand} hideChat confirmHome={false}>
        <View style={styles.off} testID="components-preview-disabled">
          <Text style={k.type.title}>찾는 화면이 없어요</Text>
          <KioskButton label="처음 화면으로" icon="home" onPress={resetToHome} />
        </View>
      </KioskFrame>
    );
  }
  return (
    <KioskFrame brand={brand} hideChat confirmHome={false} progress={{ label: 'V2 component 미리보기 · 운영자 전용' }}>
      <Body />
    </KioskFrame>
  );
}

function Body() {
  const { d, density } = useDensity();
  const title = (text: string) => <Text style={[d.type.section, { color: k.colors.text }]} accessibilityRole="header">{text}</Text>;
  return (
    <View style={{ gap: d.sectionGap }} testID="components-preview">
      <Notice tone="warn">{`예시 데이터로 V2 화면 부품을 확인하는 화면이에요. 지금 밀도: ${density}`}</Notice>
      {title('Listing Card V2')}
      <View style={[styles.grid, { gap: d.gridGap }]}>
        <ListingCardV2 model={CARD} testID="preview-card-full" actions={<KioskButton label="자세히 보기" icon="chevron-right" onPress={() => undefined} />} />
        <ListingCardV2 model={CARD_EMPTY} testID="preview-card-empty" />
      </View>
      {title('이 주택의 특징 / 확인할 점')}
      <View style={[styles.pair, density === 'compact' && styles.row, { gap: d.cardGap }]}>
        <View style={styles.half}><ListingFeatures features={FEATURES} /></View>
        <View style={styles.half}><ListingCautions items={['서류 확인 · 신청자 등록장애인 여부', '확인 필요 · 일반 매입임대 1순위 증명자격']} /></View>
      </View>
      {title('위치 · 지도 · 주변 시설')}
      <LocationSummary location={LOCATION} nearby={NEARBY} title="예시 행복주택" />
      <View style={[styles.pair, density === 'compact' && styles.row, { gap: d.cardGap }]}>
        <View style={styles.half}><ListingMap location={LOCATION} nearby={NEARBY} title="예시 행복주택" /></View>
        <View style={styles.half}><NearbyPlaces places={NEARBY} /></View>
      </View>
      <View style={styles.badges}>{NEARBY.slice(0, 3).map(place => <DistanceBadge key={place.id} place={place} />)}</View>
      {title('Recommendation Summary V2')}
      <RecommendationSummaryV2View summary={SUMMARY} onOpen={() => undefined} />
    </View>
  );
}

const styles = StyleSheet.create({
  off: { alignItems: 'center', gap: 20, paddingVertical: 80 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  pair: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  half: { flex: 1, minWidth: 0 },
  badges: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
