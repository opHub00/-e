import { MaterialIcons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { k } from '../ui/theme';
import { MEDIA_KIND_LABELS, type ListingMedia } from './listingMedia';

/**
 * 공고 이미지 UI.
 * - 사진은 '내가 신청할 집을 실제로 본다'는 연결을 만드는 역할이다. 자격 판정 상태보다 앞에 서지 않는다.
 * - 이미지가 없으면 주택 유형과 지역을 담은 차분한 placeholder 를 그린다(관광 사진·바다 이미지 쓰지 않음).
 */

type PlaceholderProps = { housingType: string; district: string; compact?: boolean };

export function MediaPlaceholder({ housingType, district, compact }: PlaceholderProps) {
  return (
    <View style={[styles.placeholder, compact && styles.placeholderCompact]} accessibilityLabel={`${housingType} 대표 이미지 준비 중`} testID="media-placeholder">
      {compact ? null : (
        <View style={styles.placeholderText}>
          <Text style={styles.placeholderTitle}>{housingType}</Text>
          <Text style={styles.placeholderMeta}>{district} · 대표 이미지 준비 중</Text>
        </View>
      )}
      {/* 건물 실루엣: 높이가 다른 블록 세 개. 특정 단지를 흉내 내지 않는다. 바닥선에 붙여 '건물'로 읽히게. */}
      <View style={[styles.skyline, compact && styles.skylineCompact]}>
        <View style={[styles.block, { height: '55%' }]} />
        <View style={[styles.block, styles.blockTall, { height: '100%' }]} />
        <View style={[styles.block, { height: '72%' }]} />
      </View>
    </View>
  );
}

/** 결과 카드 왼쪽 작은 정사각 썸네일. 카드의 주인공은 판정 상태라 크기를 키우지 않는다. */
export function ListingThumb({ media, housingType, district }: { media: ListingMedia[]; housingType: string; district: string }) {
  const first = media[0];
  return (
    <View style={styles.thumb} testID={first ? 'listing-thumb-image' : 'listing-thumb-placeholder'}>
      {first ? (
        <Image source={{ uri: first.uri }} style={styles.fill} resizeMode="cover" accessibilityLabel={first.alt} />
      ) : (
        <MediaPlaceholder housingType={housingType} district={district} compact />
      )}
    </View>
  );
}

/**
 * 공고 상세의 대표 이미지 / 갤러리.
 * 여러 장이면 좌우로 넘기거나(swipe) 아래 점·화살표를 눌러 이동한다. 출처는 사진 위 구석에 작게.
 */
export function ListingGallery({ media, housingType, district, title }: { media: ListingMedia[]; housingType: string; district: string; title: string }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const width = size.width;
  const [index, setIndex] = useState(0);
  const scroller = useRef<ScrollView>(null);
  // 가로 스크롤 안에서는 '100%' 높이가 0 이 된다. 실제 크기를 재서 한 장씩 맞춘다.
  const onLayout = (event: LayoutChangeEvent) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height });
  const go = (next: number) => {
    const clamped = Math.max(0, Math.min(media.length - 1, next));
    setIndex(clamped);
    scroller.current?.scrollTo({ x: clamped * width, animated: true });
  };
  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  if (!media.length) {
    return (
      // 사진이 없을 때는 낮은 띠로만 둔다. 빈 사진 자리가 판정 정보를 화면 아래로 밀어내지 않게.
      <View style={[styles.hero, styles.heroEmpty]} testID="listing-gallery-empty">
        <MediaPlaceholder housingType={housingType} district={district} />
      </View>
    );
  }

  const current = media[Math.min(index, media.length - 1)];
  return (
    <View style={styles.gallery} testID="listing-gallery" accessibilityLabel={`${title} 이미지 ${media.length}장 중 ${index + 1}번째`}>
      <View style={styles.hero} onLayout={onLayout}>
        {width ? (
          <ScrollView
            ref={scroller}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
            onScrollEndDrag={onScrollEnd}
            scrollEventThrottle={16}
          >
            {media.map(item => (
              <Image key={item.uri} source={{ uri: item.uri }} style={{ width, height: size.height }} resizeMode="cover" accessibilityLabel={item.alt} />
            ))}
          </ScrollView>
        ) : null}
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>{MEDIA_KIND_LABELS[current.kind]}{media.length > 1 ? ` ${index + 1}/${media.length}` : ''}</Text>
        </View>
        {current.credit ? (
          <View style={styles.credit} pointerEvents="none">
            <Text style={styles.creditText} numberOfLines={1}>출처 · {current.credit}</Text>
          </View>
        ) : null}
        {media.length > 1 ? (
          <>
            <MotionPressable accessibilityRole="button" accessibilityLabel="이전 사진" onPress={() => go(index - 1)} disabled={index === 0} style={[styles.arrow, styles.arrowLeft, index === 0 && styles.arrowHidden]}>
              <MaterialIcons name="chevron-left" size={28} color={k.colors.text} />
            </MotionPressable>
            <MotionPressable accessibilityRole="button" accessibilityLabel="다음 사진" onPress={() => go(index + 1)} disabled={index === media.length - 1} style={[styles.arrow, styles.arrowRight, index === media.length - 1 && styles.arrowHidden]}>
              <MaterialIcons name="chevron-right" size={28} color={k.colors.text} />
            </MotionPressable>
          </>
        ) : null}
      </View>
      {media.length > 1 ? (
        <View style={styles.dots}>
          {media.map((item, position) => (
            <MotionPressable key={item.uri} accessibilityRole="button" accessibilityLabel={`${position + 1}번째 사진 보기`} onPress={() => go(position)} style={styles.dotHit}>
              <View style={[styles.dot, position === index && styles.dotActive]} />
            </MotionPressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  placeholder: { flex: 1, backgroundColor: k.colors.surfaceLow, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, gap: 16, overflow: 'hidden', borderBottomWidth: 3, borderBottomColor: k.colors.primaryFixed },
  placeholderCompact: { paddingHorizontal: 0, paddingTop: 0, justifyContent: 'center', borderBottomWidth: 0 },
  skyline: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: '70%', maxHeight: 120 },
  skylineCompact: { gap: 4, height: 44 },
  block: { width: 22, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: k.colors.primaryFixed },
  blockTall: { backgroundColor: k.colors.outline },
  placeholderText: { gap: 2, flexShrink: 1, paddingBottom: 18 },
  placeholderTitle: { ...k.type.bodyLgStrong, color: k.colors.text },
  placeholderMeta: { ...k.type.caption, color: k.colors.textMuted },
  thumb: { width: 72, height: 72, borderRadius: 14, overflow: 'hidden', backgroundColor: k.colors.surfaceLow },
  gallery: { gap: 10 },
  hero: { width: '100%', aspectRatio: 16 / 9, maxHeight: 300, borderRadius: 20, overflow: 'hidden', backgroundColor: k.colors.surfaceLow },
  heroEmpty: { aspectRatio: undefined, height: 132 },
  badge: { position: 'absolute', top: 12, left: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.88)' },
  badgeText: { ...k.type.caption, color: k.colors.text },
  credit: { position: 'absolute', right: 10, bottom: 10, maxWidth: '70%', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(28,27,34,0.55)' },
  creditText: { ...k.type.caption, fontSize: 12, lineHeight: 16, color: '#FFFFFF' },
  arrow: { position: 'absolute', top: '50%', marginTop: -24, width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
  arrowLeft: { left: 10 },
  arrowRight: { right: 10 },
  arrowHidden: { opacity: 0 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 2 },
  dotHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: k.colors.outline },
  dotActive: { width: 20, backgroundColor: k.colors.primary },
});
