/**
 * 공고 위치·주변 시설(POI) 표시 모델.
 *
 * Codex 의 location/POI 데이터 계약이 확정되기 전에 화면이 먼저 준비되도록, 받을 수 있는 모양을 넓게 읽고
 * 화면이 쓰는 한 가지 모양으로 정리한다. 모양이 틀린 값은 버린다(화면이 깨지지 않게).
 * 판정·Rule Package 와는 무관하다. 지도 provider SDK 는 계약 확정 후 붙인다.
 *
 * 받을 수 있는 입력(listing.location / listing.nearbyPlaces 또는 listing.poi):
 *   location: { lat|latitude, lng|lon|longitude, address?, district?, precision?: 'EXACT'|'APPROXIMATE'|'DISTRICT', source?: {label,url} }
 *   nearbyPlaces: [{ id?, name, category, distanceMeters|distance_m, walkMinutes?, lat?, lng?, source?: {label,url} | sourceLabel/sourceUrl }]
 */
export type LocationPrecision = 'EXACT' | 'APPROXIMATE' | 'DISTRICT';

export type ListingLocation = {
  lat: number | null;
  lng: number | null;
  address: string | null;
  district: string | null;
  precision: LocationPrecision;
  source: { label: string; url: string | null } | null;
};

export type PoiCategory = 'TRANSIT' | 'SCHOOL' | 'CHILDCARE' | 'HOSPITAL' | 'MART' | 'PARK' | 'PUBLIC' | 'OTHER';

export type NearbyPlace = {
  id: string;
  name: string;
  category: PoiCategory;
  distanceMeters: number;
  walkMinutes: number | null;
  lat: number | null;
  lng: number | null;
  source: { label: string; url: string | null } | null;
};

export const POI_CATEGORY_LABELS: Record<PoiCategory, string> = {
  TRANSIT: '교통',
  SCHOOL: '학교',
  CHILDCARE: '어린이집·유치원',
  HOSPITAL: '병원',
  MART: '마트·생활',
  PARK: '공원',
  PUBLIC: '공공시설',
  OTHER: '주변 시설',
};

export const POI_CATEGORY_ICONS: Record<PoiCategory, string> = {
  TRANSIT: 'directions-bus',
  SCHOOL: 'school',
  CHILDCARE: 'child-care',
  HOSPITAL: 'local-hospital',
  MART: 'local-grocery-store',
  PARK: 'park',
  PUBLIC: 'account-balance',
  OTHER: 'place',
};

const CATEGORY_ALIASES: Record<string, PoiCategory> = {
  transit: 'TRANSIT', bus: 'TRANSIT', subway: 'TRANSIT', station: 'TRANSIT', 교통: 'TRANSIT', 버스: 'TRANSIT',
  school: 'SCHOOL', elementary: 'SCHOOL', 학교: 'SCHOOL', 초등학교: 'SCHOOL', 중학교: 'SCHOOL', 고등학교: 'SCHOOL',
  childcare: 'CHILDCARE', kindergarten: 'CHILDCARE', daycare: 'CHILDCARE', 어린이집: 'CHILDCARE', 유치원: 'CHILDCARE',
  hospital: 'HOSPITAL', clinic: 'HOSPITAL', 병원: 'HOSPITAL', 의원: 'HOSPITAL',
  mart: 'MART', grocery: 'MART', convenience: 'MART', 마트: 'MART', 편의점: 'MART',
  park: 'PARK', 공원: 'PARK',
  public: 'PUBLIC', government: 'PUBLIC', 주민센터: 'PUBLIC', 행정복지센터: 'PUBLIC', 도서관: 'PUBLIC',
};

const MAX_PLACES = 12;
/** 걷는 속도(분당 미터). 도보 분을 받지 못했을 때만 추정한다. */
const WALK_METERS_PER_MINUTE = 67;
/** 이 거리를 넘으면 '도보'로 표시하지 않는다. */
const WALKABLE_METERS = 1500;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const num = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};
const https = (value: unknown): string | null => {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
};
const lat = (value: unknown) => { const n = num(value); return n !== null && n >= -90 && n <= 90 ? n : null; };
const lng = (value: unknown) => { const n = num(value); return n !== null && n >= -180 && n <= 180 ? n : null; };

function sourceOf(raw: Record<string, unknown>): ListingLocation['source'] {
  const nested = isRecord(raw.source) ? raw.source : null;
  const label = text(nested?.label) ?? text(raw.sourceLabel);
  if (!label) return null;
  return { label, url: https(nested?.url) ?? https(raw.sourceUrl) };
}

