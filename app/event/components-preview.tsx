import { StyleSheet, Text, View } from 'react-native';
import { isDemoModeEnabled } from '../../features/eventKiosk/demo/demoMode';
import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import { useDensity } from '../../features/eventKiosk/layout/DensityContext';
import { ListingCautions, ListingFeatures, ListingMap, LocationSummary, NearbyPlaces } from '../../features/eventKiosk/location/LocationViews';
import type { ListingHighlight, ListingLocation, NearbyPoi } from '../../features/eventKiosk/live/types';
import type { RecommendationPortfolio } from '../../features/eventKiosk/live/recommendation';
import { normalizeListingMedia } from '../../features/eventKiosk/media/listingMedia';
import { KioskButton, Notice } from '../../features/eventKiosk/ui/controls';
import { KioskFrame } from '../../features/eventKiosk/ui/KioskFrame';
import { resetToHome } from '../../features/eventKiosk/ui/navigation';
import { k } from '../../features/eventKiosk/ui/theme';
import type { ListingCardModel } from '../../features/eventKiosk/v2/listingCardModel';
import { ListingCardV2 } from '../../features/eventKiosk/v2/ListingCardV2';
import { RecommendationSummaryV2View } from '../../features/eventKiosk/v2/RecommendationSummaryV2View';

/**
 * 운영·디자인 확인용: V2 presentation component 를 '모든 칸이 찬 예시 데이터'로 한 화면에 모은다.
 * Figma `Jeju Listing Experience V2` 비교와 Codex 데이터 연결 확인에 쓴다. Demo Mode 에서만 열린다.
 * 예시 값은 실제 공고·장소가 아니다.
 */
const svg = (fill: string) =>
  `data:image/svg+xml;base64,${typeof btoa === 'function' ? btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="${fill}"/><g fill="#fff" opacity=".85"><rect x="200" y="200" width="110" height="320" rx="8"/><rect x="345" y="120" width="130" height="400" rx="8"/><rect x="510" y="250" width="110" height="270" rx="8"/></g></svg>`) : ''}`;

const MEDIA = normalizeListingMedia([{ uri: svg('#7A75AE'), alt: '예시 단지', sourceLabel: '예시 이미지', kind: 'photo' }], '예시 단지');
const LOCATION: ListingLocation = { normalizedAddress: '제주특별자치도 제주시 예시동 123', latitude: 33.5, longitude: 126.53, status: 'RESOLVED', source: 'OFFICIAL_SOURCE' };
const NEARBY: NearbyPoi[] = [
  { id: 'bus', name: '예시 버스정류장', category: 'TRANSIT', straightDistanceMeters: 180, routeDistanceMeters: null, latitude: 33.5012, longitude: 126.5306, source: '예시 데이터', sourceUrl: null },
  { id: 'school', name: '예시 초등학교', category: 'EDUCATION', straightDistanceMeters: 520, routeDistanceMeters: null, latitude: 33.4968, longitude: 126.5338, source: '예시 데이터', sourceUrl: null },
  { id: 'mart', name: '예시 마트', category: 'SHOPPING', straightDistanceMeters: 760, routeDistanceMeters: null, latitude: 33.5049, longitude: 126.5259, source: '예시 데이터', sourceUrl: null },
  { id: 'hospital', name: '예시 병원', category: 'HOSPITAL', straightDistanceMeters: 1900, routeDistanceMeters: null, latitude: 33.5135, longitude: 126.5402, source: '예시 데이터', sourceUrl: null },
  { id: 'park', name: '예시 근린공원', category: 'PARK', straightDistanceMeters: 340, routeDistanceMeters: null, latitude: 33.4981, longitude: 126.5281, source: '예시 데이터', sourceUrl: null },
];
const FEATURES: ListingHighlight[] = [
  { text: '전용 36㎡·46㎡ 두 가지 면적으로 공급해요', category: 'AREA', evidence: { kind: 'OFFICIAL_LISTING', source: '모집공고 2. 공급 개요(예시)', sourceUrl: null, poiId: null, distanceMeters: null } },
  { text: '예시 버스정류장이 약 180m 거리에 있어요.', category: 'TRANSPORT', evidence: { kind: 'POI', source: '예시 데이터', sourceUrl: null, poiId: 'bus', distanceMeters: 180 } },
];

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

const SUMMARY: RecommendationPortfolio = {
  schemaVersion: 1, generatedAt: '2026-10-10T00:00:00.000Z', counts: { COMPLETE: 1, NEEDS_USER_INPUT: 1, INELIGIBLE: 0, UNAVAILABLE: 0, INFORMATION_ONLY: 0 },
  items: [
    { id: 'preview-1', listing: { canonicalKey: 'preview:a', title: '예시 행복주택', housingName: '예시 행복주택', provider: '예시 공급기관', sourceUrl: 'https://example.com', assessmentAvailability: 'ASSESSABLE' }, supplyType: '신혼부부 계층', assessmentStatus: 'COMPLETE', priority: { rank: 1, label: '1순위' }, officialScore: { status: 'NOT_APPLICABLE', total: null, max: null, reason: '공식 배점 없음' }, wanpanRecommendation: { level: 'high', label: '적극 검토' }, whyMatched: ['신혼·예비신혼·한부모', '가구 무주택'], cautions: ['서류 확인이 필요해요.'], missingDocuments: [], applicationDates: { start: '2026-10-20', end: '2026-10-22', status: 'UPCOMING' }, location: LOCATION, primaryImage: null, nearbyHighlights: FEATURES, favorite: true, rank: 1 },
    { id: 'preview-2', listing: { canonicalKey: 'preview:b', title: '예시 매입임대', housingName: '예시 매입임대', provider: '예시 공급기관', sourceUrl: 'https://example.com', assessmentAvailability: 'ASSESSABLE' }, supplyType: '일반 매입임대', assessmentStatus: 'NEEDS_USER_INPUT', priority: { rank: null, label: null }, officialScore: { status: 'PENDING', total: null, max: null, reason: '확인 필요' }, wanpanRecommendation: { level: 'medium', label: '검토 가능' }, whyMatched: [], cautions: ['조건 확인이 필요해요.'], missingDocuments: [], applicationDates: { start: null, end: null, status: 'UNKNOWN' }, location: LOCATION, primaryImage: null, nearbyHighlights: [], favorite: false, rank: 2 },
  ],
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
      {title('Recommendation Summary V2')}
      <RecommendationSummaryV2View portfolio={SUMMARY} answers={null} onOpen={() => undefined} />
    </View>
  );
}

const styles = StyleSheet.create({
  off: { alignItems: 'center', gap: 20, paddingVertical: 80 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  pair: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  half: { flex: 1, minWidth: 0 },
});
