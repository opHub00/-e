/** UTC calendar dates only. All callers supply the announcement date. */
const valid = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
export function anniversary(date: string, years: number): string {
  const [y,m,d] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y + years,m,0)).getUTCDate();
  return `${y+years}-${String(m).padStart(2,'0')}-${String(Math.min(d,lastDay)).padStart(2,'0')}`;
}
export function withinYears(start: string | undefined, end: string | null, years: number): boolean | undefined {
  return valid(start) && valid(end ?? undefined) && start <= end! ? end! <= anniversary(start,years) : undefined;
}
export function noHomeDuration(input: { birthDate?: string; firstMarriageDate?: string; everMarried?: boolean; disposalDates?: string[] }, asOf: string | null): { months: number; applicable: boolean } | undefined {
  const { birthDate, firstMarriageDate, everMarried, disposalDates } = input;
  if (!valid(birthDate) || !valid(asOf ?? undefined) || birthDate > asOf! || everMarried === undefined || !disposalDates || disposalDates.some(d => !valid(d) || d > asOf! || d < birthDate)) return undefined;
  if (everMarried && (!valid(firstMarriageDate) || firstMarriageDate < birthDate || firstMarriageDate > asOf!)) return undefined;
  if (!everMarried && firstMarriageDate) return undefined;
  const thirty = anniversary(birthDate,30);
  let start = everMarried && firstMarriageDate! < thirty ? firstMarriageDate! : thirty;
  if (start > asOf!) return { months:0, applicable:false };
  for (const disposed of disposalDates) if (disposed > start) start = disposed;
  const [sy,sm,sd] = start.split('-').map(Number), [ey,em,ed] = asOf!.split('-').map(Number);
  return { months:(ey-sy)*12+em-sm-(ed < sd ? 1 : 0), applicable:true };
}