export function normalizeListingLocation(raw: unknown): ListingLocation | null {
  if (!isRecord(raw)) return null;
  const latitude = lat(raw.lat ?? raw.latitude);
  const longitude = lng(raw.lng ?? raw.lon ?? raw.longitude);
  const address = text(raw.address);
  const district = text(raw.district);
  const hasPoint = latitude !== null && longitude !== null;
  if (!hasPoint && !address && !district) return null;
  const precision: LocationPrecision = raw.precision === 'APPROXIMATE' || raw.precision === 'DISTRICT' ? raw.precision
    : hasPoint ? 'EXACT' : 'DISTRICT';
  return { lat: hasPoint ? latitude : null, lng: hasPoint ? longitude : null, address, district, precision, source: sourceOf(raw) };
}

function categoryOf(value: unknown): PoiCategory {
  const raw = text(value);
  if (!raw) return 'OTHER';
  const upper = raw.toUpperCase();
  if ((Object.keys(POI_CATEGORY_LABELS) as PoiCategory[]).includes(upper as PoiCategory)) return upper as PoiCategory;
  return CATEGORY_ALIASES[raw.toLowerCase()] ?? CATEGORY_ALIASES[raw] ?? 'OTHER';
}

export function normalizeNearbyPlaces(raw: unknown): NearbyPlace[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const places: NearbyPlace[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const name = text(item.name);
    const distance = num(item.distanceMeters ?? item.distance_m ?? item.distance);
    if (!name || distance === null || distance < 0) continue;
    const id = text(item.id) ?? `${name}-${Math.round(distance)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const walk = num(item.walkMinutes ?? item.walk_minutes);
    places.push({
      id,
      name,
      category: categoryOf(item.category ?? item.type),
      distanceMeters: Math.round(distance),
      walkMinutes: walk !== null && walk >= 0 ? Math.round(walk) : null,
      lat: lat(item.lat ?? item.latitude),
      lng: lng(item.lng ?? item.lon ?? item.longitude),
      source: sourceOf(item),
    });
  }
  return places.sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, MAX_PLACES);
}

/** 화면 문구: 도보 분이 있으면 그것을, 없으면 가까운 거리만 추정한다. 멀면 거리만. */
export function formatDistance(place: Pick<NearbyPlace, 'distanceMeters' | 'walkMinutes'>): { primary: string; secondary: string | null } {
  const meters = place.distanceMeters;
  const distance = meters >= 1000 ? `${(meters / 1000).toFixed(meters >= 10_000 ? 0 : 1)}km` : `${meters}m`;
  const walk = place.walkMinutes ?? (meters <= WALKABLE_METERS ? Math.max(1, Math.round(meters / WALK_METERS_PER_MINUTE)) : null);
  if (walk !== null && meters <= WALKABLE_METERS) return { primary: `도보 ${walk}분`, secondary: distance };
  return { primary: distance, secondary: null };
}

/** 카드에 한 줄로 보여 줄 주변 강조. 가장 가까운 서로 다른 종류 두 개. */
export function nearbyHighlights(places: readonly NearbyPlace[], limit = 2): NearbyPlace[] {
  const picked: NearbyPlace[] = [];
  const categories = new Set<PoiCategory>();
  for (const place of places) {
    if (categories.has(place.category)) continue;
    categories.add(place.category);
    picked.push(place);
    if (picked.length >= limit) break;
  }
  return picked;
}

/** 지도 앱으로 여는 링크. 좌표가 없으면 주소 검색으로. provider SDK 없이도 '지도에서 보기'가 된다. */
export function externalMapUrl(location: ListingLocation, title: string): string | null {
  if (location.lat !== null && location.lng !== null) {
    return `https://map.kakao.com/link/map/${encodeURIComponent(title)},${location.lat},${location.lng}`;
  }
  const query = location.address ?? location.district;
  return query ? `https://map.kakao.com/link/search/${encodeURIComponent(query)}` : null;
}

/** 공고 객체(EventListing·ServiceListing 등)에서 위치·주변 시설을 꺼낸다. 필드가 아직 없으면 null/빈 배열. */
export function locationOf(listing: Record<string, unknown>): { location: ListingLocation | null; nearby: NearbyPlace[] } {
  return {
    location: normalizeListingLocation(listing.location ?? null),
    nearby: normalizeNearbyPlaces(listing.nearbyPlaces ?? listing.poi ?? null),
  };
}
