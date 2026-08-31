import {
  getFeatureProfileRequirements,
  knownValue,
  type ApplicantProfileV2,
  type ProfileQuestionBundleId,
} from '../profile/domain.ts';

export type FirstHomeEligibilityStatus =
  | 'likely_eligible'
  | 'needs_information'
  | 'needs_listing_confirmation'
  | 'not_eligible';

export type EligibilityCheckStatus =
  | 'met'
  | 'needs_information'
  | 'needs_listing_confirmation'
  | 'not_met';

export type FirstHomeSourceRef = {
  id: 'housing-supply-rule-43' | 'housing-supply-rules-55' | 'first-home-operation-guideline';
  title: string;
  url: string;
  effectiveDate: string;
};

export type FirstHomeEligibilityCheck = {
  id:
    | 'supported_scope'
    | 'lifetime_home_history'
    | 'special_supply_history'
    | 'subscription_first_priority'
    | 'income_tax_history'
    | 'marriage_or_child_path'
    | 'income_and_real_estate'
    | 'single_household_area';
  label: string;
  status: EligibilityCheckStatus;
  reason: string;
  requiredBundle?: ProfileQuestionBundleId;
  sourceRefs: FirstHomeSourceRef['id'][];
};

export type FirstHomeListingContext = {
  supplyType?: 'private-housing' | 'national-housing' | 'public-sale' | 'public-rental';
  exclusiveAreaM2?: number;
  subscriptionFirstPriorityConfirmed?: boolean;
  incomeAndRealEstateCriteriaConfirmed?: boolean;
  announcementDate?: string;
};

export type EligibilityAction = {
  id: string;
  label: string;
  bundleId?: ProfileQuestionBundleId;
  route?: '/discovery' | '/preparation';
};

export type FirstHomeRuleMetadata = {
  ruleSetVersion: string;
  effectiveDate: string;
  supportedScope: string;
  unsupportedScopes: string[];
  sources: FirstHomeSourceRef[];
};

export type FirstHomeEligibilityResult = {
  status: FirstHomeEligibilityStatus;
  title: string;
  summary: string;
  checks: FirstHomeEligibilityCheck[];
  actions: EligibilityAction[];
  missingBundles: ProfileQuestionBundleId[];
  metadata: FirstHomeRuleMetadata;
};

export const FIRST_HOME_RULE_METADATA: FirstHomeRuleMetadata = {
  ruleSetVersion: 'KR-FIRST-HOME-PRIVATE-2026.07.08-v1',
  effectiveDate: '2026-07-08',
  supportedScope:
    '민영주택 전용 85㎡ 이하 생애최초 특별공급의 공고 전 기본조건 분석. 공고 컨텍스트가 있으면 확인값만 반영.',
  unsupportedScopes: [
    '국민주택',
    '공공분양',
    '공공임대',
    '지역별 우선공급과 거주기간',
    '청약통장 1순위의 지역·규제지역·예치금 세부 계산',
    '전년도 도시근로자 가구당 월평균소득 금액 계산',
    '부동산 가액 산정과 출산가구 완화 계산',
  ],
  sources: [
    {
      id: 'housing-supply-rule-43',
      title: '주택공급에 관한 규칙 제43조(생애최초 주택 구입자 특별공급)',
      url: 'https://www.law.go.kr/LSW/lsInfoP.do?lsId=008243',
      effectiveDate: '2026-06-15',
    },
    {
      id: 'first-home-operation-guideline',
      title: '생애최초 주택 특별공급 운용지침',
      url: 'https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000282432',
      effectiveDate: '2026-07-08',
    },
    {
      id: 'housing-supply-rules-55',
      title: '주택공급에 관한 규칙 제55조·제55조의3(특별공급 횟수 제한과 특례)',
      url: 'https://www.law.go.kr/LSW/lsInfoP.do?lsId=008243',
      effectiveDate: '2026-06-15',
    },
  ],
};

const RULE = 'housing-supply-rule-43' as const;
const GUIDELINE = 'first-home-operation-guideline' as const;
const EXCEPTIONS = 'housing-supply-rules-55' as const;

