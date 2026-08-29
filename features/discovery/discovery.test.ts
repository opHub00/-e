import type { UserProfile } from '../../domain/types.ts';
import {
  DEFAULT_DISCOVERY_FILTERS,
  filterListings,
  getListingRelevance,
  projectListingPin,
  sortListings,
} from './domain.ts';
import { discoveryListings } from './mockListings.ts';

let checks = 0;
const check = (condition: unknown, message: string) => {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
};

const seoulProfile: UserProfile = {
  name: '지민',
  age: 22,
  occupation: 'student',
  region: '서울특별시',
  hasSubscriptionAccount: true,
  accountMonths: 14,
  monthlyPayment: 100000,
  isNoHomeOwner: true,
};

const unrelatedProfile: UserProfile = {
  ...seoulProfile,
  age: 48,
  occupation: 'etc',
  region: '부산광역시',
  hasSubscriptionAccount: false,
  accountMonths: 0,
  monthlyPayment: 0,
  isNoHomeOwner: false,
};

// Mock data validity
check(discoveryListings.length >= 10 && discoveryListings.length <= 15, '데모 데이터는 10~15개여야 한다');
check(new Set(discoveryListings.map((listing) => listing.id)).size === discoveryListings.length, 'id는 유일해야 한다');

for (const listing of discoveryListings) {
  if (
    listing.latitude === null ||
    listing.longitude === null ||
    listing.recruitmentStartDate === null ||
    listing.recruitmentEndDate === null ||
    listing.representativePrice === null ||
    listing.householdCount === null
  ) throw new Error(`FAIL: ${listing.id} mock fixture required fields`);
  check(listing.isDemo === true, `${listing.id}: 데모 표시가 필요하다`);
  check(Boolean(listing.complexName && listing.address && listing.district), `${listing.id}: 기본 텍스트가 필요하다`);
  check(listing.latitude >= 37.2 && listing.latitude <= 37.7, `${listing.id}: 위도가 수도권 데모 범위여야 한다`);
  check(listing.longitude >= 126.6 && listing.longitude <= 127.3, `${listing.id}: 경도가 수도권 데모 범위여야 한다`);
  check(listing.recruitmentStartDate <= listing.recruitmentEndDate, `${listing.id}: 일정 순서가 유효해야 한다`);
  check(listing.representativePrice > 0 && listing.householdCount > 0, `${listing.id}: 가격·세대수가 양수여야 한다`);
  check(listing.interestTags.length > 0, `${listing.id}: 관심 태그가 필요하다`);
  check(listing.checkpoints.length >= 3, `${listing.id}: 확인 조건이 3개 이상이어야 한다`);

  const forbiddenKeys = ['eligible', 'eligibility', 'qualification', 'winningProbability', 'priorityRank'];
  check(
    forbiddenKeys.every((key) => !(key in listing)),
    `${listing.id}: 자격·당첨 판정 필드를 포함하면 안 된다`,
  );
}

// Relevance
const mapo = discoveryListings.find((listing) => listing.id === 'mapo-riverline');
if (!mapo) throw new Error('FAIL: mapo-riverline fixture가 필요하다');
const mapoRelevance = getListingRelevance(seoulProfile, mapo);
check(mapoRelevance.level === 'high', '관심 지역과 여러 관심 태그가 맞으면 관심 높음이어야 한다');
check(mapoRelevance.label === '관심 높음', '허용된 관련성 문구를 사용해야 한다');
check(mapoRelevance.reasons.some((reason) => reason.includes('관심 지역')), '관심 지역 이유가 반환되어야 한다');
check(mapoRelevance.reasons.length <= 2, '화면 이유는 최대 2개여야 한다');

const nowon = discoveryListings.find((listing) => listing.id === 'nowon-thefirst');
if (!nowon) throw new Error('FAIL: nowon-thefirst fixture가 필요하다');
const unrelated = getListingRelevance(unrelatedProfile, nowon);
check(unrelated.level === 'check', '관련 신호가 없으면 추가 확인 필요여야 한다');
check(unrelated.label === '추가 확인 필요', '자격 판정이 아닌 안전한 문구를 써야 한다');

const forbiddenLabels = ['신청 가능', '자격 충족', '당첨 가능성', '1순위'];
for (const listing of discoveryListings) {
  const relevance = getListingRelevance(seoulProfile, listing);
  check(forbiddenLabels.every((word) => !relevance.label.includes(word)), `${listing.id}: 금지된 판정 문구가 없어야 한다`);
}

// Filters
const openOnly = filterListings(discoveryListings, seoulProfile, {
  ...DEFAULT_DISCOVERY_FILTERS,
  personalizedOnly: false,
  status: 'open',
});
check(openOnly.length > 0, '모집중 결과가 있어야 한다');
check(openOnly.every((listing) => listing.recruitmentStatus === 'open'), '모집중 필터가 정확해야 한다');

