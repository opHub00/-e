export type DiscoveryRegion = '서울' | '경기' | '인천';

export type RecruitmentStatus = 'open' | 'upcoming' | 'closed' | 'unknown';

export type HousingType = '아파트' | '오피스텔' | '도시형생활주택' | '기타';

export type SupplyType = '일반공급' | '공공분양' | '민간분양' | '공공지원 민간임대' | '기타';

export type ListingInterestTag =
  | '청년 관심'
  | '무주택 관심'
  | '첫 청약 관심'
  | '직장인 관심'
  | '통장 유지 관심'
  | '수도권 관심';

export type ListingImagePlaceholder = {
  from: string;
  to: string;
  icon: 'apartment' | 'location-city' | 'holiday-village' | 'domain';
};

export type ListingSourceType =
  | 'mock'
  | 'openapi'
  | 'applyhome-apt'
  | 'applyhome-remnant';

export type ListingGeocodeStatus =
  | 'resolved'
  | 'not_found'
  | 'ambiguous'
  | 'provider_error';

/**
 * 앱 내부의 provider-independent 청약 모델.
 * 자격 충족·순위·가점·당첨 가능성을 판정할 수 있는 필드는 의도적으로 두지 않는다.
 */
export type DiscoveryListing = {
  id: string;
  sourceType: ListingSourceType;
  complexName: string;
  region: DiscoveryRegion;
  district: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  coordinateSource?: 'kakao';
  geocodeStatus?: ListingGeocodeStatus;
  geocodeMatchedAddress?: string;
  announcementDate: string | null;
  recruitmentStatus: RecruitmentStatus;
  recruitmentStartDate: string | null;
  recruitmentEndDate: string | null;
  winnerAnnouncementDate: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  announcementUrl: string | null;
  homepageUrl: string | null;
  housingType: HousingType;
  supplyType: SupplyType;
  representativePrice: number | null;
  householdCount: number | null;
  imagePlaceholder: ListingImagePlaceholder;
  interestTags: ListingInterestTag[];
  checkpoints: string[];
  isDemo: boolean;
};

/** V2 이후 데이터 계층에서 사용하는 짧은 이름. 기존 UI 타입명은 호환을 위해 유지한다. */
export type Listing = DiscoveryListing;

export type RelevanceLevel = 'high' | 'worth' | 'check';

export type ListingRelevance = {
  level: RelevanceLevel;
  label: '관심 높음' | '확인해볼 만함' | '추가 확인 필요';
  score: number;
  reasons: string[];
};

export type DiscoveryFilters = {
  personalizedOnly: boolean;
  status: 'all' | Exclude<RecruitmentStatus, 'closed'>;
  region: 'all' | DiscoveryRegion;
  supplyType: 'all' | SupplyType;
};

export type ListingStory = {
  id: string;
  listingId: string;
  author: string;
  body: string;
  relativeTime: string;
  likes: number;
};
