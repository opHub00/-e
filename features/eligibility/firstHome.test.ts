import { readFileSync } from 'node:fs';
import {
  buildFirstHomeAiContext,
  evaluateFirstHomeEligibility,
  FIRST_HOME_RULE_METADATA,
  getFirstHomeFeatureRequirements,
  type FirstHomeListingContext,
} from './firstHome.ts';
import {
  createMinimalApplicantProfile,
  knownField,
  migrateApplicantProfile,
  notApplicableField,
  unknownField,
  type AmountRange,
  type ApplicantProfileV2,
  type IncomeRange,
} from '../profile/domain.ts';
import type { UserProfile } from '../../domain/types.ts';

let checks = 0;
const ok = (condition: unknown, message: string) => {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
};
const eq = (actual: unknown, expected: unknown, message: string) =>
  ok(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)}`);

const completeProfile = (): ApplicantProfileV2 => ({
  ...createMinimalApplicantProfile({
    name: '민지',
    age: 31,
    currentRegion: '서울특별시',
    preferredRegions: ['서울특별시'],
  }),
  subscriptionAccount: {
    hasAccount: knownField(true),
    accountMonths: knownField(48),
    monthlyPayment: knownField(100_000),
  },
  housing: {
    currentOwnership: knownField('no-home'),
    previousOwnership: knownField(false),
    householdHasHome: knownField(false),
    householdDisqualifyingPreviousOwnership: knownField(false),
    hasSpecialSupplyRestriction: knownField(false),
  },
  household: { memberCount: knownField(2) },
  family: {
    marriageStatus: knownField('married'),
    marriageYears: knownField(3),
    childrenCount: knownField(0),
    childBirthYears: notApplicableField(),
  },
  income: {
    annualRange: knownField('30m-50m'),
    workOrBusinessIncomeEligible: knownField(true),
    incomeTaxPaymentYears: knownField(6),
  },
  assets: {
    financial: knownField('10m-30m'),
    realEstate: notApplicableField(),
    vehicle: knownField('under-10m'),
    debt: notApplicableField(),
  },
});

const confirmedListing: FirstHomeListingContext = {
  supplyType: 'private-housing',
  exclusiveAreaM2: 59,
  subscriptionFirstPriorityConfirmed: true,
  incomeAndRealEstateCriteriaConfirmed: true,
  announcementDate: '2026-08-01',
};

const eligible = evaluateFirstHomeEligibility(completeProfile(), confirmedListing);
eq(eligible.status, 'likely_eligible', '모든 known + 공고 조건 충족');
ok(eligible.checks.every((item) => item.status === 'met'), '확정 컨텍스트에서는 모든 check 충족');
eq(
  eligible.checks.map((item) => item.id),
  [
    'supported_scope',
    'lifetime_home_history',
    'special_supply_history',
    'subscription_first_priority',
    'income_tax_history',
    'marriage_or_child_path',
    'income_and_real_estate',
    'single_household_area',
  ],
  'result ordering 고정',
);

const failed = evaluateFirstHomeEligibility({
  ...completeProfile(),
  housing: { ...completeProfile().housing, previousOwnership: knownField(true) },
});
eq(failed.status, 'not_eligible', '명확한 과거 주택 소유는 미충족');

const minimal = createMinimalApplicantProfile({
  name: '신규',
  age: 27,
  currentRegion: '서울특별시',
  preferredRegions: ['서울특별시'],
});
const minimalResult = evaluateFirstHomeEligibility(minimal);
eq(minimalResult.status, 'needs_information', '최소 profile은 정보 부족');
ok(minimalResult.checks.every((item) => item.status !== 'not_met'), 'unknown은 절대 미충족이 아님');

for (const [label, profile] of [
  ['housing unknown', { ...completeProfile(), housing: { ...completeProfile().housing, householdDisqualifyingPreviousOwnership: unknownField<boolean>() } }],
  ['income unknown', { ...completeProfile(), income: { ...completeProfile().income, annualRange: unknownField<IncomeRange>() } }],
  ['asset unknown', { ...completeProfile(), assets: { ...completeProfile().assets, realEstate: unknownField<AmountRange>() } }],
  ['subscription unknown', { ...completeProfile(), subscriptionAccount: { ...completeProfile().subscriptionAccount, hasAccount: unknownField<boolean>() } }],
] as const) {
  const result = evaluateFirstHomeEligibility(profile);
  eq(result.status, 'needs_information', label);
  ok(result.checks.every((item) => item.status !== 'not_met'), `${label}: unknown은 not_met 아님`);
}

const severalMissing = evaluateFirstHomeEligibility(minimal);
ok(severalMissing.missingBundles.length > 1, '여러 missing 조건을 구조화');
eq(severalMissing.actions[0]?.bundleId, 'HOUSING_HISTORY', '가장 중요한 bundle을 먼저 제안');
eq(getFirstHomeFeatureRequirements(minimal).missing[0], 'HOUSING_HISTORY', 'feature requirement resolution');

const listingNeeded = evaluateFirstHomeEligibility(completeProfile());
eq(listingNeeded.status, 'needs_listing_confirmation', '공고 없는 complete profile은 공고 확인 필요');
ok(listingNeeded.checks.some((item) => item.status === 'needs_listing_confirmation'), '공고별 조건 보류');

const singleOverArea = evaluateFirstHomeEligibility(
  {
    ...completeProfile(),
    household: { memberCount: knownField(1) },
    family: {
      marriageStatus: knownField('single'),
      marriageYears: notApplicableField(),
      childrenCount: knownField(0),
      childBirthYears: notApplicableField(),
    },
  },
  { ...confirmedListing, exclusiveAreaM2: 84 },
);
eq(singleOverArea.status, 'not_eligible', '단독세대 60㎡ 초과는 명확한 미충족');

const publicListing = evaluateFirstHomeEligibility(completeProfile(), {
  ...confirmedListing,
  supplyType: 'public-sale',
});
eq(publicListing.checks[0].status, 'needs_listing_confirmation', '미지원 공급유형은 판정하지 않음');

const aiContext = buildFirstHomeAiContext(listingNeeded);
eq(aiContext.status, listingNeeded.status, 'AI context는 deterministic status 유지');
ok(!JSON.stringify(aiContext).includes('민지'), 'AI context에 raw profile/name 없음');
ok(!JSON.stringify(aiContext).includes('annualRange'), 'AI context에 raw profile field 없음');
eq(buildFirstHomeAiContext(listingNeeded), aiContext, 'AI context deterministic');

ok(FIRST_HOME_RULE_METADATA.ruleSetVersion.includes('2026.07.08'), 'rule metadata version');
eq(FIRST_HOME_RULE_METADATA.effectiveDate, '2026-07-08', 'rule effective date');
ok(FIRST_HOME_RULE_METADATA.sources.every((source) => source.url.startsWith('https://www.law.go.kr/')), '공식 source만 사용');

const migratedLike = {
  ...completeProfile(),
  housing: { ...completeProfile().housing, hasSpecialSupplyRestriction: unknownField<boolean>() },
};
eq(evaluateFirstHomeEligibility(migratedLike).status, 'needs_information', 'migration 후 신규 필드 unknown은 정보 부족');

const beforeEligibilityFields = completeProfile();
const {
  householdDisqualifyingPreviousOwnership: _oldHouseholdHistory,
  hasSpecialSupplyRestriction: _oldSpecialSupply,
  ...oldHousing
} = beforeEligibilityFields.housing;
const {
  workOrBusinessIncomeEligible: _oldIncomeActivity,
  incomeTaxPaymentYears: _oldIncomeTaxYears,
  ...oldIncome
} = beforeEligibilityFields.income;
const fallback: UserProfile = {
  name: '민지',
  age: 31,
  occupation: 'worker',
  region: '서울특별시',
  hasSubscriptionAccount: true,
  accountMonths: 48,
  monthlyPayment: 100_000,
  isNoHomeOwner: true,
};
const migratedOldV2 = migrateApplicantProfile(
  { ...beforeEligibilityFields, housing: oldHousing, income: oldIncome },
  fallback,
);
eq(migratedOldV2.housing.hasSpecialSupplyRestriction.status, 'unknown', '구 V2 migration은 신규 특별공급 필드를 unknown으로 보존');
eq(migratedOldV2.income.incomeTaxPaymentYears.status, 'unknown', '구 V2 migration은 신규 소득세 필드를 unknown으로 보존');
eq(evaluateFirstHomeEligibility(migratedOldV2).status, 'needs_information', '실제 구 V2 migration 후 분석은 탈락이 아님');

const specialSupplyCheck = eligible.checks.find((item) => item.id === 'special_supply_history');
ok(specialSupplyCheck?.sourceRefs.includes('housing-supply-rules-55'), '특별공급 횟수 제한은 제55조 source 추적');

const screenSource = readFileSync('app/eligibility/first-home.tsx', 'utf8');
ok(!/%|퍼센트|확률/.test(screenSource), 'eligibility UI에 점수·퍼센트·확률 없음');
ok(screenSource.includes('<ProfilePromptSheet'), '기존 fatigue prompt 재사용');
ok(readFileSync('app/profile.tsx', 'utf8').includes('혼인 전 배우자 이력을 제외하고'), '배우자 혼인 전 주택 이력 특례를 질문에 반영');

console.log(`features/eligibility/firstHome: ${checks}개 검증 통과`);
