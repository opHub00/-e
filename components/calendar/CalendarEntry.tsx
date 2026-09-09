import { MaterialIcons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '../../design/tokens';
import { IconChip } from '../IconChip';
import { MotionPressable } from '../motion/MotionPressable';
import { WanpanCard } from '../WanpanCard';

export function CalendarEntry() {
  const router = useRouter();
  return (
    <WanpanCard style={styles.card}>
      <MotionPressable accessibilityRole="button" onPress={() => router.push('/calendar' as Href)} style={styles.row}>
        <IconChip name="calendar-month" tone="purple" />
        <View style={styles.copy}>
          <Text style={styles.title}>청약 캘린더</Text>
          <Text style={styles.body}>접수·발표·계약 일정을 월별로 확인해요</Text>
        </View>
        <MaterialIcons name="chevron-right" size={20} color={colors.outline} />
      </MotionPressable>
    </WanpanCard>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.screen, marginTop: spacing.lg, padding: 0 },
  row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  copy: { flex: 1 },
  title: { ...type.rowTitle, color: colors.text },
  body: { ...type.caption, color: colors.textMuted, marginTop: 2 },
});
