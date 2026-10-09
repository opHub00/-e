import type { LoadedEvent } from '../eventConfig.ts';
import type { ServiceListingPortfolio } from '../live/types.ts';
import type { ListingMedia } from '../media/listingMedia.ts';

export type StoryListingCard = {
  id: string;
  title: string;
  meta: string;
  supplyCount: number;
  media: ListingMedia;
  origin: 'LIVE' | 'FROZEN_REFERENCE';
};

export type StoryData = {
  region: string;
  listings: StoryListingCard[];
  supplies: string[];
  featured: {
    listingId: string;
    title: string;
    meta: string;
    schedule: string;
    supplyLabel: string;
    housingType: string;
    district: string;
    media: ListingMedia;
    origin: 'LIVE' | 'FROZEN_REFERENCE';
  };
};

export const STORY_CONDITION_TAGS = [
  ['소득 기준', '무주택'],
  ['거주 기간', '자산 기준', '청약통장'],
  ['혼인 기간', '자녀 수'],
  ['소득 기준', '차량가액'],
  ['무주택', '거주 기간', '자산 기준'],
] as const;

export const STORY_PROFILE_FIELDS = [
  { icon: 'cake', label: '나이' },
  { icon: 'favorite-border', label: '혼인' },
  { icon: 'child-care', label: '자녀' },
  { icon: 'home', label: '무주택' },
  { icon: 'savings', label: '청약통장' },
] as const;

const dot = (date: string | null) => date ? date.slice(5).replace('-', '.') : '일정 확인';

export function storyDataFrom(event: LoadedEvent, portfolio: ServiceListingPortfolio | null = null): StoryData {
  const live = (portfolio?.listings ?? [])
    .filter(listing => listing.origin === 'LIVE' && listing.lifecycle !== 'ARCHIVED')
    .map(listing => ({
      id: listing.canonicalKey,
      title: listing.title,
      meta: `실제 최신 공고 · ${listing.provider}`,
      supplyCount: listing.supplyTypes.length,
      media: listing.media,
      origin: 'LIVE' as const,
      schedule: `접수 ${dot(listing.applicationStart)} ~ ${dot(listing.applicationEnd)}`,
      supplyLabel: listing.supplyTypes[0] ?? '공급유형 확인',
      housingType: listing.housingName,
      district: listing.region,
    }));

  const frozen = event.config.listings.map(listing => {
    const rulePackage = event.dataset.rulePackages.find(item => item.listingId === listing.listingId);
    return {
      id: listing.listingId,
      title: listing.title,
      meta: `${listing.housingType} · ${listing.district}`,
      supplyCount: rulePackage?.supplies.length ?? 0,
      media: listing.media,
      origin: 'FROZEN_REFERENCE' as const,
      schedule: `접수 ${dot(listing.recruitment.startDate)} ~ ${dot(listing.recruitment.endDate)}`,
      supplyLabel: rulePackage?.supplies[0]?.label ?? listing.housingType,
      housingType: listing.housingType,
      district: listing.district,
    };
  });

  const combined = [...live, ...frozen];
  const listings = combined.slice(0, 5).map(({ schedule: _schedule, supplyLabel: _supply, housingType: _housing, district: _district, ...listing }) => listing);
  const supplies = [...new Set([
    ...live.flatMap(item => (portfolio?.listings.find(listing => listing.canonicalKey === item.id)?.supplyTypes ?? [])),
    ...event.dataset.rulePackages.flatMap(item => item.supplies.map(supply => supply.label)),
  ])].slice(0, 6);

  const featured = live[0] ?? [...frozen].sort((a, b) => b.supplyCount - a.supplyCount)[0];
  return {
    region: event.config.regionLabel,
    listings,
    supplies,
    featured: {
      listingId: featured.id,
      title: featured.title,
      meta: featured.meta,
      schedule: featured.schedule,
      supplyLabel: featured.supplyLabel,
      housingType: featured.housingType,
      district: featured.district,
      media: featured.media,
      origin: featured.origin,
    },
  };
}
