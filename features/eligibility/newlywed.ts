import { knownValue, PROFILE_BUNDLES, type ApplicantProfileV2, type ProfileQuestionBundleId } from '../profile/domain.ts';
import type { DiscoveryListing } from '../discovery/types.ts';

export type NewlywedEligibilityStatus = 'likely_eligible' | 'needs_information' | 'needs_listing_confirmation' | 'not_eligible' | 'unsupported';
export type NewlywedCheckStatus = 'met' | 'needs_information' | 'needs_listing_confirmation' | 'not_met' | 'unsupported';
export const NEWLYWED_RULE_METADATA = {
  ruleSetVersion: 'KR-NEWLYWED-PRIVATE-2026.07.08-v1',
  effectiveDate: '2026-07-08',
  reviewedAt: '2026-09-10',
  supportedScope: '민영주택 전용 85㎡ 이하 신혼부부 특별공급의 공고 전 기본조건 분석',
  unsupportedScopes: ['국민주택·공공분양·임대', '신생아 특별공급', '전용 85㎡ 초과', '과거 공고의 경과규정 자동 판정'],
  sources: [
    { id: 'rule-41', title: '주택공급에 관한 규칙 제41조', url: 'https://law.go.kr/lsLawLinkInfo.do?lsJoLnkSeq=1000808030&chrClsCd=010202', effectiveDate: '2026-06-15' },
    { id: 'rule-48', title: '주택공급에 관한 규칙 제48조·별표2', url: 'https://law.go.kr/LSW/lsLinkCommonInfo.do?lspttninfSeq=123621', effectiveDate: '2026-06-15' },
    { id: 'rule-exceptions', title: '주택공급에 관한 규칙 제4조·제53조·제54조·제55조·제55조의3', url: 'https://www.law.go.kr/LSW/lsInfoP.do?lsId=008243', effectiveDate: '2026-06-15' },
    { id: 'newlywed-guideline', title: '신생아 및 신혼부부 주택 특별공급 운용지침', url: 'https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000282334', effectiveDate: '2026-07-08' },
  ],
} as const;
export const NEWLYWED_DISCLAIMER = '현재 입력한 정보와 적용 가능한 규정에 따른 참고 결과예요. 최종 신청 가능 여부는 모집공고문과 청약Home에서 확인해 주세요.';
export type NewlywedSourceId = typeof NEWLYWED_RULE_METADATA.sources[number]['id'];
export type NewlywedCheck = {
  key: string; label: string; status: NewlywedCheckStatus; reason: string;
  requiredBundle?: ProfileQuestionBundleId; sourceRefs: NewlywedSourceId[];
};
/** Only structured official data. A special-supply date or a title is not evidence of newlywed allocation. */
export type NewlywedListingContext = {
  supplyType?: 'private-housing' | 'national-housing' | 'public-sale' | 'rental';
  housingType?: 'apartment' | 'other';
  exclusiveAreaM2?: number;
  newlywedSupplyCount?: number;
  announcementDate?: string;
};
export type NewlywedAction = { id: string; label: string; bundleId?: ProfileQuestionBundleId; route?: '/newlywed' | '/discovery' };
export type NewlywedEligibilityResult = {
  status: NewlywedEligibilityStatus; title: string; summary: string;
  checks: NewlywedCheck[]; missingBundles: ProfileQuestionBundleId[]; actions: NewlywedAction[];
  metadata: typeof NEWLYWED_RULE_METADATA; disclaimer: string;
};

export const NEWLYWED_STATUS_LABELS: Record<NewlywedEligibilityStatus, string> = {
  likely_eligible: '기본조건을 확인했어요', needs_information: '정보를 더 확인해 주세요',
  needs_listing_confirmation: '공고 확인이 필요해요', not_eligible: '현재 맞지 않는 기본조건이 있어요', unsupported: '이번 분석에서 지원하지 않는 유형이에요',
};
export const NEWLYWED_CHECK_LABELS: Record<NewlywedCheckStatus, string> = {
  met: '입력 기준 확인', needs_information: '정보 필요', needs_listing_confirmation: '공고 확인', not_met: '조건 불충족', unsupported: '지원 범위 밖',
};
const validNumber = (value: number | undefined) => value !== undefined && Number.isFinite(value) && value >= 0 ? value : undefined;
function check(key: string, label: string, status: NewlywedCheckStatus, reason: string, requiredBundle?: ProfileQuestionBundleId, sourceRefs: NewlywedSourceId[] = ['rule-41']): NewlywedCheck {
  return { key, label, status, reason, requiredBundle, sourceRefs };
}

