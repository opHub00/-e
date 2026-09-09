export type DateOnlyParts = {
  year: number;
  month: number;
  day: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const KOREA_OFFSET_MS = 9 * 60 * 60 * 1000;

/** YYYY-MM-DD를 local/UTC Date constructor에 넣지 않고 달력 성분으로 검증한다. */
export function parseDateOnly(value: string): DateOnlyParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return { year, month, day };
}

export function formatDateOnly(parts: DateOnlyParts): string {
  return `${parts.year.toString().padStart(4, '0')}-${parts.month.toString().padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}`;
}

export function toDateOnlyOrdinal(value: string): number | null {
  const parts = parseDateOnly(value);
  return parts ? Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS) : null;
}

export function getKoreanToday(now = new Date()): string {
  return new Date(now.getTime() + KOREA_OFFSET_MS).toISOString().slice(0, 10);
}

export function getDdayLabel(date: string, today: string): string | null {
  const targetOrdinal = toDateOnlyOrdinal(date);
  const todayOrdinal = toDateOnlyOrdinal(today);
  if (targetOrdinal === null || todayOrdinal === null) return null;
  const difference = targetOrdinal - todayOrdinal;
  if (difference === 0) return '오늘';
  return difference > 0 ? `D-${difference}` : `D+${Math.abs(difference)}`;
}

export function getMonthId(date: string): string | null {
  const parts = parseDateOnly(date);
  return parts ? `${parts.year.toString().padStart(4, '0')}-${parts.month.toString().padStart(2, '0')}` : null;
}

export function moveMonth(monthId: string, offset: number): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthId);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || !Number.isInteger(offset)) return null;
  const moved = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${moved.getUTCFullYear().toString().padStart(4, '0')}-${(moved.getUTCMonth() + 1).toString().padStart(2, '0')}`;
}

export function getMonthLabel(monthId: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthId);
  if (!match) return monthId;
  return `${Number(match[1])}년 ${Number(match[2])}월`;
}
