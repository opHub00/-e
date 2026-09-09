import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../motion/MotionPressable';
import { StatusPill } from '../StatusPill';
import { colors, spacing, type } from '../../design/tokens';
import type { CalendarEvent, CalendarEventType } from '../../features/calendar/calendarModel';
import { getDdayLabel, parseDateOnly } from '../../features/calendar/domain';

const EVENT_TONE: Record<CalendarEventType, React.ComponentProps<typeof StatusPill>['tone']> = {
  announcement: 'purple',
  'special-supply': 'pink',
  'first-priority': 'amber',
  'second-priority': 'amber',
  application: 'amber',
  winner: 'green',
  contract: 'purple',
};

type Props = {
  date: string;
  today: string;
  events: readonly CalendarEvent[];
  onOpenListing: (listingId: string) => void;
};

export function CalendarAgenda({ date, today, events, onOpenListing }: Props) {
  const parts = parseDateOnly(date);
  const title = parts ? `${parts.month}월 ${parts.day}일` : date;
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.count}>{events.length ? `${events.length}개 일정` : '일정 없음'}</Text>
      </View>
      {events.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="event-available" size={22} color={colors.textSubtle} />
          <Text style={styles.emptyText}>이 날짜에는 확인할 청약 일정이 없어요.</Text>
        </View>
      ) : events.map((event, index) => (
        <MotionPressable
          key={event.id}
          accessibilityRole="button"
          accessibilityLabel={`${event.listingName}, ${event.label}`}
          onPress={() => onOpenListing(event.listingId)}
          style={[styles.row, index > 0 && styles.rowBorder]}
        >
          <View style={styles.copy}>
            <Text style={styles.listingName} numberOfLines={2}>{event.listingName}</Text>
            <View style={styles.meta}>
              <StatusPill label={event.label} tone={EVENT_TONE[event.type]} />
              <Text style={styles.dday}>{getDdayLabel(event.date, today)}</Text>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={colors.outline} />
        </MotionPressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.lg },
  heading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: spacing.sm },
  title: { ...type.section, color: colors.text },
  count: { ...type.caption, color: colors.textSubtle },
  empty: { minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyText: { ...type.bodySm, color: colors.textMuted, textAlign: 'center' },
  row: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.hairline },
  copy: { flex: 1, gap: spacing.sm },
  listingName: { ...type.rowTitle, color: colors.text },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  dday: { ...type.label, color: colors.primary },
});