export function evaluateFirstHomeEligibility(
  profile: ApplicantProfileV2,
  listingContext?: FirstHomeListingContext,
): FirstHomeEligibilityResult {
  const checks: FirstHomeEligibilityCheck[] = [
    checkSupportedScope(listingContext),
    checkLifetimeHomeHistory(profile),
    checkSpecialSupplyHistory(profile),
    checkSubscription(profile, listingContext),
    checkIncomeTaxHistory(profile),
    checkMarriageOrChildPath(profile),
    checkIncomeAndRealEstate(profile, listingContext),
    checkSingleHouseholdArea(profile, listingContext),
  ];

  const status = summarizeStatus(checks);
  const missingBundles = getFeatureProfileRequirements('first-home', profile).missing;

  return {
    status,
    title: statusTitle(status),
    summary: statusSummary(status),
    checks,
    actions: createActions(checks, missingBundles, status),
    missingBundles,
    metadata: FIRST_HOME_RULE_METADATA,
  };
}

function checkSupportedScope(context?: FirstHomeListingContext): FirstHomeEligibilityCheck {
  if (context?.supplyType && context.supplyType !== 'private-housing') {
    return check(
      'supported_scope',
      '지원 범위',
      'needs_listing_confirmation',
      '선택한 공고는 현재 V1의 민영주택 범위가 아니어서 상세 공고 확인이 필요해요.',
      undefined,
      [RULE, GUIDELINE],
    );
  }
  return check(
    'supported_scope',
    '지원 범위',
    'met',
    '민영주택 생애최초 특별공급의 공고 전 기본조건 범위로 분석해요.',
    undefined,
    [RULE, GUIDELINE],
  );
}

function checkLifetimeHomeHistory(profile: ApplicantProfileV2): FirstHomeEligibilityCheck {
  const current = knownValue(profile.housing.currentOwnership);
  const previous = knownValue(profile.housing.previousOwnership);
  const householdCurrent = knownValue(profile.housing.householdHasHome);
  const householdPrevious = knownValue(profile.housing.householdDisqualifyingPreviousOwnership);

  if (
    current === 'owns-home' ||
    previous === true ||
    householdCurrent === true ||
    householdPrevious === true
  ) {
    return check(
      'lifetime_home_history',
      '세대 전체 주택 소유 이력',
      'not_met',
      '본인 또는 현재 세대에서 주택 소유 이력이 확인돼 생애최초 기본조건과 맞지 않아요.',
      undefined,
      [RULE, GUIDELINE, EXCEPTIONS],
    );
  }
  if (
    current === undefined ||
    previous === undefined ||
    householdCurrent === undefined ||
    householdPrevious === undefined
  ) {
    return check(
      'lifetime_home_history',
      '세대 전체 주택 소유 이력',
      'needs_information',
      '본인과 현재 세대원 모두의 현재·과거 주택 소유 이력이 필요해요.',
      'HOUSING_HISTORY',
      [RULE, GUIDELINE, EXCEPTIONS],
    );
  }
  return check(
    'lifetime_home_history',
    '세대 전체 주택 소유 이력',
    'met',
    '입력한 정보에서는 본인과 현재 세대원의 주택 소유 이력이 없어요.',
    undefined,
    [RULE, GUIDELINE, EXCEPTIONS],
  );
}

function checkSpecialSupplyHistory(profile: ApplicantProfileV2): FirstHomeEligibilityCheck {
  const previous = knownValue(profile.housing.hasSpecialSupplyRestriction);
  if (previous === true) {
    return check(
      'special_supply_history',
      '특별공급 횟수 제한',
      'not_met',
      '청약홈에서 특별공급 횟수 제한 대상 이력이 확인됐어요.',
      undefined,
      [EXCEPTIONS],
    );
  }
  if (previous === undefined) {
    return check(
      'special_supply_history',
      '특별공급 횟수 제한',
      'needs_information',
      '청약홈에서 본인·세대의 특별공급 횟수 제한 대상 이력을 확인해 주세요.',
      'HOUSING_HISTORY',
      [EXCEPTIONS],
    );
  }
  return check(
    'special_supply_history',
    '특별공급 횟수 제한',
    'met',
    '입력한 정보에서는 특별공급 횟수 제한 대상 이력이 없어요.',
    undefined,
    [EXCEPTIONS],
  );
}

