import {
  buildListingFitExplanationContext,
  buildListingFitExplanationFallback,
  isListingFitExplanationContext,
  isSafeListingFitExplanation,
  parseListingFitExplanationContext,
} from './ai.ts';
import {
  evaluateListingPersonalFit,
  LISTING_PERSONAL_FIT_RULE_SET_VERSION,
  type ListingPersonalFitResult,
} from './personalFit.ts';
import type { DiscoveryListing } from '../discovery/types.ts';
import {
  createMinimalApplicantProfile,
  knownField,
  notApplicableField,
  unknownField,
  type ApplicantProfileV2,
} from '../profile/domain.ts';

let checks = 0;
const ok = (condition: unknown, message: string) => {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
};
const eq = (actual: unknown, expected: unknown, message: string) =>
  ok(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)}`);

const listing = (overrides: Partial<DiscoveryListing> = {}): DiscoveryListing => ({
  id: 'apt-20260001-20260001',
  sourceType: 'applyhome-apt',
  complexName: '테스트 민간분양',
  region: '서울',
  district: '강남구',
  address: '서울특별시 강남구 테스트로 1',
  latitude: 37.5,
  longitude: 127,
  announcementDate: '2026-09-01',
  recruitmentStatus: 'upcoming',
  recruitmentStartDate: '2026-09-10',
  recruitmentEndDate: '2026-09-12',
  winnerAnnouncementDate: '2026-09-20',
  contractStartDate: '2026-10-01',
  contractEndDate: '2026-10-03',
  announcementUrl: 'https://example.com/notice',
  homepageUrl: 'https://example.com',
  housingType: '아파트',
  supplyType: '민간분양',
  representativePrice: null,
  householdCount: 100,
  imagePlaceholder: { from: '#6558C8', to: '#393091', icon: 'apartment' },
  interestTags: [],
  checkpoints: ['공식 모집공고의 신청 조건'],
  isDemo: false,
  ...overrides,
});

const completeProfile = (): ApplicantProfileV2 => ({
  ...createMinimalApplicantProfile({
    name: '테스트 사용자',
    age: 31,
    currentRegion: '서울특별시',
    preferredRegions: ['서울특별시', '부산광역시'],
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

const good = evaluateListingPersonalFit(listing(), completeProfile());
eq(good.status, 'good_fit', '관심지역·거주지역·일정이 맞으면 잘 맞는 부분 표시');
eq(good.checks.find((item) => item.key === 'preferred_region')?.status, 'matched', '관심지역 일치');
eq(good.checks.find((item) => item.key === 'residence_region')?.status, 'matched', '현재 거주지역 일치');
ok(good.checks.some((item) => item.status === 'needs_listing_confirmation'), '잘 맞아도 공고 확인 조건 유지');
ok(!JSON.stringify(good).includes('score'), '공식 점수처럼 보이는 score 없음');
ok(!JSON.stringify(good).includes('probability'), '당첨 확률 필드 없음');

const mismatch = evaluateListingPersonalFit(listing({ region: '대전' }), completeProfile());
eq(mismatch.checks.find((item) => item.key === 'preferred_region')?.status, 'limited', '관심지역 불일치');
eq(mismatch.status, 'limited_fit', '명확한 선호 불일치는 제한 상태');

const noPreferences = {
  ...completeProfile(),
  preferences: { regions: [] },
};
const noPreferenceResult = evaluateListingPersonalFit(listing(), noPreferences);
eq(noPreferenceResult.checks.find((item) => item.key === 'preferred_region')?.status, 'needs_information', '관심지역 unknown');
ok(noPreferenceResult.missingBundles.includes('PREFERENCES'), '관심지역 bundle 제안');

const accountKnown = good.checks.find((item) => item.key === 'subscription_account');
eq(accountKnown?.status, 'needs_listing_confirmation', '통장 가입기간 known이어도 공고 기준은 보류');
ok(accountKnown?.reason.includes('48개월'), '확인된 가입기간만 설명');

const accountUnknownProfile = {
  ...completeProfile(),
  subscriptionAccount: {
    hasAccount: unknownField<boolean>(),
    accountMonths: unknownField<number>(),
    monthlyPayment: unknownField<number>(),
  },
};
const accountUnknown = evaluateListingPersonalFit(listing(), accountUnknownProfile);
eq(accountUnknown.checks.find((item) => item.key === 'subscription_account')?.status, 'needs_information', '통장 unknown');
ok(accountUnknown.missingBundles.includes('SUBSCRIPTION_ACCOUNT'), '통장 bundle 제안');

eq(good.checks.find((item) => item.key === 'housing_status')?.status, 'matched', '무주택 known 신호');
const housingUnknown = evaluateListingPersonalFit(listing(), {
  ...completeProfile(),
  housing: {
    currentOwnership: unknownField<'no-home' | 'owns-home'>(),
    previousOwnership: unknownField<boolean>(),
    householdHasHome: unknownField<boolean>(),
    householdDisqualifyingPreviousOwnership: unknownField<boolean>(),
    hasSpecialSupplyRestriction: unknownField<boolean>(),
  },
});
eq(housingUnknown.checks.find((item) => item.key === 'housing_status')?.status, 'needs_information', '주택 상태 unknown');
ok(housingUnknown.missingBundles.includes('HOUSING_HISTORY'), '주택 이력 bundle 제안');

const firstHome = good.checks.find((item) => item.key === 'first_home_precheck');
eq(firstHome?.status, 'needs_listing_confirmation', '생애최초 엔진 결과와 공고 데이터 경계 유지');
ok(firstHome?.sources.includes('first-home-rule'), '생애최초 엔진 source 보존');
ok(good.metadata.firstHomeRuleSetVersion.includes('FIRST-HOME'), '생애최초 ruleset metadata 연결');

const missingListingFields = evaluateListingPersonalFit(listing({
  recruitmentStatus: 'unknown',
  recruitmentStartDate: null,
  recruitmentEndDate: null,
  announcementUrl: null,
  representativePrice: null,
}), completeProfile());
eq(missingListingFields.checks.find((item) => item.key === 'recruitment_timing')?.status, 'needs_listing_confirmation', '일정 누락은 공고 확인');
ok(missingListingFields.checks.find((item) => item.key === 'listing_conditions')?.reason.includes('원문 링크도'), '원문 누락 명시');
ok(missingListingFields.checks.every((item) => item.status !== 'limited'), 'listing 필드 누락은 hard failure 아님');

const allUnknownProfile: ApplicantProfileV2 = {
  ...createMinimalApplicantProfile({ name: '완판이', age: 22, currentRegion: '', preferredRegions: [] }),
  residence: { currentRegion: '' },
  preferences: { regions: [] },
};
const allUnknown = evaluateListingPersonalFit(listing({ recruitmentStatus: 'unknown' }), allUnknownProfile);
eq(allUnknown.status, 'needs_information', '프로필이 거의 비어 있으면 정보 부족');
ok(allUnknown.missingBundles.length > 0, '필요 bundle 구조화');
eq(allUnknown.actions[0]?.id, 'complete_profile', '필요 bundle 1개 CTA');
ok(allUnknown.checks.every((item) => item.status !== 'limited'), 'unknown은 절대 hard failure 아님');

const staleSavedListingIds = ['stale-listing-id', listing().id];
const resultWithoutSavedInput = evaluateListingPersonalFit(listing(), completeProfile());
ok(staleSavedListingIds.length === 2, 'stale saved fixture 준비');
eq(resultWithoutSavedInput, good, 'saved 상태와 무관하게 현재 profile로 재계산');
ok(!JSON.stringify(resultWithoutSavedInput).includes('savedListing'), 'fit 결과에 saved cache 없음');

const beforeUpdate = evaluateListingPersonalFit(listing(), {
  ...completeProfile(),
  preferences: { regions: ['부산광역시'] },
});
const afterUpdate = evaluateListingPersonalFit(listing(), completeProfile());
eq(beforeUpdate.status, 'limited_fit', 'profile 변경 전 결과');
eq(afterUpdate.status, 'good_fit', 'profile 변경 즉시 재계산 결과');

const priceMissing = evaluateListingPersonalFit(listing({ representativePrice: null }), completeProfile());
const pricePresent = evaluateListingPersonalFit(listing({ representativePrice: 500_000_000 }), completeProfile());
eq(priceMissing, pricePresent, '가격은 V1 deterministic 판정에 추측 사용하지 않음');

eq(good.metadata.ruleSetVersion, LISTING_PERSONAL_FIT_RULE_SET_VERSION, 'ruleset version metadata');
ok(good.metadata.listingFieldsUsed.includes('recruitmentStatus'), '실제 listing 사용 필드 metadata');
ok(good.metadata.profileFieldsUsed.includes('preferences.regions'), '실제 profile 사용 필드 metadata');

const aiContext = buildListingFitExplanationContext(listing(), good);
ok(isListingFitExplanationContext(aiContext), '정상 AI structured context 허용');
eq(parseListingFitExplanationContext(JSON.stringify(aiContext)), aiContext, 'AI query param 안전 파싱');
eq(aiContext.status, good.status, 'AI context는 deterministic status 유지');
ok(!JSON.stringify(aiContext).includes('테스트 사용자'), 'AI payload에 profile name 없음');
ok(!JSON.stringify(aiContext).includes('applicantProfile'), 'AI payload에 raw ApplicantProfile 없음');
ok(!JSON.stringify(aiContext).includes('monthlyPayment'), 'AI payload에 불필요한 profile field 없음');
ok(!JSON.stringify(aiContext).includes(listing().id), 'AI payload에 hidden listing id 없음');
ok(!isListingFitExplanationContext({ ...aiContext, rawProfile: completeProfile() }), 'raw profile 주입 거부');
ok(!isListingFitExplanationContext({ ...aiContext, status: 'high_probability' }), '임의 status 거부');
ok(!isListingFitExplanationContext({ ...aiContext, checks: [{ ...aiContext.checks[0], status: 'eligible' }] }), '임의 check status 거부');

ok(isSafeListingFitExplanation('관심지역과 맞지만 세부 조건은 공고문에서 확인해 주세요.', aiContext), '안전한 설명 허용');
ok(!isSafeListingFitExplanation('은영님에게 잘 맞는 공고예요.', aiContext), 'AI가 제공되지 않은 사용자 이름을 만들지 못함');
ok(!isSafeListingFitExplanation('당첨 확률은 75%예요.', aiContext), 'AI 확률 생성 차단');
ok(!isSafeListingFitExplanation('신청 자격이 확정됐어요.', aiContext), 'AI 새 자격 판정 차단');
const limitedContext = buildListingFitExplanationContext(listing({ region: '대전' }), mismatch);
ok(!isSafeListingFitExplanation('이 공고는 매우 잘 맞고 유리해요.', limitedContext), 'AI가 limited status를 반대로 설명하지 못함');
const fallback = buildListingFitExplanationFallback(limitedContext);
ok(fallback.includes(mismatch.summary), 'AI fallback은 deterministic summary 유지');
ok(fallback.includes(mismatch.disclaimer), 'AI fallback에 공식 확인 disclaimer 유지');

console.log(`features/listingFit: ${checks}개 검증 통과`);
