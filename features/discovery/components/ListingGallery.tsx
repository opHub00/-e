import { useState } from 'react';
import { Image, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ImageStyle, StyleProp } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { colors, radius, tracking, type } from '../../../design/tokens';
import type { ListingGalleryImage } from '../../listingVisual/types';

/** 한 장짜리 목록은 갤러리가 아니다. 대표 이미지만 크게 두고 아래를 비운다. */
const MIN_ITEMS = 2;
const THUMB_WIDTH = 132;
const THUMB_HEIGHT = 88;

type Props = {
  images: ListingGalleryImage[];
  /** 지금 위에 크게 걸려 있는 이미지. 눌러서 바꾸면 호출부가 이 값을 바꿔 준다. */
  selectedUrl: string;
  onSelect: (image: ListingGalleryImage) => void;
};

/**
 * 공식 홈페이지에서 가져온 사진 목록.
 *
 * 좁은 화면에서는 가로로 밀어서 본다. 세로로 쌓으면 상세의 정보가 한참 밀려난다.
 * 순서는 resolver 가 정한다: 외관 → 단지 전경 → 조감·투시 → 조경 → 커뮤니티.
 * 여기서는 그 순서를 바꾸지 않는다.
 */
export function ListingGallery({ images, selectedUrl, onSelect }: Props) {
  const [failed, setFailed] = useState<string[]>([]);
  const shown = images.filter(image => !failed.includes(image.url));
  if (shown.length < MIN_ITEMS) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>공식 홈페이지 사진 {shown.length}장</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        // 손가락으로 미는 화면에서 끝에 딱 붙도록.
        snapToInterval={THUMB_WIDTH + 8}
        decelerationRate="fast"
      >
        {shown.map(image => {
          const active = image.url === selectedUrl;
          return (
            <MotionPressable
              key={image.url}
              accessibilityRole="button"
              accessibilityLabel={`${image.label} 크게 보기`}
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(image)}
              style={[styles.item, active && styles.itemActive]}
            >
              <Image
                accessibilityIgnoresInvertColors
                source={{ uri: image.url }}
                style={styles.image as StyleProp<ImageStyle>}
                resizeMode="cover"
                onError={() => setFailed(current => [...current, image.url])}
                {...(Platform.OS === 'web' ? { loading: 'lazy' as const } : null)}
              />
              <Text style={styles.label} numberOfLines={1}>{image.label}</Text>
            </MotionPressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  heading: { ...type.micro, color: colors.textSubtle, letterSpacing: tracking.wide },
  row: { gap: 8, paddingRight: 4 },
  item: {
    width: THUMB_WIDTH,
    borderRadius: radius.cardSm,
    overflow: 'hidden',
    backgroundColor: colors.lavender,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  /** 지금 위에 걸린 사진을 테두리로 알린다. 어떤 걸 보고 있는지 놓치지 않게. */
  itemActive: { borderColor: colors.primary },
  image: { width: '100%', height: THUMB_HEIGHT },
  label: {
    ...type.micro,
    color: colors.textMuted,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: colors.surfaceLow,
  },
});
