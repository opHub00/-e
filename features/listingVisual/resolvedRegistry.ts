import type { DiscoveryListing } from '../discovery/types.ts';
import { pickGallery, pickPrimary, type ListingSubjectType, type ListingVisualRecord } from './resolver.ts';
import type { ListingGalleryImage } from './types.ts';
import resolved from '../../data/listing-visuals/resolved.json' with { type: 'json' };

/**
 * 자동으로 찾은 이미지 중 **검증을 통과한 것만** 꺼내 준다.
 *
 * 기록에는 막힌 후보도 함께 들어 있다. 여기서는 통과분만 보고, 대표가 없으면 아무것도 돌려주지 않는다.
 * 그러면 화면은 기존 fallback 을 그대로 쓴다.
 */
const BY_LISTING = new Map<string, ListingVisualRecord[]>();
for (const record of (resolved as { visuals: ListingVisualRecord[] }).visuals) {
  if (!BY_LISTING.has(record.listingId)) BY_LISTING.set(record.listingId, []);
  BY_LISTING.get(record.listingId)!.push(record);
}

/** 사람이 읽을 이름. 화면에서 갤러리 한 장이 무엇인지 알려 준다. */
const SUBJECT_LABEL: Record<ListingSubjectType, string> = {
  apartment_exterior: '단지 외관',
  complex_overview: '단지 전경',
  building_render: '조감·투시도',
  landscape: '조경',
  community: '커뮤니티',
  floor_plan: '평면도',
  map: '위치도',
  brand: '브랜드 이미지',
  unknown: '단지 이미지',
};

export type ResolvedListingImage = {
  url: string;
  source: { name: string; pageUrl: string };
  attribution: string;
  confidence: number;
  gallery: ListingGalleryImage[];
};

export function resolvedListingImage(listing: Pick<DiscoveryListing, 'id'>): ResolvedListingImage | undefined {
  const records = BY_LISTING.get(listing.id) ?? [];
  const primary = pickPrimary(records);
  if (!primary) return undefined;
  return {
    url: primary.imageUrl,
    source: { name: primary.announcementTitle, pageUrl: primary.sourceUrl },
    attribution: `${primary.announcementTitle} 공식 분양 홈페이지`,
    confidence: primary.confidence,
    gallery: pickGallery(records).map(record => ({
      url: record.imageUrl,
      subjectType: record.subjectType,
      label: SUBJECT_LABEL[record.subjectType] ?? SUBJECT_LABEL.unknown,
    })),
  };
}

/** 관리자 화면·보고용. 막힌 후보와 이유까지 그대로 보여 준다. */
export function listingVisualRecords(listingId?: string): ListingVisualRecord[] {
  const all = (resolved as { visuals: ListingVisualRecord[] }).visuals;
  return listingId ? all.filter(record => record.listingId === listingId) : all;
}
