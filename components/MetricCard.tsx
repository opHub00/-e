import { StyleSheet, Text, View } from 'react-native';
import { WanpanCard } from './WanpanCard';
import { colors, radius, spacing, type } from '../design/tokens';

type Props = {
  label: string;
  value: string | number;
  caption?: string;
  /** 변화량 badge. 예: '2년 뒤 +12' */
  delta?: string;
  /** plain = 흰 카드 / accent = 라벤더 강조 / hero = 화면의 첫 시선 */
  variant?: 'plain' | 'accent' | 'hero';
};

/** 숫자가 첫 번째 시선. 설명은 한 줄. 변화량은 별도 badge. */
export function MetricCard({ label, value, caption, delta, variant = 'plain' }: Props) {
  const accent = variant !== 'plain';

  return (
    <WanpanCard tone={accent ? 'lavender' : 'surface'}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, accent && styles.valueAccent, variant === 'hero' && styles.valueHero]}>
          {value}
        </Text>
        {delta ? (
          <View style={styles.deltaBadge}>
            <Text style={styles.deltaText}>{delta}</Text>
          </View>
        ) : null}
      </View>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </WanpanCard>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, color: colors.textMuted },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  value: { ...type.metric, color: colors.text },
  valueAccent: { color: colors.primary },
  valueHero: { ...type.display },
  deltaBadge: {
    flexShrink: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  deltaText: { ...type.label, color: colors.success },
  caption: { ...type.body, color: colors.textMuted },
});
