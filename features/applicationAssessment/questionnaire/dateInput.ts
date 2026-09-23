/**
 * 날짜 입력 정규화. 저장 형식은 바꾸지 않는다: 언제나 canonical `YYYY-MM-DD`로 맞춰서
 * 기존 parseForm / 엔진 계약을 그대로 쓴다. 사용자는 `19940705`처럼 숫자만 쳐도 되고,
 * 하이픈·점·슬래시를 섞어 써도 된다.
 */
export type DateInputResult =
  | { status: 'EMPTY' }
  | { status: 'OK'; value: string }
  | { status: 'INVALID'; message: string };

const pad = (value: number) => String(value).padStart(2, '0');
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * 입력 중 화면에 보여주는 형태. 숫자만 치면 자동으로 하이픈을 끼워 준다.
 * 사용자가 `.`이나 `/`를 직접 쳤다면 그 표기를 지우지 않는다(1994.7.5 를 1994-75 로 바꾸지 않는다).
 */
export function formatDateInput(raw: string): string {
  const typed = raw.replace(/[^0-9 .\-/]/g, '');
  if (/[ .\-/]/.test(typed)) return typed.slice(0, 10);
  const digits = typed.slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export type DateBounds = { notBefore?: string; notAfter?: string; notAfterLabel?: string };

/**
 * `19940705` / `1994-07-05` / `1994.7.5` / `1994 07 05` 모두 같은 값으로 읽는다.
 * 실제로 없는 날짜(2월 30일 등)와 범위를 벗어난 날짜는 이 단계에서 막는다.
 */
export function normalizeDateInput(raw: string | undefined, bounds: DateBounds = {}): DateInputResult {
  const text = (raw ?? '').trim();
  if (!text) return { status: 'EMPTY' };
  const digits = text.replace(/[^0-9]/g, '');
  const parts = text.split(/[ .\-/]+/).filter(Boolean);
  // 구분자를 쓰면 연·월·일 세 조각, 숫자만 쓰면 정확히 8자리여야 한다.
  const shaped = /^[0-9]{4}[ .\-/][0-9]{1,2}[ .\-/][0-9]{1,2}$/.test(text)
    ? parts.length === 3
    : /^[0-9]{8}$/.test(text);
  if (!shaped) return { status: 'INVALID', message: '날짜 8자리를 입력해 주세요. 예: 19940705 또는 1994-07-05' };
  const [year, month, day] = parts.length === 3
    ? parts.map(Number)
    : [Number(digits.slice(0, 4)), Number(digits.slice(4, 6)), Number(digits.slice(6, 8))];
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return { status: 'INVALID', message: '날짜를 숫자로 입력해 주세요. 예: 19940705' };
  }
  if (year < 1900 || year > 2100) return { status: 'INVALID', message: '연도를 확인해 주세요. 1900년부터 2100년까지 쓸 수 있어요.' };
  if (month < 1 || month > 12) return { status: 'INVALID', message: `${month}월은 없어요. 월은 1~12로 입력해 주세요.` };
  if (day < 1 || day > lastDay(year, month)) {
    return { status: 'INVALID', message: `${year}년 ${month}월은 ${lastDay(year, month)}일까지예요.` };
  }
  const value = `${year}-${pad(month)}-${pad(day)}`;
  if (bounds.notBefore && value < bounds.notBefore) return { status: 'INVALID', message: `${bounds.notBefore} 이후 날짜를 입력해 주세요.` };
  if (bounds.notAfter && value > bounds.notAfter) {
    return { status: 'INVALID', message: `${bounds.notAfterLabel ?? bounds.notAfter} 이전 날짜를 입력해 주세요.` };
  }
  return { status: 'OK', value };
}

/** 화면에 되읽어 주는 표기. 1994-07-05 → 1994.07.05 */
export const displayDate = (value: string | undefined) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replaceAll('-', '.') : '');

/** 생년월일에서 공고일(또는 오늘) 기준 만 나이. 입력이 없으면 undefined. */
export function ageOnDate(birthDate: string | undefined, asOf: string | undefined): number | undefined {
  if (!birthDate || !asOf || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return undefined;
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ay, am, ad] = asOf.split('-').map(Number);
  const age = ay - by - (am < bm || (am === bm && ad < bd) ? 1 : 0);
  return age >= 0 && age < 150 ? age : undefined;
}
