import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ListingMedia, ListingMediaImage } from '../live/types.ts';
import { imageFailureFallback } from '../live/portfolio.ts';
import { MotionPressable } from '../../../components/motion/MotionPressable.tsx';
import { k } from './theme.ts';

export function ListingMediaView({
  media,
  variant,
  testID,
}: {
  media: ListingMedia;
  variant: 'card' | 'detail';
  testID?: string;
}) {
  const [shown, setShown] = useState(media);
  const [selected, setSelected] = useState<ListingMediaImage | null>(media.primary);
  useEffect(() => {
    setShown(media);
    setSelected(media.primary);
  }, [media]);
  const detail = variant === 'detail';

  if (!selected || !shown.primary) {
    return (
      <View style={[styles.frame, detail ? styles.detailFrame : styles.cardFrame]} testID={testID}>
        <MaterialIcons name="apartment" size={detail ? 44 : 32} color={k.colors.primary} />
        <Text style={detail ? styles.placeholderDetail : styles.placeholder} numberOfLines={2}>{shown.placeholder.label}</Text>
        <Text style={styles.placeholderNote}>공식 주택 이미지 준비 중</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap} testID={testID}>
      <View style={[styles.frame, detail ? styles.detailFrame : styles.cardFrame]}>
        <Image
          accessibilityLabel={`${shown.placeholder.label} 공식 제공 이미지`}
          source={{ uri: selected.imageUrl }}
          style={styles.image}
          resizeMode="cover"
          onError={() => {
            const fallback = imageFailureFallback(shown);
            setShown(fallback);
            setSelected(null);
          }}
          {...(Platform.OS === 'web' ? { loading: detail ? 'eager' as const : 'lazy' as const } : null)}
        />
      </View>
      {detail && shown.gallery.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
          {shown.gallery.map(image => (
            <MotionPressable
              key={image.imageUrl}
              accessibilityRole="button"
              accessibilityLabel="이미지 크게 보기"
              accessibilityState={{ selected: selected.imageUrl === image.imageUrl }}
              onPress={() => setSelected(image)}
              style={[styles.thumb, selected.imageUrl === image.imageUrl && styles.thumbActive]}
            >
              <Image source={{ uri: image.imageUrl }} style={styles.thumbImage} resizeMode="cover" />
            </MotionPressable>
          ))}
        </ScrollView>
      ) : null}
      {detail ? (
        <Text style={styles.source} testID="listing-image-source">
          이미지 출처: {selected.sourceName}{selected.attribution ? ` · ${selected.attribution}` : ''}{selected.license ? ` · ${selected.license}` : ''}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  frame: { overflow: 'hidden', borderRadius: 16, backgroundColor: k.colors.lavender, alignItems: 'center', justifyContent: 'center' },
  cardFrame: { height: 132 },
  detailFrame: { height: 300, maxHeight: 420 },
  image: { width: '100%', height: '100%', minHeight: 132 },
  placeholder: { ...k.type.bodyStrong, color: k.colors.text, textAlign: 'center', paddingHorizontal: 16 },
  placeholderDetail: { ...k.type.section, color: k.colors.text, textAlign: 'center', paddingHorizontal: 24 },
  placeholderNote: { ...k.type.caption, color: k.colors.textMuted },
  gallery: { gap: 8 },
  thumb: { width: 112, height: 72, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  thumbActive: { borderColor: k.colors.primary },
  thumbImage: { width: '100%', height: '100%' },
  source: { ...k.type.caption, color: k.colors.textMuted },
});
