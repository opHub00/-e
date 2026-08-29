import type { DiscoveryListing, ListingStory } from './types.ts';

const AUTHORS = ['집찾는민지', '청약초보22', '퇴근후공부', '서울살이', '통장지킴이', '동네탐험가'];
const TIMES = ['12분 전', '28분 전', '1시간 전', '3시간 전', '어제', '2일 전'];

/** 상세 화면에 종속된 읽기 전용 데모 이야기. 게시·서버 기능은 없다. */
export function getStoriesForListing(listing: DiscoveryListing): ListingStory[] {
  if (!listing.isDemo) return [];
  const bodies = [
    `${listing.complexName}은 ${listing.district} 생활권이 궁금해서 우선 저장해뒀어요.`,
    `모집 일정이 ${listing.recruitmentStartDate?.slice(5).replace('-', '.') ?? '확인 필요'}라 캘린더에 따로 표시했어요.`,
    `대표 가격만 보고 결정하지 않고 타입별 금액과 납부 일정을 공고에서 보려고요.`,
    `${listing.housingType} 주변 교통과 실제 출퇴근 시간을 주말에 확인해보려 해요.`,
    `${listing.supplyType} 공고는 처음이라 용어부터 차근차근 읽어보는 중이에요.`,
    `저장해두고 공식 모집공고가 나오면 세대·거주·통장 관련 항목부터 확인하려고요.`,
  ];

  const offset = listing.id.length % AUTHORS.length;
  return bodies.map((body, index) => ({
    id: `${listing.id}-story-${index + 1}`,
    listingId: listing.id,
    author: AUTHORS[(index + offset) % AUTHORS.length],
    body,
    relativeTime: TIMES[index],
    likes: 2 + ((listing.id.length * (index + 3)) % 24),
  }));
}