function checkSubscription(
  profile: ApplicantProfileV2,
  context?: FirstHomeListingContext,
): FirstHomeEligibilityCheck {
  const hasAccount = knownValue(profile.subscriptionAccount.hasAccount);
  if (hasAccount === false) {
    return check(
      'subscription_first_priority',
      '청약통장 1순위',
      'not_met',
      '청약통장이 없어 민영주택 1순위 기본조건을 충족할 수 없어요.',
      undefined,
      [RULE, GUIDELINE],
    );
  }
  if (hasAccount === undefined) {
    return check(
      'subscription_first_priority',
      '청약통장 1순위',
      'needs_information',
      '청약통장 보유 여부를 알려주세요.',
      'SUBSCRIPTION_ACCOUNT',
      [RULE, GUIDELINE],
    );
  }
  if (context?.subscriptionFirstPriorityConfirmed === true) {
    return check('subscription_first_priority', '청약통장 1순위', 'met', '선택한 공고의 1순위 조건을 확인했어요.', undefined, [RULE, GUIDELINE]);
  }
  if (context?.subscriptionFirstPriorityConfirmed === false) {
    return check('subscription_first_priority', '청약통장 1순위', 'not_met', '선택한 공고의 1순위 조건을 충족하지 않아요.', undefined, [RULE, GUIDELINE]);
  }
  return check(
    'subscription_first_priority',
    '청약통장 1순위',
    'needs_listing_confirmation',
    '통장 보유는 확인됐어요. 가입기간·지역·예치금에 따른 1순위 여부는 공고에서 확인해야 해요.',
    undefined,
    [RULE, GUIDELINE],
  );
}

function checkIncomeTaxHistory(profile: ApplicantProfileV2): FirstHomeEligibilityCheck {
  const activity = knownValue(profile.income.workOrBusinessIncomeEligible);
  const years = knownValue(profile.income.incomeTaxPaymentYears);
  if (activity === false) {
    return check(
      'income_tax_history',
      '근로·사업소득과 소득세 이력',
      'not_met',
      '현재 근로자·자영업자 또는 최근 1년 내 근로·사업소득세 납부자 조건과 맞지 않아요.',
      undefined,
      [RULE, GUIDELINE],
    );
  }
  if (activity === true && years !== undefined && years < 5) {
    return check(
      'income_tax_history',
      '근로·사업소득과 소득세 이력',
      'not_met',
      '근로·사업소득세 납부기간이 통산 5년보다 짧아요.',
      undefined,
      [RULE, GUIDELINE],
    );
  }
  if (activity === undefined || years === undefined) {
    return check(
      'income_tax_history',
      '근로·사업소득과 소득세 이력',
      'needs_information',
      '근로·사업소득 여부와 소득세 납부기간을 알려주세요.',
      'INCOME',
      [RULE, GUIDELINE],
    );
  }
  return check(
    'income_tax_history',
    '근로·사업소득과 소득세 이력',
    'met',
    '입력한 정보에서 근로·사업소득 관련 조건과 통산 5년 이상 이력이 확인돼요.',
    undefined,
    [RULE, GUIDELINE],
  );
}

function checkMarriageOrChildPath(profile: ApplicantProfileV2): FirstHomeEligibilityCheck {
  const marriage = knownValue(profile.family.marriageStatus);
  const children = knownValue(profile.family.childrenCount);
  if (marriage === 'married' || (children !== undefined && children > 0)) {
    return check(
      'marriage_or_child_path',
      '혼인·자녀 또는 추첨공급 경로',
      'met',
      '혼인 중이거나 자녀가 있는 경로로 확인돼요.',
      undefined,
      [RULE, GUIDELINE],
    );
  }
  if (marriage === undefined || children === undefined) {
    return check(
      'marriage_or_child_path',
      '혼인·자녀 또는 추첨공급 경로',
      'needs_information',
      '혼인 상태와 자녀 정보를 알려주세요.',
      'FAMILY',
      [RULE, GUIDELINE],
    );
  }
  return check(
    'marriage_or_child_path',
    '혼인·자녀 또는 추첨공급 경로',
    'needs_listing_confirmation',
    '미혼·무자녀도 추첨공급 경로가 있을 수 있어요. 소득·부동산 및 면적 기준을 공고에서 확인해야 해요.',
    undefined,
    [RULE, GUIDELINE],
  );
}

