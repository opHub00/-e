/** Listing presentation media. Assessment/domain rules never depend on this contract. */
export type ListingMediaKind = 'photo' | 'render' | 'map';

export type ListingMediaImage = {
  uri: string;
  alt: string;
  sourceLabel: string;
  sourceUrl: string;
  attribution: string | null;
  license: string | null;
  kind: ListingMediaKind;
  primary: boolean;
};

export type ListingMedia = {
  primary: ListingMediaImage | null;
  gallery: ListingMediaImage[];
  placeholder: { kind: 'HOUSING'; label: string };
};

const MAX_MEDIA = 8;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

const safeUri = (value: string | null): string | null => {
  if (!value) return null;
  if (/^https:\/\//.test(value) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(value) || /^data:image\//.test(value)) return value;
  return null;
};

export function emptyListingMedia(label: string): ListingMedia {
  return { primary: null, gallery: [], placeholder: { kind: 'HOUSING', label } };
}

function imageOf(raw: unknown, fallbackAlt: string): ListingMediaImage | null {
  if (!isRecord(raw)) return null;
  const uri = safeUri(text(raw.uri) ?? text(raw.url) ?? text(raw.imageUrl));
  if (!uri) return null;
  const sourceUrl = safeUri(text(raw.sourceUrl));
  const sourceLabel = text(raw.sourceLabel) ?? text(raw.sourceName) ?? text(raw.credit);
  const embedded = uri.startsWith('data:image/');
  if ((!sourceUrl || !sourceLabel) && !embedded) return null;
  return {
    uri,
    alt: text(raw.alt) ?? fallbackAlt,
    sourceLabel: sourceLabel ?? '앱 내 예시 이미지',
    sourceUrl: sourceUrl ?? uri,
    attribution: text(raw.attribution) ?? text(raw.credit),
    license: text(raw.license),
    kind: raw.kind === 'render' || raw.kind === 'map' ? raw.kind : 'photo',
    primary: raw.primary === true,
  };
}

/** Accepts the canonical wrapper and legacy arrays at ingestion boundaries, then returns one canonical shape. */
export function normalizeListingMedia(raw: unknown, fallbackAlt: string): ListingMedia {
  const source = isRecord(raw) && Array.isArray(raw.gallery) ? raw.gallery : Array.isArray(raw) ? raw : [];
  const unique = new Map<string, ListingMediaImage>();
  for (const item of source) {
    const image = imageOf(item, fallbackAlt);
    if (image && !unique.has(image.uri)) unique.set(image.uri, image);
    if (unique.size >= MAX_MEDIA) break;
  }
  const images = [...unique.values()];
  const requestedPrimary = isRecord(raw) && isRecord(raw.primary) ? imageOf(raw.primary, fallbackAlt) : null;
  const primary = requestedPrimary ?? images.find(image => image.primary) ?? images[0] ?? null;
  const gallery = primary ? [primary, ...images.filter(image => image.uri !== primary.uri)] : [];
  return { primary, gallery, placeholder: { kind: 'HOUSING', label: fallbackAlt } };
}

export function listingMedia(images: readonly unknown[] | undefined, label: string): ListingMedia {
  return normalizeListingMedia(images ?? [], label);
}

export function listingMediaOf(listing: { title: string; media?: unknown; images?: unknown }): ListingMedia {
  return normalizeListingMedia(listing.media ?? listing.images ?? null, `${listing.title} 대표 이미지`);
}

export function withoutListingMediaImage(media: ListingMedia, uri: string): ListingMedia {
  return normalizeListingMedia(media.gallery.filter(image => image.uri !== uri), media.placeholder.label);
}

export function imageFailureFallback(media: ListingMedia): ListingMedia {
  return emptyListingMedia(media.placeholder.label);
}

export const MEDIA_KIND_LABELS: Record<ListingMediaKind, string> = {
  photo: '사진',
  render: '조감도',
  map: '위치',
};
