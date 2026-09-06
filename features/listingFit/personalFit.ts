import {
  evaluateFirstHomeEligibility,
  FIRST_HOME_RULE_METADATA,
  type FirstHomeEligibilityResult,
  type FirstHomeListingContext,
} from '../eligibility/firstHome.ts';
import { normalizeDiscoveryRegion } from '../discovery/regions.ts';
import type { DiscoveryListing } from '../discovery/types.ts';
import {
  knownValue,
  type ApplicantProfileV2,
  type ProfileQuestionBundleId,
} from '../profile/domain.ts';

export type ListingPersonalFitStatus =
  | 'good_fit'
  | 'needs_information'
  | 'needs_listing_confirmation'
  | 'limited_fit';

export type ListingPersonalFitCheckStatus =
  | 'matched'
  | 'needs_information'
  | 'needs_listing_confirmation'
  | 'limited';

export type ListingPersonalFitCheckKey =
  | 'preferred_region'
  | 'residence_region'
  | 'recruitment_timing'
  | 'subscription_account'
  | 'housing_status'
  | 'first_home_precheck'
  | 'listing_conditions';

export type ListingPersonalFitSource =
  | 'profile'
  | 'listing'
  | 'first-home-rule'
  | 'listing-confirmation-required';

export type ListingPersonalFitCheck = {
  key: ListingPersonalFitCheckKey;
  label: string;
  status: ListingPersonalFitCheckStatus;
  reason: string;
  requiredBundle?: ProfileQuestionBundleId;
  sources: ListingPersonalFitSource[];
};

export type ListingPersonalFitAction = {
  id: 'complete_profile' | 'open_announcement' | 'review_first_home';
  label: string;
  bundleId?: ProfileQuestionBundleId;
  route?: '/eligibility/first-home';
};

export type ListingPersonalFitMetadata = {
  ruleSetVersion: string;
  calculationMode: 'live-current-profile';
  listingId: string;
  listingSourceType: DiscoveryListing['sourceType'];
  listingFieldsUsed: readonly string[];
  profileFieldsUsed: readonly string[];
  firstHomeRuleSetVersion: string;
};

export type ListingPersonalFitResult = {
  status: ListingPersonalFitStatus;
  title: string;
  summary: string;
  checks: ListingPersonalFitCheck[];
  missingBundles: ProfileQuestionBundleId[];
  actions: ListingPersonalFitAction[];
  metadata: ListingPersonalFitMetadata;
  disclaimer: string;
};

export const LISTING_PERSONAL_FIT_RULE_SET_VERSION = 'KR-LISTING-PERSONAL-FIT-2026.09.06-v1';

export const LISTING_PERSONAL_FIT_DISCLAIMER =
  '현재 입력된 정보와 공고 데이터를 바탕으로 한 참고 분석이에요. 최종 신청 자격은 모집공고문과 공식 기관에서 확인해 주세요.';

const LISTING_FIELDS_USED = [
  'sourceType',
  'region',
  'supplyType',
  'housingType',
  'announcementDate',
  'recruitmentStatus',
  'recruitmentStartDate',
  'recruitmentEndDate',
  'announcementUrl',
] as const;

const PROFILE_FIELDS_USED = [
  'residence.currentRegion',
  'preferences.regions',
  'subscriptionAccount.hasAccount',
  'subscriptionAccount.accountMonths',
  'housing.currentOwnership',
  'housing.previousOwnership',
  'housing.householdHasHome',
  'housing.householdDisqualifyingPreviousOwnership',
  'housing.hasSpecialSupplyRestriction',
  'household.memberCount',
  'family.marriageStatus',
  'family.childrenCount',
  'income.annualRange',
  'income.workOrBusinessIncomeEligible',
  'income.incomeTaxPaymentYears',
  'assets.realEstate',
] as const;