export function evaluateNewlywedEligibility(profile: ApplicantProfileV2, context?: NewlywedListingContext): NewlywedEligibilityResult {
  const area = validNumber(context?.exclusiveAreaM2);
  if ((context?.supplyType && context.supplyType !== 'private-housing') || context?.housingType === 'other' || (area !== undefined && area > 85)) {
    return result([check('supported_scope', '지원 범위', 'unsupported', '민영주택 전용 85㎡ 이하 신혼부부 특별공급만 분석해요. 선택한 유형은 지원 범위 밖이에요.')]);
  }
  // Do not run current-law failures against historical or invalid announcement dates.
  if (context?.announcementDate && (!validDate(context.announcementDate) || context.announcementDate < NEWLYWED_RULE_METADATA.effectiveDate)) {
    return result([check('rule_date', '공고 적용 규정', 'needs_listing_confirmation', '이 공고는 날짜 또는 경과규정 확인이 필요해 현재 규정만으로 판정하지 않아요.', undefined, ['rule-41', 'newlywed-guideline'])]);
  }
  const marriage = knownValue(profile.family.marriageStatus);
  const years = validNumber(knownValue(profile.family.marriageYears));
  const owns = knownValue(profile.housing.currentOwnership);
  const householdOwns = knownValue(profile.housing.householdHasHome);
  const restriction = knownValue(profile.housing.hasSpecialSupplyRestriction);
  const account = knownValue(profile.subscriptionAccount.hasAccount);
  const months = validNumber(knownValue(profile.subscriptionAccount.accountMonths));
  const children = validNumber(knownValue(profile.family.childrenCount));
  const income = knownValue(profile.income.annualRange);
  const assetsKnown = profile.assets.realEstate.status !== 'unknown';
  const checks: NewlywedCheck[] = [
    check('supported_scope', '지원 범위', context && (!context.supplyType || !context.housingType || area === undefined) ? 'needs_listing_confirmation' : 'met',
      context ? '선택 공고의 공식 공급유형과 신청 주택형 면적을 확인해 주세요.' : '민영주택 전용 85㎡ 이하의 공통 기본조건을 먼저 살펴봐요.'),
    check('marriage_status', '현재 혼인 상태', marriage === undefined ? 'needs_information' : marriage === 'married' ? 'met' : 'not_met',
      marriage === undefined ? '혼인 상태를 알려주면 신혼부부 경로를 확인할 수 있어요.' : marriage === 'married' ? '입력한 정보에서 현재 혼인 중이에요.' : '현재 미혼으로 입력되어 혼인 중인 신혼부부 기본조건과 맞지 않아요. 예비부부 지원은 별도 유형을 확인해 주세요.', marriage === undefined ? 'FAMILY' : undefined),
    check('marriage_period', '혼인기간 7년 이내', years === undefined ? 'needs_information' : years > 7 ? 'not_met' : years === 7 ? 'needs_listing_confirmation' : 'met',
      years === undefined ? '혼인기간을 알려주면 더 정확히 볼 수 있어요.' : years > 7 ? '입력한 혼인기간이 7년을 초과해 신혼부부 기본조건과 맞지 않아요.' : years === 7 ? '7년으로 입력되어 경계일 확인이 필요해요. 공고일과 혼인신고일을 비교하고 동일인 재혼기간도 합산해 주세요.' : '입력한 혼인기간은 7년 미만이에요. 공고일 기준 혼인신고일과 동일인 재혼 합산기간을 최종 확인해 주세요.', years === undefined ? 'FAMILY' : undefined),
    check('household_housing', '무주택 세대구성원', owns === 'owns-home' || householdOwns === true ? 'needs_listing_confirmation' : owns === undefined || householdOwns === undefined ? 'needs_information' : 'met',
      owns === 'owns-home' || householdOwns === true ? '주택 보유가 입력되어 일반 무주택 조건과 차이가 있어요. 주택소유 예외와 출산가구의 재공급·기존주택 처분 특례를 확인해야 하므로 탈락으로 단정하지 않아요.' : owns === undefined || householdOwns === undefined ? '본인과 배우자를 포함한 세대원의 현재 주택 보유 여부를 알려주세요.' : '입력한 정보에서 본인과 세대원이 현재 무주택이에요. 법정 세대 범위와 분양권 등은 공고에서 최종 확인해 주세요.', owns === undefined || householdOwns === undefined ? 'HOUSING_HISTORY' : undefined, ['rule-41', 'rule-exceptions']),
    check('subscription_period', '청약통장 보유·가입기간', account === false ? 'not_met' : account === undefined || months === undefined ? 'needs_information' : months < 6 ? 'not_met' : 'met',
      account === false ? '청약통장이 없다고 입력되어 기본 입주자저축 조건과 맞지 않아요.' : account === undefined || months === undefined ? '청약통장 보유 여부와 가입 개월 수를 알려주세요.' : months < 6 ? '입력한 가입기간이 6개월 미만이에요. 공고일 기준으로 가입기간을 다시 확인해 주세요.' : '입력한 통장 가입기간이 6개월 이상이에요. 통장 종류·인정 가입일은 공고에서 최종 확인해 주세요.', account !== false && (account === undefined || months === undefined) ? 'SUBSCRIPTION_ACCOUNT' : undefined, ['rule-48']),
    check('subscription_deposit', '지역·면적별 예치금', 'needs_listing_confirmation', '월 납입액으로 예치금 잔액을 추정하지 않아요. 신청 주택형·거주지역에 따른 예치기준과 통장 종류를 확인해 주세요.', undefined, ['rule-48']),
    check('special_supply_restriction', '특별공급 제한·특례', restriction === undefined ? 'needs_information' : restriction ? 'needs_listing_confirmation' : 'met',
      restriction === undefined ? '청약Home에서 특별공급 횟수 제한 이력을 확인해 주세요.' : restriction ? '제한 이력이 입력되어 있어요. 본인·배우자의 혼인 전 당첨 및 출산가구 특례 적용 여부를 확인해야 해요.' : '입력한 정보에서 특별공급 횟수 제한 이력은 없어요. 재당첨·부적격 제한은 공고와 청약Home에서 별도 확인해 주세요.', restriction === undefined ? 'HOUSING_HISTORY' : undefined, ['rule-exceptions']),
    check('income', '가구 소득 기준', income === undefined ? 'needs_information' : 'needs_listing_confirmation',
      income === undefined ? '가구 소득 범위를 알려주세요. 정확한 기준은 공고에서 확인해요.' : '입력한 연소득 범위만으로 월평균 소득기준 충족을 확정하지 않아요. 전년도 표·가구원수·배우자 소득과 적용 경로를 확인해 주세요.', income === undefined ? 'INCOME' : undefined, ['rule-41', 'newlywed-guideline']),
    check('real_estate', '부동산 기준 경로', assetsKnown ? 'needs_listing_confirmation' : 'needs_information',
      !assetsKnown ? '부동산 정보를 추가하면 소득초과 시 확인할 자산 경로를 준비할 수 있어요. 자산 미입력은 탈락 사유가 아니에요.' : '소득기준을 초과한 경우의 부동산 기준 경로를 확인해 주세요. 입력 금액 범위는 법정 세대 부동산 산정액과 같지 않으며 모든 가구에 독립적으로 적용되는 탈락 기준이 아니에요.', assetsKnown ? undefined : 'ASSETS', ['rule-41', 'newlywed-guideline']),
    check('children_priority', '자녀·출산과 공급순위', children === undefined ? 'needs_information' : 'needs_listing_confirmation',
      children === undefined ? '자녀 정보를 알려주면 확인할 공급순위를 안내할 수 있어요.' : children > 0 ? '자녀 정보가 있어요. 현재 배우자와의 관계·혼인 중 출산·임신·입양 증빙이 없어 순위를 확정하지 않아요. 신생아 특별공급은 별도 유형이에요.' : '자녀가 없다고 입력해도 신혼부부 기본자격에서 제외하지 않아요. 임신·입양 여부와 공급순위는 공고에서 확인해 주세요.', children === undefined ? 'FAMILY' : undefined, ['rule-41', 'newlywed-guideline']),
    check('residence', '거주지역·신청 제한', profile.residence.currentRegion.trim() ? 'needs_listing_confirmation' : 'needs_information',
      profile.residence.currentRegion.trim() ? '거주지역은 입력됐어요. 관심지역을 거주지로 간주하지 않으며 공고일 기준 거주기간·우선공급·재당첨 제한을 별도로 확인해야 해요.' : '현재 거주지역을 알려주면 지역 조건 확인을 준비할 수 있어요.', profile.residence.currentRegion.trim() ? undefined : 'RESIDENCE', ['rule-exceptions']),
    check('newlywed_allocation', '공고의 신혼부부 공급 여부', validNumber(context?.newlywedSupplyCount) === 0 ? 'unsupported' : validNumber(context?.newlywedSupplyCount) !== undefined ? 'met' : 'needs_listing_confirmation',
      validNumber(context?.newlywedSupplyCount) === 0 ? '공식 신혼부부 공급 물량이 없는 주택형이에요.' : validNumber(context?.newlywedSupplyCount) !== undefined ? '공식 구조화 데이터에서 신혼부부 공급 물량이 확인됐어요.' : '특별공급 일정이 있다는 것만으로 신혼부부 대상이라고 확정하지 않아요. 공고문에서 해당 물량을 확인해 주세요.'),
  ];
  return result(checks);
}

