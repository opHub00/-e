import { buildCalendarEvents, type CalendarEvent } from '../calendar/calendarModel.ts';
import { parseDateOnly, toDateOnlyOrdinal } from '../calendar/domain.ts';
import type { Listing } from '../discovery/types.ts';
import {
  getBundleCompletion,
  knownValue,
  type ApplicantProfileV2,
  type ProfileQuestionBundleId,
} from '../profile/domain.ts';

export type NewlywedChecklistStatus = 'confirmed' | 'information-needed' | 'notice-check';

export type NewlywedChecklistItem = {
  id: string;
  title: string;
  detail: string;
  status: NewlywedChecklistStatus;
  bundleId?: ProfileQuestionBundleId;
};

export type NewlywedRelatedListing = {
  listing: Listing;
  preferenceMatch: boolean;
  basis: 'official-special-supply-schedule';
};

export type NewlywedDashboardModel = {
  checklist: NewlywedChecklistItem[];
  confirmedCount: number;
  informationItemCount: number;
  relatedListings: NewlywedRelatedListing[];
  upcomingEvents: CalendarEvent[];
};

const PROFILE_CHECKS: ReadonlyArray<{
  id: string;
  title: string;
  bundleId: ProfileQuestionBundleId;
  completeDetail: string;
  neededDetail: string;
}> = [
  { id: 'family', title: '혼인·자녀 정보', bundleId: 'FAMILY', completeDetail: '저장된 혼인·자녀 정보를 확인했어요.', neededDetail: '혼인 여부·기간과 자녀 정보를 확인해 주세요.' },
  { id: 'account', title: '청약통장', bundleId: 'SUBSCRIPTION_ACCOUNT', completeDetail: '통장 보유·유지 정보를 확인했어요.', neededDetail: '통장 보유 여부와 유지 정보를 확인해 주세요.' },
  { id: 'housing', title: '무주택·특별공급 이력', bundleId: 'HOUSING_HISTORY', completeDetail: '본인·세대 주택 이력 정보를 확인했어요.', neededDetail: '본인·세대의 주택 및 특별공급 이력을 확인해 주세요.' },
  { id: 'income', title: '소득 정보', bundleId: 'INCOME', completeDetail: '저장된 소득 범위 정보를 확인했어요.', neededDetail: '공고 기준과 비교할 소득 정보를 확인해 주세요.' },
  { id: 'assets', title: '자산 정보', bundleId: 'ASSETS', completeDetail: '저장된 자산 범위 정보를 확인했어요.', neededDetail: '공고 기준과 비교할 자산 정보를 확인해 주세요.' },
  { id: 'residence', title: '현재 거주지역', bundleId: 'RESIDENCE', completeDetail: '현재 거주지역을 확인했어요.', neededDetail: '지역별 조건 확인을 위해 거주지역을 입력해 주세요.' },
  { id: 'preferences', title: '관심지역', bundleId: 'PREFERENCES', completeDetail: '관심지역을 확인했어요.', neededDetail: '먼저 볼 공고를 위해 관심지역을 입력해 주세요.' },
];

export function buildNewlywedChecklist(profile: ApplicantProfileV2): NewlywedChecklistItem[] {
  const profileItems = PROFILE_CHECKS.map((check) => {
    const completion = getBundleCompletion(profile, check.bundleId);
    const complete = completion === 'complete';
    const detail = check.id === 'family' && complete
      ? getFamilyDetail(profile)
      : complete
        ? check.completeDetail
        : completion === 'partial'
          ? `${check.neededDetail} 일부 정보만 저장되어 있어요.`
          : check.neededDetail;
    return {
      id: check.id,
      title: check.title,
      detail,
      status: complete ? 'confirmed' : 'information-needed',
      bundleId: check.bundleId,
    } satisfies NewlywedChecklistItem;
  });

  return [...profileItems, {
    id: 'notice',
    title: '공고별 특별공급 조건',
    detail: '주택 유형·혼인기간·소득·자산 등 세부 기준은 공식 모집공고문에서 다시 확인해야 해요.',
    status: 'notice-check',
  }];
}

export function getNewlywedRelatedListings(
  listings: readonly Listing[],
  preferredRegions: readonly string[],
): NewlywedRelatedListing[] {
  const preferences = new Set(preferredRegions.map((region) => region.trim()).filter(Boolean));
  return listings
    .filter(hasOfficialSpecialSupplySchedule)
    .map((listing) => ({
      listing,
      preferenceMatch: preferences.has(listing.region),
      basis: 'official-special-supply-schedule' as const,
    }))
    .sort((a, b) => Number(b.preferenceMatch) - Number(a.preferenceMatch)
      || firstSpecialSupplyDate(a.listing).localeCompare(firstSpecialSupplyDate(b.listing))
      || a.listing.complexName.localeCompare(b.listing.complexName));
}

export function buildNewlywedDashboard(
  profile: ApplicantProfileV2,
  listings: readonly Listing[],
  today: string,
): NewlywedDashboardModel {
  const checklist = buildNewlywedChecklist(profile);
  const relatedListings = getNewlywedRelatedListings(listings, profile.preferences.regions);
  const todayOrdinal = toDateOnlyOrdinal(today);
  const upcomingEvents = buildCalendarEvents(relatedListings.map((item) => item.listing))
    .filter((event) => event.type === 'special-supply')
    .filter((event) => {
      const ordinal = toDateOnlyOrdinal(event.date);
      return ordinal !== null && todayOrdinal !== null && ordinal >= todayOrdinal;
    });
  return {
    checklist,
    confirmedCount: checklist.filter((item) => item.status === 'confirmed').length,
    informationItemCount: PROFILE_CHECKS.length,
    relatedListings,
    upcomingEvents,
  };
}

export function hasOfficialSpecialSupplySchedule(listing: Listing): boolean {
  if (!['applyhome-apt', 'openapi'].includes(listing.sourceType)) return false;
  const schedule = listing.officialSchedule?.specialSupply;
  return Boolean(schedule && (
    (schedule.startDate && parseDateOnly(schedule.startDate)) ||
    (schedule.endDate && parseDateOnly(schedule.endDate))
  ));
}

function firstSpecialSupplyDate(listing: Listing): string {
  const schedule = listing.officialSchedule?.specialSupply;
  const candidates = [schedule?.startDate, schedule?.endDate]
    .filter((value): value is string => Boolean(value && parseDateOnly(value)))
    .sort();
  return candidates[0] ?? '9999-12-31';
}

function getFamilyDetail(profile: ApplicantProfileV2): string {
  const marriageStatus = knownValue(profile.family.marriageStatus);
  if (marriageStatus === 'single') {
    return '현재 혼인 상태가 미혼으로 저장되어 있어요. 공고별 대상 조건을 확인해 주세요.';
  }
  const years = knownValue(profile.family.marriageYears);
  const children = knownValue(profile.family.childrenCount);
  return `혼인 ${years ?? 0}년 · 자녀 ${children ?? 0}명 정보가 저장되어 있어요.`;
}