export function evaluateListingPersonalFit(
  listing: DiscoveryListing,
  profile: ApplicantProfileV2,
): ListingPersonalFitResult {
  const firstHomeResult = evaluateFirstHomeEligibility(profile, toFirstHomeListingContext(listing));
  const checks: ListingPersonalFitCheck[] = [
    checkPreferredRegion(listing, profile),
    checkResidenceRegion(listing, profile),
    checkRecruitmentTiming(listing),
    checkSubscriptionAccount(profile),
    checkHousingStatus(profile),
    checkFirstHomePrecheck(listing, firstHomeResult),
    checkListingConditions(listing),
  ];
  const missingBundles = uniqueBundles(checks);
  const status = summarizeStatus(checks, missingBundles);

  return {
    status,
    title: statusTitle(status),
    summary: statusSummary(status, checks),
    checks,
    missingBundles,
    actions: buildActions(listing, missingBundles),
    metadata: {
      ruleSetVersion: LISTING_PERSONAL_FIT_RULE_SET_VERSION,
      calculationMode: 'live-current-profile',
      listingId: listing.id,
      listingSourceType: listing.sourceType,
      listingFieldsUsed: LISTING_FIELDS_USED,
      profileFieldsUsed: PROFILE_FIELDS_USED,
      firstHomeRuleSetVersion: FIRST_HOME_RULE_METADATA.ruleSetVersion,
    },
    disclaimer: LISTING_PERSONAL_FIT_DISCLAIMER,
  };
}

function checkPreferredRegion(
  listing: DiscoveryListing,
  profile: ApplicantProfileV2,
): ListingPersonalFitCheck {
  const preferred = profile.preferences.regions
    .map(normalizeDiscoveryRegion)
    .filter((region): region is NonNullable<typeof region> => region !== null);
  if (preferred.length === 0) {
    return check(
      'preferred_region',
      '관심지역',
      'needs_information',
      '관심지역을 알려주면 이 공고가 평소 보고 싶은 지역인지 확인할 수 있어요.',
      ['profile'],
      'PREFERENCES',
    );
  }
  if (preferred.includes(listing.region)) {
    return check(
      'preferred_region',
      '관심지역',
      'matched',
      `${listing.region}은 입력한 관심지역에 포함돼요.`,
      ['profile', 'listing'],
    );
  }
  return check(
    'preferred_region',
    '관심지역',
    'limited',
    `${listing.region}은 현재 선택한 관심지역과 달라요. 다른 지역 공고도 함께 보는 경우라면 계속 확인해 보세요.`,
    ['profile', 'listing'],
  );
}

function checkResidenceRegion(
  listing: DiscoveryListing,
  profile: ApplicantProfileV2,
): ListingPersonalFitCheck {
  const residence = normalizeDiscoveryRegion(profile.residence.currentRegion);
  if (!residence) {
    return check(
      'residence_region',
      '현재 거주지역',
      'needs_information',
      '현재 거주지역을 알려주면 지역 관련 확인사항을 더 정확히 안내할 수 있어요.',
      ['profile'],
      'RESIDENCE',
    );
  }
  if (residence === listing.region) {
    return check(
      'residence_region',
      '현재 거주지역',
      'matched',
      `현재 거주지역과 공고 지역이 모두 ${listing.region}이에요.`,
      ['profile', 'listing'],
    );
  }
  return check(
    'residence_region',
    '지역 우선공급',
    'needs_listing_confirmation',
    `현재 거주지역과 공고 지역이 달라요. 거주기간과 지역 우선공급 기준은 모집공고문에서 확인해야 해요.`,
    ['profile', 'listing', 'listing-confirmation-required'],
  );
}

function checkRecruitmentTiming(listing: DiscoveryListing): ListingPersonalFitCheck {
  switch (listing.recruitmentStatus) {
    case 'open':
      return check(
        'recruitment_timing',
        '접수 일정',
        'matched',
        '현재 접수 중인 공고예요. 정확한 신청 시간과 방법은 모집공고문을 확인해 주세요.',
        ['listing', 'listing-confirmation-required'],
      );
    case 'upcoming':
      return check(
        'recruitment_timing',
        '접수 일정',
        'matched',
        '접수 예정 공고라 필요한 정보와 서류를 미리 확인할 수 있어요.',
        ['listing'],
      );
    case 'closed':
      return check(
        'recruitment_timing',
        '접수 일정',
        'limited',
        '현재 데이터 기준으로 접수가 끝난 공고예요. 후속 일정은 원문에서 확인해 주세요.',
        ['listing', 'listing-confirmation-required'],
      );
    default:
      return check(
        'recruitment_timing',
        '접수 일정',
        'needs_listing_confirmation',
        '접수 기간이 충분히 확인되지 않아 모집공고문에서 일정을 확인해야 해요.',
        ['listing', 'listing-confirmation-required'],
      );
  }
}

