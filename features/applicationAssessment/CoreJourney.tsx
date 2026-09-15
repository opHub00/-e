import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { colors, radius, size, spacing, type } from '../../design/tokens';

const ENTRIES = [
  { title: '청약찾기', description: '어떤 공고가 있지?', icon: 'travel-explore', route: '/discovery' },
  { title: '청약 맞춤판정', description: '나는 어떻게 신청할 수 있지?', icon: 'fact-check', route: '/assessment' },
  { title: '준비하기', description: '지금 무엇을 준비해야 하지?', icon: 'insights', route: '/preparation' },
] as const;
export function CoreJourney() {
  const router = useRouter();
  return <View style={styles.section}>
    <Text accessibilityRole="header" style={styles.title}>공고 발견부터 신청 준비까지</Text>
    <View style={styles.group}>{ENTRIES.map((entry, index) => <MotionPressable key={entry.route} accessibilityRole="button" accessibilityLabel={`${entry.title}, ${entry.description}`} onPress={() => router.push(entry.route as Href)} style={[styles.row, index > 0 && styles.divider]}>
      <MaterialIcons name={entry.icon} size={24} color={colors.primary} />
      <View style={styles.copy}><Text style={styles.label}>{entry.title}</Text><Text style={styles.body}>{entry.description}</Text></View>
      <MaterialIcons name="chevron-right" size={20} color={colors.textSubtle} />
    </MotionPressable>)}</View>
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: spacing.md, paddingVertical: spacing.lg, paddingHorizontal: spacing.screen }, title: { ...type.section, color: colors.text },
  group: { borderRadius: radius.card, borderWidth: 1, borderColor: colors.surfaceHigh, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: size.control },
  divider: { borderTopWidth: 1, borderTopColor: colors.hairline }, copy: { flex: 1, gap: spacing.xs },
  label: { ...type.cardTitle, color: colors.text }, body: { ...type.bodySm, color: colors.textMuted },
});
