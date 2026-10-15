import type { LoadedEvent } from '../eventConfig.ts';
import type { ListingMedia } from '../media/listingMedia.ts';
import { emptyListingMedia } from '../media/listingMedia.ts';
import { SAMDO_EVENT } from '../samdoEventScope.ts';

export type StoryListingCard = {
  id: string;
  title: string;
  meta: string;
  supplyCount: number;
  media: ListingMedia;
  origin: 'FROZEN_REFERENCE';
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
    origin: 'FROZEN_REFERENCE';
  };
};

export const STORY_CONDITION_TAGS = [
  ['소득 기준', '무주택'],
  ['거주 기간', '자산 기준', '청약통장'],
  ['혼인 기간', '자녀·출산'],
  ['소득 기준', '공급단계'],
  ['무주택', '거주 기간', '공식 가점'],
] as const;

export const STORY_PROFILE_FIELDS = [
  { icon: 'cake', label: '나이' },
  { icon: 'favorite-border', label: '혼인' },
  { icon: 'child-care', label: '자녀' },
  { icon: 'home', label: '무주택' },
  { icon: 'savings', label: '청약통장' },
] as const;

/** 행사 Product Story는 라이브 공고 목록이 아니라 삼도이동 1지구 공식 공급정보만 사용한다. */
export function storyDataFrom(_event: LoadedEvent): StoryData {
  const media = emptyListingMedia(`${SAMDO_EVENT.title} 대표 이미지`);
  const supplies = [...SAMDO_EVENT.recommendationSupplies, ...SAMDO_EVENT.informationOnlySupplies];
  return {
    region: SAMDO_EVENT.shortTitle,
    listings: [{
      id: SAMDO_EVENT.listingId,
      title: SAMDO_EVENT.title,
      meta: `토지임대부 분양 · 총 ${SAMDO_EVENT.inventory.total}세대`,
      supplyCount: supplies.length,
      media,
      origin: 'FROZEN_REFERENCE',
    }],
    supplies: supplies.map(supply => supply.label),
    featured: {
      listingId: SAMDO_EVENT.listingId,
      title: SAMDO_EVENT.title,
      meta: `49㎡ ${SAMDO_EVENT.inventory.units49}세대 · 59㎡ ${SAMDO_EVENT.inventory.units59}세대`,
      schedule: '특별공급 11.16 · 일반공급 11.17~11.18',
      supplyLabel: '5개 신청유형 비교',
      housingType: '토지임대부 분양주택',
      district: '제주시 삼도이동',
      media,
      origin: 'FROZEN_REFERENCE',
    },
  };
}
