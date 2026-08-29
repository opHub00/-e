import type { UserProfile } from '../../domain/types.ts';
import type {
  DiscoveryFilters,
  DiscoveryListing,
  DiscoveryRegion,
  ListingRelevance,
  RecruitmentStatus,
} from './types.ts';

export const DEFAULT_DISCOVERY_FILTERS: DiscoveryFilters = {
  personalizedOnly: true,
  status: 'all',
  region: 'all',
  supplyType: 'all',
};

const STATUS_PRIORITY: Record<RecruitmentStatus, number> = {
  open: 0,
  upcoming: 1,
  closed: 2,
  unknown: 3,
};

function compareListingDates(a: DiscoveryListing, b: DiscoveryListing): number {
  const getDate = (listing: DiscoveryListing) => {
    if (listing.recruitmentStatus === 'open') {
      return listing.recruitmentEndDate ?? listing.recruitmentStartDate;
    }
    if (listing.recruitmentStatus === 'upcoming') {
      return listing.recruitmentStartDate ?? listing.recruitmentEndDate;
    }
    if (listing.recruitmentStatus === 'closed') {
      return listing.recruitmentEndDate ?? listing.recruitmentStartDate;
    }
    return listing.announcementDate;
  };
  const aDate = getDate(a);
  const bDate = getDate(b);
  if (aDate === null) return bDate === null ? 0 : 1;
  if (bDate === null) return -1;
  const dateDelta = aDate.localeCompare(bDate);
  return a.recruitmentStatus === 'closed' || a.recruitmentStatus === 'unknown'
    ? -dateDelta
    : dateDelta;
}

export const RECRUITMENT_STATUS_LABEL: Record<RecruitmentStatus, string> = {
  open: '모집중',
  upcoming: '모집예정',
  closed: '모집종료',
  unknown: '일정확인필요',
};

export function getProfileRegion(region: string): DiscoveryRegion | null {
  if (region.includes('서울')) return '서울';
  if (region.includes('경기')) return '경기';
  if (region.includes('인천')) return '인천';
  return null;
}

/**
 * 관심 순서를 돕는 데모 휴리스틱이다. 신청 가능 여부나 자격 충족 여부를 계산하지 않는다.
 */
export function getListingRelevance(
  profile: UserProfile,
  listing: DiscoveryListing,
): ListingRelevance {
  let score = 0;
  const reasons: string[] = [];
  const profileRegion = getProfileRegion(profile.region);

  if (profileRegion === listing.region) {
    score += 4;
    reasons.push(`${profile.region || listing.region} 관심 지역과 가까워요`);
  } else if (listing.interestTags.includes('수도권 관심')) {
    score += 1;
    reasons.push('수도권에서 함께 살펴볼 만한 공고예요');
  }

  if (profile.isNoHomeOwner && listing.interestTags.includes('무주택 관심')) {
    score += 2;
    reasons.push('현재 무주택 상태와 관련된 공고 항목이 있어요');
  }

  if (profile.age <= 39 && listing.interestTags.includes('청년 관심')) {
    score += 2;
    reasons.push('연령대 관련 공급 내용을 확인해볼 만해요');
  }

  if (profile.occupation === 'student' && listing.interestTags.includes('첫 청약 관심')) {
    score += 1;
    reasons.push('첫 청약 탐색 단계에서 비교해볼 만해요');
  }

  if (profile.hasSubscriptionAccount && listing.interestTags.includes('통장 유지 관심')) {
    score += 1;
    reasons.push('통장을 유지 중이라 일정 확인 연습과 연결돼요');
  }

  const level = score >= 5 ? 'high' : score >= 3 ? 'worth' : 'check';
  const label =
    level === 'high' ? '관심 높음' : level === 'worth' ? '확인해볼 만함' : '추가 확인 필요';

  return {
    level,
    label,
    score,
    reasons: reasons.length > 0 ? reasons.slice(0, 2) : ['공고문 조건을 하나씩 확인해보세요'],
  };
}

export function filterListings(
  listings: DiscoveryListing[],
  profile: UserProfile,
  filters: DiscoveryFilters,
): DiscoveryListing[] {
  return listings.filter((listing) => {
    if (filters.personalizedOnly && getListingRelevance(profile, listing).level === 'check') {
      return false;
    }
    if (filters.status !== 'all' && listing.recruitmentStatus !== filters.status) return false;
    if (filters.region !== 'all' && listing.region !== filters.region) return false;
    if (filters.supplyType !== 'all' && listing.supplyType !== filters.supplyType) return false;
    return true;
  });
}

export function sortListings(
  listings: DiscoveryListing[],
  profile: UserProfile,
  personalized: boolean,
): DiscoveryListing[] {
  return [...listings].sort((a, b) => {
    const statusDelta = STATUS_PRIORITY[a.recruitmentStatus] - STATUS_PRIORITY[b.recruitmentStatus];
    if (statusDelta !== 0) return statusDelta;

    if (personalized) {
      const scoreDelta = getListingRelevance(profile, b).score - getListingRelevance(profile, a).score;
      if (scoreDelta !== 0) return scoreDelta;
    }

    const dateDelta = compareListingDates(a, b);
    return dateDelta !== 0 ? dateDelta : a.id.localeCompare(b.id);
  });
}

export function getVisibleListings(
  listings: DiscoveryListing[],
  profile: UserProfile,
  filters: DiscoveryFilters,
) {
  return sortListings(filterListings(listings, profile, filters), profile, filters.personalizedOnly);
}

export function projectListingPin(
  listing: DiscoveryListing,
  listings: DiscoveryListing[],
): { x: number; y: number } {
  if (!hasListingCoordinates(listing)) {
    throw new Error(`Listing ${listing.id} has no coordinates and cannot be projected`);
  }
  const mappable = listings.filter(hasListingCoordinates);
  const latitudes = mappable.map((item) => item.latitude);
  const longitudes = mappable.map((item) => item.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const xRange = maxLng - minLng || 1;
  const yRange = maxLat - minLat || 1;

  return {
    x: 9 + ((listing.longitude - minLng) / xRange) * 80,
    y: 8 + ((maxLat - listing.latitude) / yRange) * 58,
  };
}

export function formatPrice(value: number | null): string {
  if (value === null) return '가격 확인 필요';
  const eok = value / 100_000_000;
  return `${Number.isInteger(eok) ? eok.toFixed(0) : eok.toFixed(1)}억`;
}

export function hasListingPrice(listing: DiscoveryListing): boolean {
  return listing.representativePrice !== null;
}

export function formatShortDate(value: string | null): string {
  if (!value) return '일정 확인 필요';
  const [, month, day] = value.split('-');
  return `${Number(month)}.${Number(day)}`;
}

export function formatRecruitmentSchedule(listing: DiscoveryListing): string {
  if (!listing.recruitmentStartDate && !listing.recruitmentEndDate) return '일정 확인 필요';
  if (!listing.recruitmentStartDate) return `${formatShortDate(listing.recruitmentEndDate)}까지`;
  if (!listing.recruitmentEndDate) return `${formatShortDate(listing.recruitmentStartDate)}부터`;
  return `${formatShortDate(listing.recruitmentStartDate)} – ${formatShortDate(listing.recruitmentEndDate)}`;
}

export function formatHouseholdCount(value: number | null): string {
  return value === null ? '규모 확인 필요' : `${value.toLocaleString('ko-KR')}세대`;
}

export function hasListingCoordinates(
  listing: DiscoveryListing,
): listing is DiscoveryListing & { latitude: number; longitude: number } {
  return Number.isFinite(listing.latitude) && Number.isFinite(listing.longitude);
}
