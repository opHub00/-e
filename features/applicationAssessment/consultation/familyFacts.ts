/**
 * Dates and child birth lists in Korean consultation text. Pure parsing: no clock, no
 * announcement date. A date is returned with the precision it was said in:
 *   2023년 5월 20일 / 2023.5.20 / 2023-05-20 → exact
 *   2023년 5월 / 2023.5 / 2023-05           → that month
 *   2023년                                   → that year
 */
export type SaidDate = { start: string; end: string; text: string; index: number };

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const DATE_TOKEN = /(?<!\d)((?:19|20)\d{2})(?:\s*(?:년|[.\-/])\s*(\d{1,2})(?:\s*(?:월|[.\-/])\s*(\d{1,2})\s*일?)?(?:\s*월)?)?(?:\s*년)?(?![\d.])/g;

export function saidDates(text: string): SaidDate[] {
  const out: SaidDate[] = [];
  for (const match of text.matchAll(DATE_TOKEN)) {
    const year = Number(match[1]), month = match[2] ? Number(match[2]) : null, day = match[3] ? Number(match[3]) : null;
    if (month !== null && (month < 1 || month > 12)) continue;
    if (day !== null && (day < 1 || day > lastDay(year, month!))) continue;
    // A bare four-digit number is a year only when written as one ("2021년") or as part of a date.
    if (month === null && !/년/.test(match[0])) continue;
    const start = `${year}-${pad(month ?? 1)}-${pad(day ?? 1)}`;
    const end = day !== null ? start : month !== null ? `${year}-${pad(month)}-${pad(lastDay(year, month))}` : `${year}-12-31`;
    out.push({ start, end, text: match[0].trim(), index: match.index! });
  }
  return out;
}

export const rangeText = (date: Pick<SaidDate, 'start' | 'end'>) => (date.start === date.end ? date.start : `${date.start}~${date.end}`);

const CHILD_WORD = /(?<![가-힣])(?:자녀|자식|아이(?!디)|애기|아기|애(?![매인정착])|첫째|둘째|셋째|막내|아들|딸)/;
const APPLICANT_WORD = /(?:^|\s)(?:저는|저|제가|본인은|본인|나는|내가)(?![가-힣])/;
const LIST_JOIN = /^\s*(?:,|，|와|과|하고|랑|이랑|그리고|및|·|\/)?\s*$/;
const BIRTH_AFTER = /^\s*(?:에\s*)?(?:(?:첫째|둘째|셋째|막내|아이|아기|애|아들|딸)(?:를|을|가|이|는)?\s*)?(?:생|출생|태어|낳)/;

/**
 * Birth-date lists in one sentence ("각각 2021년, 2024년생", "2024년 8월생"). A list is a child's
 * when the text before it names a child, or when the message already talks about children and
 * nothing marks the applicant as the subject. Anything else is left for the applicant birth-date rule.
 */
export function childBirthLists(sentence: string, childContext: boolean): SaidDate[][] {
  const dates = saidDates(sentence);
  const lists: SaidDate[][] = [];
  let group: SaidDate[] = [];
  let segmentStart = 0;
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i], next = dates[i + 1];
    group.push(date);
    const afterEnd = date.index + date.text.length;
    const between = next ? sentence.slice(afterEnd, next.index) : '';
    if (next && LIST_JOIN.test(between)) continue;
    if (BIRTH_AFTER.test(sentence.slice(afterEnd))) {
      const before = sentence.slice(segmentStart, group[0].index);
      const child = CHILD_WORD.test(before) || (childContext && !APPLICANT_WORD.test(before));
      if (child) lists.push(group);
    }
    segmentStart = afterEnd;
    group = [];
  }
  return lists;
}

export const mentionsChild = (text: string) => CHILD_WORD.test(text);
