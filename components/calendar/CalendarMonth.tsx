import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, size, spacing, type } from '../../design/tokens';
import type { CalendarDay } from '../../features/calendar/calendarModel';
import { getMonthLabel, parseDateOnly } from '../../features/calendar/domain';
import { MotionPressable } from '../motion/MotionPressable';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 일정이 아무리 많아도 점은 3개까지만. 그 이상은 밀도만 흐려진다. */
const MAX_DOTS = 3;

/** 오늘·선택·일정 수를 색이 아니라 문장으로도 구분한다. */
function describeDay(day: CalendarDay, count: number): string {
  const parts = parseDateOnly(day.date);
  const base = parts ? `${parts.month}월 ${parts.day}일` : day.date;
  const today = day.isToday ? ', 오늘' : '';
  const events = count ? `, 일정 ${count}개` : ', 일정 없음';
  return `${base}${today}${events}`;
}

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
        <Text style={styles.monthLabel}>{getMonthLabel(monthId)}</Text>
        <MotionPressable accessibilityRole="button" accessibilityLabel="오늘로 이동" onPress={onToday} style={styles.todayButton}>
          <Text style={styles.todayText}>오늘</Text>
        </MotionPressable>
        <MotionPressable accessibilityRole="button" accessibilityLabel="이전 달" hitSlop={4} onPress={onPrevious} style={styles.iconButton}>
          <MaterialIcons name="chevron-left" size={22} color={colors.text} />
        </MotionPressable>
        <MotionPressable accessibilityRole="button" accessibilityLabel="다음 달" hitSlop={4} onPress={onNext} style={styles.iconButton}>
          <MaterialIcons name="chevron-right" size={22} color={colors.text} />
        </MotionPressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((weekday) => <Text key={weekday} style={styles.weekday}>{weekday}</Text>)}
      </View>
      <View style={styles.grid}>
        {days.map((day) => {
          const selected = day.date === selectedDate;
          const count = eventCounts.get(day.date) ?? 0;
          return (
            <MotionPressable
              key={day.date}
              accessibilityRole="button"
              accessibilityLabel={describeDay(day, count)}
              accessibilityState={{ selected }}
              aria-pressed={selected}
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
              <View style={styles.indicatorRow}>
                {Array.from({ length: Math.min(count, MAX_DOTS) }, (_, dot) => (
                  <View key={dot} style={styles.indicator} />
                ))}
              </View>
            </MotionPressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  monthHead: { minHeight: size.touch, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  monthLabel: { ...type.section, color: colors.text, flex: 1 },
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
  /** 점이 없는 날도 같은 높이를 차지해야 줄이 흔들리지 않는다. */
  indicatorRow: { height: 7, flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  indicator: { width: 4, height: 4, borderRadius: radius.pill, backgroundColor: colors.primary },
});
