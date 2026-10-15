import { Image, StyleSheet, View } from 'react-native';
import { BRAND } from './brandAssets';

/**
 * 완판e 브랜드 표시: [완판이 캐릭터 + 원본 로고의 '완판e' 글자]. 둘 다 원본 asset 이미지다(글자를 폰트로 다시 만들지 않는다).
 * size: header(모든 화면 위 틀) · hero(landing·story, 조금 크게) · mobile(QR 휴대폰 결과).
 */
export type BrandMarkSize = 'header' | 'hero' | 'mobile';

const SIZES: Record<BrandMarkSize, { character: number; wordmark: number; gap: number }> = {
  header: { character: 44, wordmark: 26, gap: 6 },
  hero: { character: 56, wordmark: 32, gap: 8 },
  mobile: { character: 40, wordmark: 24, gap: 6 },
};

export function BrandMark({ size = 'header', label = BRAND.name, compact = false }: { size?: BrandMarkSize; label?: string; compact?: boolean }) {
  const spec = SIZES[size];
  const scale = compact ? 0.86 : 1;
  const character = Math.round(spec.character * scale);
  const wordmark = Math.round(spec.wordmark * scale);
  return (
    <View testID="brand-mark" style={[styles.row, { gap: spec.gap }]} accessibilityLabel={label} accessibilityRole="image">
      {BRAND.character ? (
        <Image
          testID="brand-character"
          source={BRAND.character.source}
          style={{ height: character, width: character * BRAND.character.ratio }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ) : null}
      {BRAND.wordmark ? (
        <Image
          testID="brand-wordmark"
          source={BRAND.wordmark.source}
          style={{ height: wordmark, width: wordmark * BRAND.wordmark.ratio }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 0 },
});