function checkSubscriptionAccount(profile: ApplicantProfileV2): ListingPersonalFitCheck {
  const hasAccount = knownValue(profile.subscriptionAccount.hasAccount);
  const accountMonths = knownValue(profile.subscriptionAccount.accountMonths);
  if (hasAccount === undefined) {
    return check(
      'subscription_account',
      '청약통장',
      'needs_information',
      '청약통장 보유 여부를 알려주면 공고에서 확인할 조건을 더 구체적으로 정리할 수 있어요.',
      ['profile'],
      'SUBSCRIPTION_ACCOUNT',
    );
  }
  if (!hasAccount) {
    return check(
      'subscription_account',
      '청약통장',
      'needs_listing_confirmation',
      '청약통장이 없는 상태로 입력돼 있어요. 이 공고에서 통장이 필요한지는 모집공고문을 확인해야 해요.',
      ['profile', 'listing-confirmation-required'],
    );
  }
  if (accountMonths === undefined) {
    return check(
      'subscription_account',
      '청약통장 가입기간',
      'needs_information',
      '통장 보유는 확인됐어요. 가입기간을 추가하면 공고에서 비교할 항목을 더 정확히 안내할 수 있어요.',
      ['profile'],
      'SUBSCRIPTION_ACCOUNT',
    );
  }
  return check(
    'subscription_account',
    '청약통장 가입기간',
    'needs_listing_confirmation',
    `청약통장 가입기간은 ${Math.max(0, Math.floor(accountMonths))}개월로 확인돼요. 필요한 기간·예치금·순위는 공고문에서 확인해야 해요.`,
    ['profile', 'listing-confirmation-required'],
  );
}

function checkHousingStatus(profile: ApplicantProfileV2): ListingPersonalFitCheck {
  const ownership = knownValue(profile.housing.currentOwnership);
  if (ownership === undefined) {
    return check(
      'housing_status',
      '현재 주택 상태',
      'needs_information',
      '현재 주택 보유 상태를 알려주면 공급 유형별 확인사항을 더 정확히 정리할 수 있어요.',
      ['profile'],
      'HOUSING_HISTORY',
    );
  }
  if (ownership === 'no-home') {
    return check(
      'housing_status',
      '현재 주택 상태',
      'matched',
      '입력한 정보에서는 현재 무주택 상태로 확인돼요. 세대 전체 이력과 예외는 공고문 기준으로 확인해야 해요.',
      ['profile', 'listing-confirmation-required'],
    );
  }
  return check(
    'housing_status',
    '현재 주택 상태',
    'needs_listing_confirmation',
    '현재 주택 보유 상태로 입력돼 있어요. 이 공고의 공급 유형에서 신청 가능한지는 모집공고문을 확인해야 해요.',
    ['profile', 'listing-confirmation-required'],
  );
}

function checkFirstHomePrecheck(
  listing: DiscoveryListing,
  result: FirstHomeEligibilityResult,
): ListingPersonalFitCheck {
  if (listing.supplyType !== '민간분양') {
    return check(
      'first_home_precheck',
      '생애최초 연결',
      'needs_listing_confirmation',
      '현재 공고 데이터만으로 생애최초 V1의 민영주택 분석 대상인지 확정할 수 없어요.',
      ['listing', 'first-home-rule', 'listing-confirmation-required'],
    );
  }
  if (result.status === 'needs_information') {
    return check(
      'first_home_precheck',
      '생애최초 기본조건',
      'needs_information',
      '민간분양 공고예요. 생애최초 공고 전 기본조건을 더 보려면 프로필 정보가 필요해요.',
      ['profile', 'listing', 'first-home-rule'],
      result.missingBundles[0],
    );
  }
  if (result.status === 'not_eligible') {
    return check(
      'first_home_precheck',
      '생애최초 기본조건',
      'needs_listing_confirmation',
      '생애최초 기본조건 분석에는 현재 입력과 맞지 않는 항목이 있어요. 이 공고의 다른 공급 유형과 세부 조건은 원문에서 확인해 주세요.',
      ['profile', 'listing', 'first-home-rule', 'listing-confirmation-required'],
    );
  }
  return check(
    'first_home_precheck',
    '생애최초 기본조건',
    'needs_listing_confirmation',
    '민간분양 생애최초의 공고 전 기본조건을 연결했어요. 이 공고의 생애최초 공급 여부·전용면적·소득 기준은 원문 확인이 필요해요.',
    ['profile', 'listing', 'first-home-rule', 'listing-confirmation-required'],
  );
}

