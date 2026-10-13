import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { useDensity } from '../layout/DensityContext';
import { SAMDO_DEEP_RULE_PACKAGE } from '../samdo/rulePackage';
import { k } from '../ui/theme';
import { BRAND } from '../brand/brandAssets';

/** 결과 목록에서 공고 전용 분석으로 가는 입구. 목록의 순서·판정에는 영향을 주지 않는다. */
export function SamdoEntryBanner() {
  const { d } = useDensity();
  return (
    <MotionPressable
      testID="open-samdo-result"
      accessibilityRole="button"
      accessibilityLabel={`${SAMDO_DEEP_RULE_PACKAGE.title} 전용 분석 보기`}
      onPress={() => router.push('/event/samdo' as never)}
      style={[styles.banner, { padding: d.cardPadding - 4, minHeight: d.control }]}
    >
      {BRAND.character ? <Image source={BRAND.character.source} style={{ width: 44 * BRAND.character.ratio, height: 44 }} resizeMode="contain" /> : null}
      <View style={styles.copy}>
        <Text style={[d.type.bodyStrong, { color: k.colors.text }]}>{SAMDO_DEEP_RULE_PACKAGE.title}</Text>
        <Text style={[d.type.caption, { color: k.colors.textMuted }]}>이 공고에 어떤 유형으로 신청하는 게 가장 유리한지 따로 분석했어요.</Text>
      </View>
      <MaterialIcons name="chevron-right" size={28} color={k.colors.primary} />
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: k.colors.primaryFixed, borderRadius: k.radius.lg },
  copy: { flex: 1, minWidth: 0, gap: 2 },
});
