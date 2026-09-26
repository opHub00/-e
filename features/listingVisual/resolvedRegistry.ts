import type { DiscoveryListing } from '../discovery/types.ts';
import { pickBest, type ListingVisualRecord } from './resolver.ts';
import resolved from '../../data/listing-visuals/resolved.json' with { type: 'json' };

/**
 * 자동으로 찾은 대표 이미지 중 **검증을 통과한 것만** 꺼내 준다.
 *
 * 기록에는 막힌 후보도 함께 들어 있다. 여기서는 verified 만 보고, 없으면 아무것도 돌려주지 않는다.
 * 그러면 화면은 기존 fallback 을 그대로 쓴다.
 */
const BY_LISTING = new Map<string, ListingVisualRecord[]>();
for (const record of (resolved as { visuals: ListingVisualRecord[] }).visuals) {
  if (!BY_LISTING.has(record.listingId)) BY_LISTING.set(record.listingId, []);
  BY_LISTING.get(record.listingId)!.push(record);
}

export type ResolvedListingImage = {
  url: string;
  source: { name: string; pageUrl: string };
  attribution: string;
  confidence: number;
};

export function resolvedListingImage(listing: Pick<DiscoveryListing, 'id'>): ResolvedListingImage | undefined {
  const best = pickBest(BY_LISTING.get(listing.id) ?? []);
  if (!best) return undefined;
  return {
    url: best.imageUrl,
    source: { name: best.announcementTitle, pageUrl: best.sourceUrl },
    attribution: `${best.announcementTitle} 공식 분양 홈페이지`,
    confidence: best.confidence,
  };
}

/** 관리자 화면·보고용. 막힌 후보와 이유까지 그대로 보여 준다. */
export function listingVisualRecords(listingId?: string): ListingVisualRecord[] {
  const all = (resolved as { visuals: ListingVisualRecord[] }).visuals;
  return listingId ? all.filter(record => record.listingId === listingId) : all;
}
