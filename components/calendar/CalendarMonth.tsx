import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, size, spacing, type } from '../../design/tokens';
import type { CalendarDay } from '../../features/calendar/calendarModel';
import { getMonthLabel } from '../../features/calendar/domain';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

type Props = {
  monthId: string;
  days: readonly CalendarDay[];
  selectedDate: string;
  eventCounts: ReadonlyMap<string, number>;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onSelect: (date: string) => void;
};

export function CalendarMonth({
  monthId,
  days,
  selectedDate,
  eventCounts,
  onPrevious,
  onNext,
  onToday,
  onSelect,
}: Props) {
  return (
    <View>
      <View style={styles.monthHead}>
        <Pressable accessibilityRole="button" accessibilityLabel="이전 달" hitSlop={4} onPress={onPrevious} style={styles.iconButton}>
          <MaterialIcons name="chevron-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.monthLabel}>{getMonthLabel(monthId)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="다음 달" hitSlop={4} onPress={onNext} style={styles.iconButton}>
          <MaterialIcons name="chevron-right" size={22} color={colors.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="오늘로 이동" onPress={onToday} style={styles.todayButton}>
          <Text style={styles.todayText}>오늘</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((weekday) => <Text key={weekday} style={styles.weekday}>{weekday}</Text>)}
      </View>
      <View style={styles.grid}>
        {days.map((day) => {
          const selected = day.date === selectedDate;
          const count = eventCounts.get(day.date) ?? 0;
          return (
            <Pressable
              key={day.date}
              accessibilityRole="button"
              accessibilityLabel={`${day.date}${count ? `, 일정 ${count}개` : ''}`}
              accessibilityState={{ selected }}
              onPress={() => onSelect(day.date)}
              style={styles.dayCell}
            >
              <View style={[styles.dayNumber, day.isToday && styles.todayNumber, selected && styles.selectedNumber]}>
                <Text style={[
                  styles.dayText,
                  !day.inCurrentMonth && styles.fillerText,
                  day.isToday && styles.todayNumberText,
                  selected && styles.selectedNumberText,
                ]}>{day.day}</Text>
              </View>
              <View style={[styles.indicator, day.hasEvents && styles.indicatorVisible]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  monthHead: { minHeight: size.touch, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  monthLabel: { ...type.section, color: colors.text, flex: 1, textAlign: 'center' },
  iconButton: { width: size.touch, height: size.touch, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  todayButton: { minHeight: size.touch, justifyContent: 'center', paddingHorizontal: spacing.sm },
  todayText: { ...type.label, color: colors.primary },
  weekRow: { flexDirection: 'row', marginTop: spacing.sm },
  weekday: { ...type.caption, color: colors.textSubtle, width: `${100 / 7}%`, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xs },
  dayCell: { width: `${100 / 7}%`, minHeight: 54, alignItems: 'center', justifyContent: 'center' },
  dayNumber: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  todayNumber: { borderWidth: 1, borderColor: colors.primary },
  selectedNumber: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayText: { ...type.bodySmStrong, color: colors.text },
  fillerText: { color: colors.outline },
  todayNumberText: { color: colors.primary },
  selectedNumberText: { color: colors.onPrimary },
  indicator: { width: 5, height: 5, borderRadius: radius.pill, backgroundColor: 'transparent', marginTop: 2 },
  indicatorVisible: { backgroundColor: colors.warning },
});