function checkIncomeAndRealEstate(
  profile: ApplicantProfileV2,
  context?: FirstHomeListingContext,
): FirstHomeEligibilityCheck {
  const income = knownValue(profile.income.annualRange);
  const realEstate = profile.assets.realEstate.status;
  if (income === undefined) {
    return check(
      'income_and_real_estate',
      '가구 소득·부동산 기준',
      'needs_information',
      '가구 소득 범위를 먼저 알려주세요.',
      'INCOME',
      [RULE, GUIDELINE],
    );
  }
  if (realEstate === 'unknown') {
    return check(
      'income_and_real_estate',
      '가구 소득·부동산 기준',
      'needs_information',
      '세대가 소유한 부동산 정보를 먼저 알려주세요.',
      'ASSETS',
      [RULE, GUIDELINE],
    );
  }
  if (context?.incomeAndRealEstateCriteriaConfirmed === true) {
    return check('income_and_real_estate', '가구 소득·부동산 기준', 'met', '선택한 공고의 소득·부동산 기준을 확인했어요.', undefined, [RULE, GUIDELINE]);
  }
  if (context?.incomeAndRealEstateCriteriaConfirmed === false) {
    return check('income_and_real_estate', '가구 소득·부동산 기준', 'not_met', '선택한 공고의 소득·부동산 기준을 충족하지 않아요.', undefined, [RULE, GUIDELINE]);
  }
  return check(
    'income_and_real_estate',
    '가구 소득·부동산 기준',
    'needs_listing_confirmation',
    '입력 범위는 확인했어요. 가구원수·전년도 소득표·부동산 산정액은 해당 공고 기준으로 확인해야 해요.',
    undefined,
    [RULE, GUIDELINE],
  );
}

function checkSingleHouseholdArea(
  profile: ApplicantProfileV2,
  context?: FirstHomeListingContext,
): FirstHomeEligibilityCheck {
  const memberCount = knownValue(profile.household.memberCount);
  if (memberCount === undefined) {
    return check(
      'single_household_area',
      '단독세대 면적 제한',
      'needs_information',
      '단독세대 여부를 확인하려면 현재 세대원 수가 필요해요.',
      'HOUSEHOLD',
      [RULE, GUIDELINE],
    );
  }
  if (memberCount > 1) {
    return check(
      'single_household_area',
      '단독세대 면적 제한',
      'met',
      '입력한 세대원 수 기준으로 단독세대의 60㎡ 이하 제한 대상이 아니에요.',
      undefined,
      [RULE, GUIDELINE],
    );
  }
  if (context?.exclusiveAreaM2 === undefined) {
    return check(
      'single_household_area',
      '단독세대 면적 제한',
      'needs_listing_confirmation',
      '단독세대는 전용 60㎡ 이하만 신청할 수 있어 공고의 주택형 확인이 필요해요.',
      undefined,
      [RULE, GUIDELINE],
    );
  }
  if (context.exclusiveAreaM2 > 60) {
    return check(
      'single_household_area',
      '단독세대 면적 제한',
      'not_met',
      '단독세대가 신청할 수 있는 전용 60㎡를 초과한 주택형이에요.',
      undefined,
      [RULE, GUIDELINE],
    );
  }
  return check(
    'single_household_area',
    '단독세대 면적 제한',
    'met',
    '선택한 주택형은 단독세대의 전용 60㎡ 이하 범위예요.',
    undefined,
    [RULE, GUIDELINE],
  );
}

function summarizeStatus(checks: FirstHomeEligibilityCheck[]): FirstHomeEligibilityStatus {
  if (checks.some((item) => item.status === 'not_met')) return 'not_eligible';
  if (checks.some((item) => item.status === 'needs_information')) return 'needs_information';
  if (checks.some((item) => item.status === 'needs_listing_confirmation')) {
    return 'needs_listing_confirmation';
  }
  return 'likely_eligible';
}

function statusTitle(status: FirstHomeEligibilityStatus): string {
  if (status === 'likely_eligible') return '기본조건을 확인했어요';
  if (status === 'needs_information') return '정보를 더 확인해 주세요';
  if (status === 'needs_listing_confirmation') return '공고 확인이 필요해요';
  return '현재 확인된 조건이 어려워요';
}

