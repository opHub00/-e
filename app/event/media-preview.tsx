import { StyleSheet, Text, View } from 'react-native';
import { isDemoModeEnabled } from '../../features/eventKiosk/demo/demoMode';
import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import { emptyListingMedia, normalizeListingMedia } from '../../features/eventKiosk/media/listingMedia';
import { ListingGallery, ListingThumb } from '../../features/eventKiosk/media/ListingMediaView';
import { KioskButton, Notice } from '../../features/eventKiosk/ui/controls';
import { KioskFrame } from '../../features/eventKiosk/ui/KioskFrame';
import { resetToHome } from '../../features/eventKiosk/ui/navigation';
import { k } from '../../features/eventKiosk/ui/theme';

/**
 * 운영·개발용: 공고 이미지 UI 미리보기. 실제 공고 이미지가 들어오기 전에 갤러리·썸네일·placeholder 를 확인한다.
 * 예시 이미지는 앱 안에서 만든 단색 그림이다(실제 주택 사진 아님). Demo Mode 에서만 열린다.
 */
const sample = (fill: string, label: string) =>
  `data:image/svg+xml;base64,${toBase64(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="${fill}"/><g fill="#ffffff" opacity="0.85"><rect x="420" y="300" width="180" height="480" rx="10"/><rect x="660" y="180" width="220" height="600" rx="10"/><rect x="940" y="360" width="200" height="420" rx="10"/></g><text x="800" y="860" font-size="40" text-anchor="middle" fill="#ffffff" font-family="sans-serif">${label}</text></svg>`)}`;

/** RN Web 의 Image 는 URL 인코딩한 SVG data URI 를 읽지 못해 base64 로 넣는다. 예시 글자는 ASCII 만 쓴다. */
function toBase64(svg: string): string {
  return typeof btoa === 'function' ? btoa(svg) : '';
}

const SAMPLE_MEDIA = normalizeListingMedia(
  [
    { uri: sample('#6E6A9E', 'Sample 1'), alt: '예시 단지 전경', sourceLabel: '예시 이미지 · 실제 사진 아님', kind: 'photo' },
    { uri: sample('#8A86B8', 'Sample 2'), alt: '예시 단지 조감도', sourceLabel: '예시 조감도', kind: 'render' },
    { uri: sample('#A9A6CC', 'Sample 3'), alt: '예시 위치', kind: 'map' },
  ],
  '예시 공고 이미지',
);

export default function MediaPreview() {
  const load = kioskEvent();
  const brand = load.ok ? load.event.config.copy.brand : '완판e';
  if (!isDemoModeEnabled() || !load.ok) {
    return (
      <KioskFrame brand={brand} hideChat confirmHome={false}>
        <View style={styles.off} testID="media-preview-disabled">
          <Text style={k.type.title}>찾는 화면이 없어요</Text>
          <KioskButton label="처음 화면으로" icon="home" onPress={resetToHome} />
        </View>
      </KioskFrame>
    );
  }
  const listing = load.event.config.listings[0];
  return (
    <KioskFrame brand={brand} hideChat confirmHome={false} progress={{ label: '공고 이미지 미리보기 · 운영자 전용' }}>
      <View style={styles.stack} testID="media-preview">
        <Notice tone="warn">예시 그림으로 갤러리 동작만 확인하는 화면이에요. 실제 공고 이미지는 데이터가 들어오면 같은 자리에 표시돼요.</Notice>
        <Text style={styles.section}>상세 · 이미지 여러 장</Text>
        <ListingGallery media={SAMPLE_MEDIA} housingType={listing.housingType} district={listing.district} title={listing.title} />
        <Text style={styles.section}>상세 · 이미지 없음</Text>
        <ListingGallery media={emptyListingMedia(listing.title)} housingType={listing.housingType} district={listing.district} title={listing.title} />
        <Text style={styles.section}>결과 카드 썸네일</Text>
        <View style={styles.row}>
          <ListingThumb media={SAMPLE_MEDIA} housingType={listing.housingType} district={listing.district} />
          <ListingThumb media={emptyListingMedia(listing.title)} housingType={listing.housingType} district={listing.district} />
        </View>
      </View>
    </KioskFrame>
  );
}

const styles = StyleSheet.create({
  off: { alignItems: 'center', gap: 20, paddingVertical: 80 },
  stack: { gap: 14 },
  section: { ...k.type.section, color: k.colors.text, marginTop: 12 },
  row: { flexDirection: 'row', gap: 12 },
});
