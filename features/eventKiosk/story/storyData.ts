import type { LoadedEvent } from '../eventConfig.ts';
import { listingMediaOf, type ListingMedia } from '../media/listingMedia.ts';

/**
 * Story 에 들어가는 그림 재료. 실제 행사 공고에서 가져오되, 방문자의 개인정보나 판정 결과는 쓰지 않는다.
 * 분류 장면의 '신청 가능' 같은 상태는 예시라서 화면에 '예시'라고 함께 적는다.
 */
export type StoryListingCard = {
  id: string;
  title: string;
  meta: string;
  supplyCount: number;
};

export type StoryData = {
  region: string;
  listings: StoryListingCard[];
  /** 분류 장면에 흩어졌다 모이는 공급유형 칩. 실제 공급유형 이름. */
  supplies: string[];
  /** 마지막 장면에서 커지는 주택. */
  featured: {
    listingId: string;
    title: string;
    meta: string;
    housingType: string;
    district: string;
    schedule: string;
    supplyLabel: string;
    /** Codex 가 공고 이미지를 붙이면 여기로 들어온다. 없으면 빈 배열 → placeholder. */
    media: ListingMedia[];
  };
};

/** 공고마다 붙어 있는 조건 태그. 판정 값이 아니라 '조건이 많다'를 보여 주는 이름뿐이다. */
export const STORY_CONDITION_TAGS = [
  ['소득 기준', '무주택'],
  ['거주 기간', '자산 기준', '청약통장'],
  ['혼인 기간', '자녀 수'],
  ['소득 기준', '차량가액'],
  ['무주택', '거주 기간', '자산 기준'],
] as const;

/** 프로필로 모이는 항목. 값은 없다. */
export const STORY_PROFILE_FIELDS = [
  { icon: 'cake', label: '나이' },
  { icon: 'favorite-border', label: '혼인' },
  { icon: 'child-care', label: '자녀' },
  { icon: 'home', label: '무주택' },
  { icon: 'savings', label: '청약통장' },
] as const;

const dot = (date: string) => date.slice(5).replace('-', '.');

export function storyDataFrom(event: LoadedEvent): StoryData {
  const listings = event.config.listings.slice(0, 5).map(listing => {
    const rulePackage = event.dataset.rulePackages.find(item => item.listingId === listing.listingId);
    return {
      id: listing.listingId,
      title: listing.title,
      meta: `${listing.housingType} · ${listing.district}`,
      supplyCount: rulePackage?.supplies.length ?? 0,
    };
  });
  const supplies = [...new Set(event.dataset.rulePackages.flatMap(item => item.supplies.map(supply => supply.label)))].slice(0, 6);
  // 공급유형이 가장 많은 공고를 대표로 쓴다. 특정 방문자에게 유리하다는 뜻이 아니다.
  const featuredSource = [...event.config.listings].sort((a, b) => {
    const count = (id: string) => event.dataset.rulePackages.find(item => item.listingId === id)?.supplies.length ?? 0;
    return count(b.listingId) - count(a.listingId);
  })[0];
  const featuredSupply = event.dataset.rulePackages.find(item => item.listingId === featuredSource.listingId)?.supplies[0]?.label ?? featuredSource.housingType;
  return {
    region: event.config.regionLabel,
    listings,
    supplies,
    featured: {
      listingId: featuredSource.listingId,
      title: featuredSource.title,
      meta: `${featuredSource.housingType} · ${featuredSource.district}`,
      housingType: featuredSource.housingType,
      district: featuredSource.district,
      media: listingMediaOf(featuredSource as unknown as { title: string } & Record<string, unknown>),
      schedule: `접수 ${dot(featuredSource.recruitment.startDate)} ~ ${dot(featuredSource.recruitment.endDate)}`,
      supplyLabel: featuredSupply,
    },
  };
}
