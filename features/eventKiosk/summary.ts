import { BUCKET_LABELS, missingCaution, type KioskBucket, type KioskEvaluation, type KioskOutcome } from './evaluate.ts';
import { HOUSEHOLD_TYPES, type HouseholdType } from './model.ts';

/**
 * 휴대폰으로 가져가는 결과 요약.
 *
 * 서버에 저장하지 않는다. 요약 전체를 링크의 # 뒤에 넣고, QR 은 그 링크를 담는다.
 * # 뒤는 브라우저가 서버로 보내지 않으므로 요약이 서버 로그에 남지 않는다.
 *
 * 그래서 요약에는 개인을 알아볼 수 있는 값을 넣지 않는다. 이름, 생년월일, 소득, 자산, 통장 정보는 빠진다.
 * 남는 것은 가구 형태 이름과 공고별 결과뿐이다.
 */
export type SummaryItem = {
  title: string;
  supply: string;
  bucket: KioskBucket;
  stage: string | null;
  note: string | null;
};

export type ResultSummary = {
  v: 1;
  event: string;
  date: string;
  household: string | null;
  counts: Record<KioskBucket, number>;
  recommended: SummaryItem[];
  favorites: SummaryItem[];
  cautions: string[];
};

const RECOMMENDED_LIMIT = 3;
const CAUTION_LIMIT = 4;

const itemOf = (outcome: KioskOutcome): SummaryItem => ({
  title: outcome.listing.title,
  supply: outcome.supplyLabel,
  bucket: outcome.bucket,
  stage: outcome.stageLabel,
  note: outcome.cautions[0] ?? null,
});

/** 화면 요약과 QR 요약이 같은 값을 쓰도록 한 곳에서 만든다. */
export function buildSummary(input: {
  eventId: string;
  householdType: HouseholdType | null;
  evaluation: KioskEvaluation;
  favoriteIds: string[];
}): ResultSummary {
  const { evaluation } = input;
  const recommended = evaluation.outcomes.filter(outcome => outcome.bucket === 'eligible').slice(0, RECOMMENDED_LIMIT);
  const favorites = input.favoriteIds
    .map(id => evaluation.outcomes.find(outcome => outcome.id === id))
    .filter((outcome): outcome is KioskOutcome => Boolean(outcome));
  const focus = favorites.length ? favorites : recommended;
  const cautions = [...new Set(focus.flatMap(outcome => [...outcome.failed, ...outcome.missing.map(missingCaution)]))].slice(0, CAUTION_LIMIT);
  return {
    v: 1,
    event: input.eventId,
    date: evaluation.evaluatedAt.slice(0, 10),
    household: HOUSEHOLD_TYPES.find(type => type.key === input.householdType)?.label ?? null,
    counts: { ...evaluation.counts },
    recommended: recommended.map(itemOf),
    favorites: favorites.map(itemOf),
    cautions,
  };
}

// --- base64url(UTF-8) 직렬화. 플랫폼 btoa 의 유무와 상관없이 같은 결과를 낸다. ---

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8Encode(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  return bytes;
}

function utf8Decode(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    let code: number;
    if (b < 0x80) { code = b; i += 1; }
    else if (b < 0xe0) { code = ((b & 31) << 6) | (bytes[i + 1] & 63); i += 2; }
    else if (b < 0xf0) { code = ((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63); i += 3; }
    else { code = ((b & 7) << 18) | ((bytes[i + 1] & 63) << 12) | ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63); i += 4; }
    out += String.fromCodePoint(code);
  }
  return out;
}

export function toBase64Url(text: string): string {
  const bytes = utf8Encode(text);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += ALPHABET[n & 63];
  }
  return out;
}

export function fromBase64Url(encoded: string): string {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of encoded) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) throw new Error('SUMMARY_INVALID');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  return utf8Decode(bytes);
}

/** 짧은 키로 줄여서 QR 이 촘촘해지지 않게 한다. */
type Packed = [1, string, string, string | null, [number, number, number], PackedItem[], PackedItem[], string[]];
type PackedItem = [string, string, 0 | 1 | 2, string | null, string | null];
const BUCKET_CODES: KioskBucket[] = ['eligible', 'review', 'difficult'];
const packItem = (item: SummaryItem): PackedItem =>
  [item.title, item.supply, BUCKET_CODES.indexOf(item.bucket) as 0 | 1 | 2, item.stage, item.note];
const unpackItem = (item: PackedItem): SummaryItem => {
  if (!Array.isArray(item) || typeof item[0] !== 'string' || typeof item[1] !== 'string' || !BUCKET_CODES[item[2]]) {
    throw new Error('SUMMARY_INVALID');
  }
  return { title: item[0], supply: item[1], bucket: BUCKET_CODES[item[2]], stage: item[3] ?? null, note: item[4] ?? null };
};

export function encodeSummary(summary: ResultSummary): string {
  const packed: Packed = [
    1, summary.event, summary.date, summary.household,
    [summary.counts.eligible, summary.counts.review, summary.counts.difficult],
    summary.recommended.map(packItem), summary.favorites.map(packItem), summary.cautions,
  ];
  return toBase64Url(JSON.stringify(packed));
}

/** 깨진 링크는 예외 대신 null. 받는 화면이 '요약을 읽을 수 없어요'를 보여 준다. */
export function decodeSummary(encoded: string): ResultSummary | null {
  try {
    const packed = JSON.parse(fromBase64Url(encoded)) as Packed;
    if (!Array.isArray(packed) || packed[0] !== 1) return null;
    const [, event, date, household, counts, recommended, favorites, cautions] = packed;
    if (typeof event !== 'string' || typeof date !== 'string' || !Array.isArray(counts) || counts.length !== 3) return null;
    return {
      v: 1,
      event,
      date,
      household: typeof household === 'string' ? household : null,
      counts: { eligible: Number(counts[0]) || 0, review: Number(counts[1]) || 0, difficult: Number(counts[2]) || 0 },
      recommended: (recommended ?? []).map(unpackItem),
      favorites: (favorites ?? []).map(unpackItem),
      cautions: (cautions ?? []).filter((item): item is string => typeof item === 'string'),
    };
  } catch {
    return null;
  }
}

export const bucketLabel = (bucket: KioskBucket): string => BUCKET_LABELS[bucket];
