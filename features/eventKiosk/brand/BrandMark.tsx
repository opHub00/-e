import { Image, StyleSheet, View } from 'react-native';
import { BRAND } from './brandAssets';

/**
 * 완판e 브랜드 표시: 완판이(원본 캐릭터) + '완판e' 글자.
 * size: header(모든 화면 위 틀, 작게) · hero(landing·story, 조금 크게) · mobile(QR 휴대폰 결과).
 * 글자는 이름 정보라 그대로 두고 캐릭터와 나란히 놓는다.
 */
export type BrandMarkSize = 'header' | 'hero' | 'mobile';

const SIZES: Record<BrandMarkSize, { character: number }> = {
  header: { character: 44 },
  hero: { character: 60 },
  mobile: { character: 40 },
};

export function BrandMark({ size = 'header', label = BRAND.name, compact = false }: { size?: BrandMarkSize; label?: string; compact?: boolean }) {
  const spec = SIZES[size];
  const character = compact ? Math.round(spec.character * 0.86) : spec.character;
  return (
    <View testID="brand-mark" style={styles.row} accessibilityLabel={label} accessibilityRole="image">
      {BRAND.character ? (
        <Image
          testID="brand-character"
          source={BRAND.character.source}
          style={{ height: character, width: character * BRAND.character.ratio }}
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