function result(checks: NewlywedCheck[]): NewlywedEligibilityResult {
  const status: NewlywedEligibilityStatus = checks.some(c => c.status === 'unsupported') ? 'unsupported'
    : checks.some(c => c.status === 'not_met') ? 'not_eligible'
    : checks.some(c => c.status === 'needs_information') ? 'needs_information'
    : checks.some(c => c.status === 'needs_listing_confirmation') ? 'needs_listing_confirmation' : 'likely_eligible';
  const missingBundles = [...new Set(checks.filter(c => c.status === 'needs_information').flatMap(c => c.requiredBundle ? [c.requiredBundle] : []))];
  const actions: NewlywedAction[] = missingBundles.map(bundleId => ({ id: `complete-${bundleId}`, label: `${PROFILE_BUNDLES.find(b => b.id === bundleId)!.title} 추가`, bundleId }));
  actions.push({ id: 'related-listings', label: '관련 공고·일정 보기', route: '/newlywed' });
  return { status, title: NEWLYWED_STATUS_LABELS[status], summary: status === 'unsupported' ? '지원 범위 밖이라는 뜻이며 개인의 신청 자격 탈락을 뜻하지 않아요.' : status === 'not_eligible' ? '입력한 정보에서 맞지 않는 기본조건을 확인했어요. 정보가 달라졌다면 수정하고 공고 기준으로 다시 확인해 주세요.' : '입력된 조건을 먼저 확인했어요. 미확인 정보는 탈락으로 보지 않으며, 최종 신청 조건은 공고에서 확인해요.', checks, missingBundles, actions, metadata: NEWLYWED_RULE_METADATA, disclaimer: NEWLYWED_DISCLAIMER };
}
function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function newlywedProfileRoute(bundle: ProfileQuestionBundleId): string {
  return `/profile?bundle=${bundle}&returnTo=/eligibility/newlywed`;
}
/** Adapter deliberately excludes names, tags and specialSupply dates. Current provider lacks allocation/area. */
export function buildNewlywedListingContext(listing: DiscoveryListing): NewlywedListingContext {
  if (listing.isDemo || listing.sourceType !== 'applyhome-apt') return {};
  return {
    supplyType: listing.supplyType === '민간분양' ? 'private-housing' : listing.supplyType === '공공분양' ? 'public-sale' : listing.supplyType === '공공지원 민간임대' ? 'rental' : undefined,
    housingType: listing.housingType === '아파트' ? 'apartment' : 'other',
    announcementDate: listing.announcementDate ?? undefined,
  };
}
