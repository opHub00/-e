/**
 * 공고 대표 이미지·갤러리 자료.
 *
 * 지금 행사 dataset 에는 이미지가 없다. Codex 가 listing 에 media 를 붙이면 화면이 바로 쓰도록,
 * 정해진 모양만 읽고 나머지는 버린다. 모양이 틀린 항목은 조용히 빼서 화면이 깨지지 않게 한다.
 *
 * 받을 수 있는 모양(listing.media 또는 listing.images):
 *   [{ uri | url: string, alt?: string, credit?: string, sourceLabel?: string, sourceUrl?: string, kind?: 'photo' | 'render' | 'map' }]
 */
export type ListingMediaKind = 'photo' | 'render' | 'map';

export type ListingMedia = {
  uri: string;
  alt: string;
  /** 사진 출처. 화면 구석에 작게 적는다. 없으면 표시하지 않는다. */
  credit: string | null;
  sourceUrl: string | null;
  kind: ListingMediaKind;
};

const MAX_MEDIA = 8;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
/** 안전한 주소만 쓴다. http(s) 와 앱에 넣은 이미지(data:image)만 허용. */
const safeUri = (value: string | null): string | null =>
  value && (/^https:\/\//.test(value) || /^http:\/\/(localhost|127\.0\.0\.1)/.test(value) || /^data:image\//.test(value)) ? value : null;

export function normalizeListingMedia(raw: unknown, fallbackAlt: string): ListingMedia[] {
  if (!Array.isArray(raw)) return [];
  const out: ListingMedia[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const uri = safeUri(text(item.uri) ?? text(item.url));
    if (!uri) continue;
    const kind = item.kind === 'render' || item.kind === 'map' ? item.kind : 'photo';
    out.push({
      uri,
      alt: text(item.alt) ?? fallbackAlt,
      credit: text(item.credit) ?? text(item.sourceLabel),
      sourceUrl: safeUri(text(item.sourceUrl)),
      kind,
    });
    if (out.length >= MAX_MEDIA) break;
  }
  return out;
}

/** 공고에서 이미지를 꺼낸다. 필드가 아직 없으면 빈 배열 → 화면은 placeholder 를 그린다. */
export function listingMediaOf(listing: { title: string } & Record<string, unknown>): ListingMedia[] {
  return normalizeListingMedia(listing.media ?? listing.images ?? null, `${listing.title} 대표 이미지`);
}

export const MEDIA_KIND_LABELS: Record<ListingMediaKind, string> = {
  photo: '사진',
  render: '조감도',
  map: '위치',
};