const incheonOnly = filterListings(discoveryListings, seoulProfile, {
  ...DEFAULT_DISCOVERY_FILTERS,
  personalizedOnly: false,
  region: '인천',
});
check(incheonOnly.length === 2, '인천 데모 공고는 2개여야 한다');
check(incheonOnly.every((listing) => listing.region === '인천'), '지역 필터가 정확해야 한다');

const publicUpcoming = filterListings(discoveryListings, seoulProfile, {
  ...DEFAULT_DISCOVERY_FILTERS,
  personalizedOnly: false,
  status: 'upcoming',
  supplyType: '공공분양',
});
check(publicUpcoming.length > 0, '모집예정 공공분양 결과가 있어야 한다');
check(
  publicUpcoming.every(
    (listing) => listing.recruitmentStatus === 'upcoming' && listing.supplyType === '공공분양',
  ),
  '복합 필터가 정확해야 한다',
);

const personalized = filterListings(discoveryListings, unrelatedProfile, DEFAULT_DISCOVERY_FILTERS);
check(
  personalized.every((listing) => getListingRelevance(unrelatedProfile, listing).level !== 'check'),
  '내 조건 추천은 추가 확인 필요 결과를 제외해야 한다',
);

// Sorting
const relevanceSorted = sortListings(discoveryListings, seoulProfile, true);
for (let index = 1; index < relevanceSorted.length; index += 1) {
  const previous = relevanceSorted[index - 1];
  const current = relevanceSorted[index];
  if (previous.recruitmentStatus === current.recruitmentStatus) {
    check(
      getListingRelevance(seoulProfile, previous).score >=
        getListingRelevance(seoulProfile, current).score,
      '동일 모집 상태 안에서는 관련성 점수 내림차순이어야 한다',
    );
  }
}

const regularSorted = sortListings(discoveryListings, seoulProfile, false);
const firstUpcoming = regularSorted.findIndex((listing) => listing.recruitmentStatus === 'upcoming');
const lastOpen = regularSorted.map((listing) => listing.recruitmentStatus).lastIndexOf('open');
check(firstUpcoming > lastOpen, '기본 정렬에서 모집중이 모집예정보다 먼저여야 한다');
const firstClosed = regularSorted.findIndex((listing) => listing.recruitmentStatus === 'closed');
const lastUpcoming = regularSorted.map((listing) => listing.recruitmentStatus).lastIndexOf('upcoming');
check(firstClosed > lastUpcoming, '기본 정렬에서 모집예정이 모집종료보다 먼저여야 한다');
check(
  regularSorted.length === discoveryListings.length && regularSorted.some((listing) => listing.recruitmentStatus === 'closed'),
  '정렬은 종료 공고를 삭제하지 않아야 한다',
);

const scheduleTieBase = { ...mapo, recruitmentStatus: 'upcoming' as const, interestTags: [] };
const scheduleSorted = sortListings([
  { ...scheduleTieBase, id: 'far', recruitmentStartDate: '2026-10-01' },
  { ...scheduleTieBase, id: 'near', recruitmentStartDate: '2026-09-01' },
  { ...scheduleTieBase, id: 'unknown-date', recruitmentStartDate: null, recruitmentEndDate: null },
], seoulProfile, true);
check(scheduleSorted[0].id === 'near', '동일 상태·관련성이면 가까운 예정 일정이 먼저여야 한다');
check(scheduleSorted.at(-1)?.id === 'unknown-date', '날짜 null은 임의 보정하지 않고 같은 상태의 마지막이어야 한다');

const allStatusSorted = sortListings([
  { ...mapo, id: 'unknown', recruitmentStatus: 'unknown', recruitmentStartDate: null, recruitmentEndDate: null },
  { ...mapo, id: 'closed', recruitmentStatus: 'closed' },
  { ...mapo, id: 'upcoming', recruitmentStatus: 'upcoming' },
  { ...mapo, id: 'open', recruitmentStatus: 'open' },
], seoulProfile, true);
check(
  allStatusSorted.map((listing) => listing.recruitmentStatus).join(',') === 'open,upcoming,closed,unknown',
  '기본 status 우선순위는 접수중, 모집예정, 모집종료, 일정확인필요 순이어야 한다',
);

// Coordinate projection
for (const listing of discoveryListings) {
  const pin = projectListingPin(listing, discoveryListings);
  check(pin.x >= 9 && pin.x <= 89, `${listing.id}: 지도 x가 surface 안에 있어야 한다`);
  check(pin.y >= 8 && pin.y <= 66, `${listing.id}: 지도 y가 surface 안에 있어야 한다`);
}

console.log(`features/discovery: ${checks}개 검증 통과`);
