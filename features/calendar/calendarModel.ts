import type { Listing, ListingPriorityApplication, ListingScheduleDateRange } from '../discovery/types.ts';
import { formatDateOnly, parseDateOnly } from './domain.ts';

export type CalendarEventType =
  | 'announcement'
  | 'special-supply'
  | 'first-priority'
  | 'second-priority'
  | 'application'
  | 'winner'
  | 'contract';

export type CalendarEvent = {
  id: string;
  listingId: string;
  listingName: string;
  date: string;
  type: CalendarEventType;
  label: string;
};

export type CalendarDay = {
  date: string;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  hasEvents: boolean;
};

const SCOPE_LABEL: Record<ListingPriorityApplication['scope'], string> = {
  'same-area': '해당지역',
  'other-gyeonggi': '기타 경기',
  'other-area': '기타지역',
};

export function buildCalendarEvents(listings: readonly Listing[]): CalendarEvent[] {
  const events = listings.flatMap((listing) => {
    const result: CalendarEvent[] = [];
    addSingle(result, listing, listing.announcementDate, 'announcement', '모집공고');

    const official = listing.officialSchedule;
    if (official) {
      addRange(result, listing, official.specialSupply, 'special-supply', '특별공급 접수');
      official.priorityApplications.forEach((schedule) => {
        const type = schedule.rank === 1 ? 'first-priority' : 'second-priority';
        addRange(result, listing, schedule, type, `${schedule.rank}순위 접수 · ${SCOPE_LABEL[schedule.scope]}`);
      });
    } else {
      addRange(
        result,
        listing,
        { startDate: listing.recruitmentStartDate, endDate: listing.recruitmentEndDate },
        'application',
        '청약 접수',
      );
    }

    addSingle(result, listing, listing.winnerAnnouncementDate, 'winner', '당첨자 발표');
    addRange(
      result,
      listing,
      { startDate: listing.contractStartDate, endDate: listing.contractEndDate },
      'contract',
      '계약',
    );
    return result;
  });

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.listingName.localeCompare(b.listingName) || a.label.localeCompare(b.label));
}

export function groupCalendarEvents(events: readonly CalendarEvent[]): Map<string, CalendarEvent[]> {
  const grouped = new Map<string, CalendarEvent[]>();
  events.forEach((event) => {
    const current = grouped.get(event.date) ?? [];
    grouped.set(event.date, [...current, event]);
  });
  return grouped;
}

export function filterCalendarEvents(
  events: readonly CalendarEvent[],
  mode: 'all' | 'saved',
  savedListingIds: readonly string[],
): CalendarEvent[] {
  if (mode === 'all') return [...events];
  const saved = new Set(savedListingIds);
  return events.filter((event) => saved.has(event.listingId));
}

export function buildMonthGrid(
  monthId: string,
  eventDates: ReadonlySet<string>,
  today: string,
): CalendarDay[] {
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(monthId);
  if (!monthMatch) return [];
  const year = Number(monthMatch[1]);
  const month = Number(monthMatch[2]);
  if (month < 1 || month > 12) return [];

  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const start = new Date(Date.UTC(year, month - 1, 1 - firstWeekday));
  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
    const date = formatDateOnly({
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    });
    return {
      date,
      day: value.getUTCDate(),
      inCurrentMonth: value.getUTCFullYear() === year && value.getUTCMonth() + 1 === month,
      isToday: date === today,
      hasEvents: eventDates.has(date),
    };
  });
}

function addSingle(
  target: CalendarEvent[],
  listing: Listing,
  date: string | null,
  type: CalendarEventType,
  label: string,
) {
  if (!date || !parseDateOnly(date)) return;
  target.push(createEvent(listing, date, type, label));
}

function addRange(
  target: CalendarEvent[],
  listing: Listing,
  range: ListingScheduleDateRange | undefined,
  type: CalendarEventType,
  label: string,
) {
  if (!range) return;
  const startValid = Boolean(range.startDate && parseDateOnly(range.startDate));
  const endValid = Boolean(range.endDate && parseDateOnly(range.endDate));
  if (startValid && range.startDate === range.endDate) {
    target.push(createEvent(listing, range.startDate!, type, label));
    return;
  }
  if (startValid) target.push(createEvent(listing, range.startDate!, type, `${label} 시작`));
  if (endValid) target.push(createEvent(listing, range.endDate!, type, `${label} 마감`));
}

function createEvent(
  listing: Listing,
  date: string,
  type: CalendarEventType,
  label: string,
): CalendarEvent {
  return {
    id: `${listing.id}:${type}:${date}:${label}`,
    listingId: listing.id,
    listingName: listing.complexName,
    date,
    type,
    label,
  };
}