function checkListingConditions(listing: DiscoveryListing): ListingPersonalFitCheck {
  const original = listing.announcementUrl
    ? '모집공고 원문 링크가 있어 바로 확인할 수 있어요.'
    : '모집공고 원문 링크도 현재 데이터에 없어 공식 기관에서 공고를 찾아 확인해야 해요.';
  return check(
    'listing_conditions',
    '공고별 세부조건',
    'needs_listing_confirmation',
    `전용면적·특별공급 세부유형·소득·자산·지역 우선공급 기준은 현재 공고 데이터에 없어요. ${original}`,
    ['listing', 'listing-confirmation-required'],
  );
}

function toFirstHomeListingContext(listing: DiscoveryListing): FirstHomeListingContext | undefined {
  if (listing.supplyType === '민간분양') {
    return { supplyType: 'private-housing', announcementDate: listing.announcementDate ?? undefined };
  }
  if (listing.supplyType === '공공분양') {
    return { supplyType: 'public-sale', announcementDate: listing.announcementDate ?? undefined };
  }
  return listing.announcementDate ? { announcementDate: listing.announcementDate } : undefined;
}

function summarizeStatus(
  checks: readonly ListingPersonalFitCheck[],
  missingBundles: readonly ProfileQuestionBundleId[],
): ListingPersonalFitStatus {
  if (checks.some((item) => item.status === 'limited')) return 'limited_fit';
  const matched = checks.filter((item) => item.status === 'matched').length;
  if (matched >= 2) return 'good_fit';
  if (missingBundles.length > 0) return 'needs_information';
  return 'needs_listing_confirmation';
}

function statusTitle(status: ListingPersonalFitStatus): string {
  if (status === 'good_fit') return '잘 맞는 부분이 있어요';
  if (status === 'needs_information') return '정보를 더 채우면 선명해져요';
  if (status === 'limited_fit') return '현재 조건과는 제한적이에요';
  return '공고문 확인이 더 필요해요';
}

function statusSummary(
  status: ListingPersonalFitStatus,
  checks: readonly ListingPersonalFitCheck[],
): string {
  const matchedLabels = checks
    .filter((item) => item.status === 'matched')
    .map((item) => item.label)
    .slice(0, 2);
  if (status === 'good_fit') {
    return `${matchedLabels.join('·')}에서 현재 입력한 정보와 맞아요. 세부 신청조건은 모집공고문에서 확인해야 해요.`;
  }
  if (status === 'needs_information') {
    return '아직 내 정보가 충분하지 않아요. 한 가지 정보를 추가하면 이 공고와의 관련성을 더 정확히 볼 수 있어요.';
  }
  if (status === 'limited_fit') {
    return '관심지역이나 접수 일정처럼 현재 입력과 맞지 않는 부분이 있어요. 제한 사유와 공식 공고를 함께 확인해 주세요.';
  }
  return '현재 확인된 정보만으로 신청조건을 단정할 수 없어요. 공고별 세부기준을 확인해 주세요.';
}

function buildActions(
  listing: DiscoveryListing,
  missingBundles: readonly ProfileQuestionBundleId[],
): ListingPersonalFitAction[] {
  const actions: ListingPersonalFitAction[] = [];
  const bundleId = missingBundles[0];
  if (bundleId) actions.push({ id: 'complete_profile', label: '부족한 정보 채우기', bundleId });
  if (listing.announcementUrl) actions.push({ id: 'open_announcement', label: '모집공고 원문 확인하기' });
  if (listing.supplyType === '민간분양') {
    actions.push({ id: 'review_first_home', label: '생애최초 기본조건 다시 보기', route: '/eligibility/first-home' });
  }
  return actions;
}

function uniqueBundles(checks: readonly ListingPersonalFitCheck[]): ProfileQuestionBundleId[] {
  return [...new Set(checks.map((item) => item.requiredBundle).filter(isBundleId))];
}

function isBundleId(value: ProfileQuestionBundleId | undefined): value is ProfileQuestionBundleId {
  return value !== undefined;
}

function check(
  key: ListingPersonalFitCheckKey,
  label: string,
  status: ListingPersonalFitCheckStatus,
  reason: string,
  sources: ListingPersonalFitSource[],
  requiredBundle?: ProfileQuestionBundleId,
): ListingPersonalFitCheck {
  return { key, label, status, reason, sources, requiredBundle };
}
