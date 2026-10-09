/**
 * '이 주택의 특징' — 검증된 selling point 만.
 *
 * 근거(공고문 조항, 공식 자료, 위치 데이터)가 붙은 항목만 화면에 나온다. 근거 없는 항목은 버린다.
 * 화면이 문구를 지어내지 않는다. 받은 문장을 그대로 보여 주고, 출처를 함께 단다.
 *
 * 받을 수 있는 입력(listing.features 또는 listing.sellingPoints):
 *   [{ text|label, kind?: 'SUPPLY'|'LOCATION'|'COST'|'FACILITY'|'SCHEDULE', evidence: { label, url?, page? } | sourceLabel/sourceUrl }]
 */
export type FeatureKind = 'SUPPLY' | 'LOCATION' | 'COST' | 'FACILITY' | 'SCHEDULE' | 'OTHER';

export type VerifiedFeature = {
  text: string;
  kind: FeatureKind;
  evidence: { label: string; url: string | null; page: number | null };
};

export const FEATURE_KIND_ICONS: Record<FeatureKind, string> = {
  SUPPLY: 'home-work',
  LOCATION: 'place',
  COST: 'savings',
  FACILITY: 'apartment',
  SCHEDULE: 'event',
  OTHER: 'check-circle',
};

const MAX_FEATURES = 6;
const MAX_TEXT = 80;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const https = (value: unknown): string | null => {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};
const KINDS = new Set<FeatureKind>(['SUPPLY', 'LOCATION', 'COST', 'FACILITY', 'SCHEDULE', 'OTHER']);

export function normalizeListingFeatures(raw: unknown): VerifiedFeature[] {
  if (!Array.isArray(raw)) return [];
  const out: VerifiedFeature[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const body = text(item.text) ?? text(item.label);
    if (!body || body.length > MAX_TEXT || seen.has(body)) continue;
    const evidence = isRecord(item.evidence) ? item.evidence : null;
    const label = text(evidence?.label) ?? text(item.sourceLabel);
    // 근거가 없으면 특징으로 보여 주지 않는다.
    if (!label) continue;
    const page = typeof evidence?.page === 'number' && Number.isInteger(evidence.page) && evidence.page > 0 ? evidence.page : null;
    const kind = typeof item.kind === 'string' && KINDS.has(item.kind as FeatureKind) ? (item.kind as FeatureKind) : 'OTHER';
    seen.add(body);
    out.push({ text: body, kind, evidence: { label, url: https(evidence?.url) ?? https(item.sourceUrl), page } });
    if (out.length >= MAX_FEATURES) break;
  }
  return out;
}

export function featuresOf(listing: Record<string, unknown>): VerifiedFeature[] {
  return normalizeListingFeatures(listing.features ?? listing.sellingPoints ?? null);
}