function statusSummary(status: FirstHomeEligibilityStatus): string {
  if (status === 'likely_eligible') {
    return '현재 입력한 정보와 선택한 공고 기준에서 기본조건을 검토했어요. 실제 신청 전에는 원문 공고를 다시 확인해 주세요.';
  }
  if (status === 'needs_information') {
    return '확인되지 않은 정보는 탈락으로 보지 않았어요. 필요한 정보 하나부터 추가하면 분석이 더 선명해져요.';
  }
  if (status === 'needs_listing_confirmation') {
    return '현재 입력한 정보로 공통 기본조건을 검토했어요. 실제 신청 가능 여부는 공고별 조건을 함께 확인해야 해요.';
  }
  return '입력한 정보에서 명확히 맞지 않는 기본조건이 있어요. 아래 이유와 다른 청약 경로를 함께 확인해 보세요.';
}

function createActions(
  checks: FirstHomeEligibilityCheck[],
  missingBundles: ProfileQuestionBundleId[],
  status: FirstHomeEligibilityStatus,
): EligibilityAction[] {
  const actions: EligibilityAction[] = missingBundles.map((bundleId) => ({
    id: `complete-${bundleId.toLowerCase()}`,
    label: bundleActionLabel(bundleId),
    bundleId,
  }));
  if (checks.some((item) => item.status === 'needs_listing_confirmation')) {
    actions.push({ id: 'browse-listings', label: '관련 공고 보기', route: '/discovery' });
  }
  if (status === 'not_eligible' || status === 'likely_eligible') {
    actions.push({ id: 'view-roadmap', label: '준비 로드맵 보기', route: '/preparation' });
  }
  return actions.slice(0, 4);
}

function bundleActionLabel(bundleId: ProfileQuestionBundleId): string {
  const labels: Partial<Record<ProfileQuestionBundleId, string>> = {
    HOUSING_HISTORY: '주택 이력 확인',
    SUBSCRIPTION_ACCOUNT: '청약통장 확인',
    INCOME: '소득·소득세 정보 추가',
    ASSETS: '부동산 정보 추가',
    HOUSEHOLD: '세대 정보 추가',
    FAMILY: '가족 정보 추가',
  };
  return labels[bundleId] ?? '프로필 정보 추가';
}

function check(
  id: FirstHomeEligibilityCheck['id'],
  label: string,
  status: EligibilityCheckStatus,
  reason: string,
  requiredBundle: ProfileQuestionBundleId | undefined,
  sourceRefs: FirstHomeSourceRef['id'][],
): FirstHomeEligibilityCheck {
  return { id, label, status, reason, requiredBundle, sourceRefs };
}

export type FirstHomeAiContext = {
  feature: 'first_home_private_v1';
  status: FirstHomeEligibilityStatus;
  passedChecks: Array<{ id: string; label: string; reason: string }>;
  missingChecks: Array<{ id: string; label: string; reason: string }>;
  listingChecks: Array<{ id: string; label: string; reason: string }>;
  failedChecks: Array<{ id: string; label: string; reason: string }>;
  actions: string[];
  ruleSetVersion: string;
  effectiveDate: string;
};

/** Raw profile은 절대 넘기지 않고 deterministic result의 허용 필드만 복사한다. */
export function buildFirstHomeAiContext(result: FirstHomeEligibilityResult): FirstHomeAiContext {
  const select = (status: EligibilityCheckStatus) =>
    result.checks
      .filter((item) => item.status === status)
      .map(({ id, label, reason }) => ({ id, label, reason }));
  return {
    feature: 'first_home_private_v1',
    status: result.status,
    passedChecks: select('met'),
    missingChecks: select('needs_information'),
    listingChecks: select('needs_listing_confirmation'),
    failedChecks: select('not_met'),
    actions: result.actions.map((action) => action.label),
    ruleSetVersion: result.metadata.ruleSetVersion,
    effectiveDate: result.metadata.effectiveDate,
  };
}

export function getFirstHomeFeatureRequirements(profile: ApplicantProfileV2) {
  return getFeatureProfileRequirements('first-home', profile);
}
