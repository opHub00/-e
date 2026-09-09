import { useMemo, useState } from 'react';
import type { Listing } from '../discovery/types';
import { buildCalendarEvents, buildMonthGrid, filterCalendarEvents, groupCalendarEvents } from './calendarModel';
import { getKoreanToday, getMonthId, moveMonth } from './domain';

export function useCalendar(
  listings: readonly Listing[],
  savedListingIds: readonly string[],
  now = new Date(),
) {
  const today = getKoreanToday(now);
  const initialMonth = getMonthId(today) ?? today.slice(0, 7);
  const [monthId, setMonthId] = useState(initialMonth);
  const [selectedDate, setSelectedDate] = useState(today);
  const [filter, setFilter] = useState<'all' | 'saved'>('all');

  const allEvents = useMemo(() => buildCalendarEvents(listings), [listings]);
  const events = useMemo(
    () => filterCalendarEvents(allEvents, filter, savedListingIds),
    [allEvents, filter, savedListingIds],
  );
  const grouped = useMemo(() => groupCalendarEvents(events), [events]);
  const days = useMemo(
    () => buildMonthGrid(monthId, new Set(grouped.keys()), today),
    [grouped, monthId, today],
  );

  const selectDate = (date: string) => {
    setSelectedDate(date);
    const selectedMonth = getMonthId(date);
    if (selectedMonth) setMonthId(selectedMonth);
  };
  const changeMonth = (offset: number) => {
    const next = moveMonth(monthId, offset);
    if (!next) return;
    setMonthId(next);
    setSelectedDate(`${next}-01`);
  };
  const goToday = () => {
    setMonthId(initialMonth);
    setSelectedDate(today);
  };

  return {
    today,
    monthId,
    selectedDate,
    filter,
    setFilter,
    days,
    selectedEvents: grouped.get(selectedDate) ?? [],
    changeMonth,
    selectDate,
    goToday,
  };
}
