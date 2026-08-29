import { readFileSync } from 'node:fs';
import { calculatePreparationScore } from '../../domain/preparation.ts';
import type { UserProfile } from '../../domain/types.ts';
import {
  PROFILE_BUNDLES,
  calculateProfileCompleteness,
  createApplicantProfileFromLegacy,
  createMinimalApplicantProfile,
  createPromptFatigueState,
  getBundleCompletion,
  getFeatureProfileRequirements,
  getKnownApplicantSignals,
  hasCoreProfileForCalculations,
  knownField,
  migrateApplicantProfile,
  notApplicableField,
  recordBundleDismissed,
  recordBundleShown,
  resolveFeaturePrompt,
  toDiscoveryUserProfile,
  toLegacyUserProfile,
  unknownField,
} from './domain.ts';

let checks = 0;
const check = (condition: unknown, message: string) => {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
};
const eq = (actual: unknown, expected: unknown, message: string) =>
  check(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)}`);

const legacy: UserProfile = {
  name: '지민',
  age: 22,
  occupation: 'student',
  region: '서울특별시',
  hasSubscriptionAccount: true,
  accountMonths: 14,
  monthlyPayment: 100_000,
  isNoHomeOwner: true,
};

const migrated = createApplicantProfileFromLegacy(legacy);
eq(migrated.version, 2, 'legacy profile은 V2로 변환');
eq(migrated.basic.name, legacy.name, '이름 migration');
eq(migrated.subscriptionAccount.hasAccount, knownField(true), '통장 보유 migration');
eq(migrated.subscriptionAccount.accountMonths, knownField(14), '가입 개월 migration');
eq(migrated.housing.currentOwnership, knownField('no-home'), '무주택 migration');
eq(toLegacyUserProfile(migrated), legacy, 'V2 adapter는 기존 profile을 보존');
eq(
  calculatePreparationScore(toLegacyUserProfile(migrated)),
  calculatePreparationScore(legacy),
  'migration 전후 preparation score 회귀 없음',
);

const noAccount = createApplicantProfileFromLegacy({
  ...legacy,
  hasSubscriptionAccount: false,
  accountMonths: 19,
  monthlyPayment: 200_000,
});
eq(noAccount.subscriptionAccount.hasAccount, knownField(false), '통장 없음은 known false');
eq(noAccount.subscriptionAccount.accountMonths, notApplicableField(), '통장 없음의 가입 개월은 해당 없음');
eq(noAccount.subscriptionAccount.monthlyPayment, notApplicableField(), '통장 없음의 납입액은 해당 없음');

const minimal = createMinimalApplicantProfile({
  name: '민지',
  age: 27,
  currentRegion: '서울특별시',
  preferredRegions: ['서울특별시', '경기도'],
});
eq(minimal.subscriptionAccount.hasAccount.status, 'unknown', '미입력 통장은 unknown');
eq(minimal.housing.currentOwnership.status, 'unknown', '미입력 주택 상태는 unknown');
check(
  JSON.stringify(minimal.subscriptionAccount.hasAccount) !==
    JSON.stringify(noAccount.subscriptionAccount.hasAccount),
  '미입력과 실제 없음은 구분',
);
eq(getBundleCompletion(minimal, 'BASIC'), 'partial', '직업 미입력 basic은 일부 완료');
eq(getBundleCompletion(minimal, 'RESIDENCE'), 'complete', '최소 onboarding 거주 정보 완료');
eq(getBundleCompletion(minimal, 'PREFERENCES'), 'complete', '최소 onboarding 관심지역 완료');
eq(getBundleCompletion(minimal, 'SUBSCRIPTION_ACCOUNT'), 'missing', '통장 bundle 미입력');

const partial = {
  ...minimal,
  housing: { ...minimal.housing, currentOwnership: knownField<'no-home' | 'owns-home'>('no-home') },
};
eq(getBundleCompletion(partial, 'HOUSING_HISTORY'), 'partial', 'bundle 일부 입력');
check(calculateProfileCompleteness(partial) > calculateProfileCompleteness(minimal), '일부 입력도 완료도 증가');
eq(calculateProfileCompleteness(minimal), calculateProfileCompleteness(minimal), '완료도 deterministic');

const complete = {
  ...minimal,
  basic: { ...minimal.basic, occupation: knownField<'student' | 'worker' | 'etc'>('worker') },
  subscriptionAccount: {
    hasAccount: knownField(true),
    accountMonths: knownField(36),
    monthlyPayment: knownField(100_000),
  },
  housing: {
    currentOwnership: knownField<'no-home' | 'owns-home'>('no-home'),
    previousOwnership: knownField(false),
    householdHasHome: knownField(false),
  },
  household: { memberCount: knownField(2) },
  family: {
    marriageStatus: knownField<'single' | 'married'>('single'),
    marriageYears: notApplicableField<number>(),
    childrenCount: knownField(0),
    childBirthYears: notApplicableField<number[]>(),
  },
  income: { annualRange: knownField<'30m-50m'>('30m-50m') },
  assets: {
    financial: knownField<'10m-30m'>('10m-30m'),
    realEstate: notApplicableField<'under-10m'>(),
    vehicle: notApplicableField<'under-10m'>(),
    debt: notApplicableField<'under-10m'>(),
  },
};
eq(calculateProfileCompleteness(complete), 100, '전체 bundle 완료도 100');
check(PROFILE_BUNDLES.every((bundle) => bundle.estimatedQuestionCount <= 5), 'bundle 질문 수는 5개 이하');

const futureMissing = getFeatureProfileRequirements('future', minimal);
eq(futureMissing.missing, ['SUBSCRIPTION_ACCOUNT'], 'Future 필수 bundle 계산');
const futureKnown = getFeatureProfileRequirements('future', complete);
eq(futureKnown.missing, [], '입력한 정보는 다른 기능에서 재요청하지 않음');

const freshFatigue = createPromptFatigueState();
eq(resolveFeaturePrompt('future', minimal, freshFatigue), 'SUBSCRIPTION_ACCOUNT', '핵심 bundle 하나만 선택');
const shown = recordBundleShown(freshFatigue, 'SUBSCRIPTION_ACCOUNT');
eq(resolveFeaturePrompt('future', minimal, shown), null, '같은 세션에서 연속 bundle prompt 차단');
const dismissed = recordBundleDismissed(freshFatigue, 'SUBSCRIPTION_ACCOUNT');
eq(resolveFeaturePrompt('future', minimal, dismissed), null, 'dismiss 후 즉시 재표시 차단');

const incompleteChildYears = {
  ...complete,
  family: {
    ...complete.family,
    marriageStatus: knownField<'single' | 'married'>('married'),
    marriageYears: knownField(3),
    childrenCount: knownField(2),
    childBirthYears: knownField([2022]),
  },
};
eq(
  getBundleCompletion(incompleteChildYears, 'FAMILY'),
  'partial',
  '자녀 출생연도 수가 자녀 수보다 적으면 family 일부 완료',
);

// Scenario B: bundle 을 채우고 돌아오면 같은 화면이 다시 묻지 않는다.
const accountFilled = {
  ...minimal,
  subscriptionAccount: {
    hasAccount: knownField(true),
    accountMonths: knownField(30),
    monthlyPayment: knownField(100_000),
  },
};
eq(getFeatureProfileRequirements('future', accountFilled).missing, [], 'bundle 완료 뒤 Future 필수 항목 없음');
eq(
  resolveFeaturePrompt('future', accountFilled, createPromptFatigueState()),
  null,
  'bundle 완료 직후 fatigue 가 비어 있어도 다음 modal 을 띄우지 않는다',
);
eq(
  resolveFeaturePrompt('future', accountFilled, recordBundleShown(createPromptFatigueState(), 'SUBSCRIPTION_ACCOUNT')),
  null,
  '완료 + 이미 표시한 세션에서도 재질문 없음',
);

// Scenario C: 한 기능에서 입력한 가족 정보를 다른 기능이 다시 묻지 않는다.
const familyFilled = {
  ...minimal,
  family: {
    marriageStatus: knownField<'single' | 'married'>('married'),
    marriageYears: knownField(3),
    childrenCount: knownField(1),
    childBirthYears: knownField([2022]),
  },
};
eq(getFeatureProfileRequirements('newlywed', familyFilled).missing, [], '가족 정보를 채우면 신혼 기능은 재요청 없음');
eq(
  getFeatureProfileRequirements('multi-child', familyFilled).missing,
  ['HOUSEHOLD'],
  '다른 기능은 아직 없는 bundle 만 요청하고 가족 정보는 재사용',
);
eq(
  resolveFeaturePrompt('newlywed', familyFilled, createPromptFatigueState()),
  null,
  '이미 완료된 bundle 은 prompt 대상이 아니다',
);

// legacy adapter 의 unknown fallback 은 "단정하지 않는 쪽"으로 고정한다.
const minimalLegacy = toLegacyUserProfile(minimal);
eq(minimalLegacy.hasSubscriptionAccount, false, 'unknown 통장은 점수로 인정하지 않는다');
eq(minimalLegacy.isNoHomeOwner, false, 'unknown 주택 상태를 무주택으로 단정하지 않는다');
eq(minimalLegacy.occupation, 'etc', 'unknown 직업은 중립값으로 내려간다');
check(
  calculatePreparationScore(minimalLegacy) < calculatePreparationScore(toLegacyUserProfile(complete)),
  'unknown 은 점수를 올려주지 않는다',
);
check(!hasCoreProfileForCalculations(minimal), '핵심 프로필 미입력은 계산값 공유 불가');
check(hasCoreProfileForCalculations(complete), '통장·주택이 known 이면 계산값 공유 가능');
check(
  !hasCoreProfileForCalculations({ ...complete, housing: { ...complete.housing, currentOwnership: unknownField() } }),
  '주택 상태만 빠져도 계산값을 공유하지 않는다',
);

const malformed = migrateApplicantProfile({ version: 2, basic: { age: 'wrong' } }, legacy);
eq(malformed.basic.age, legacy.age, 'malformed V2는 안전한 fallback');
const legacyStored = migrateApplicantProfile({ ...legacy }, { ...legacy, name: 'fallback' });
eq(legacyStored.basic.name, legacy.name, '저장된 legacy object migration');

const knownSignals = getKnownApplicantSignals(minimal);
check(!JSON.stringify(knownSignals).includes('hasSubscriptionAccount'), 'unknown AI signal은 JSON에서 생략');
eq(knownSignals.preferredRegions, ['서울특별시', '경기도'], 'known 관심지역은 AI signal에 유지');
eq(toDiscoveryUserProfile(minimal).region, '서울특별시', 'Discovery는 첫 관심지역을 기존 region adapter로 재사용');

const onboardingSource = readFileSync('app/index.tsx', 'utf8');
check(onboardingSource.includes('preferredRegions'), '최소 onboarding에 관심지역 입력');
check(!onboardingSource.includes('draft.hasSubscriptionAccount'), 'onboarding에서 통장 상세 질문 제거');
check(!onboardingSource.includes('draft.isNoHomeOwner'), 'onboarding에서 주택 상태 질문 제거');
check(readFileSync('app/future.tsx', 'utf8').includes('<ProfilePromptSheet'), 'Future progressive prompt 연결');

// 미입력을 "없음"으로 표시하는 화면이 남아 있으면 안 된다.
for (const screen of ['app/(tabs)/home.tsx', 'app/(tabs)/preparation.tsx', 'app/future.tsx']) {
  const source = readFileSync(screen, 'utf8');
  if (!source.includes('통장 없음')) continue;
  check(source.includes('accountKnown'), `${screen}: 통장 없음 표시에는 unknown 가드가 필요하다`);
}
check(readFileSync('app/(tabs)/more.tsx', 'utf8').includes("route: '/profile'"), '전체 탭에서 청약 프로필 진입');
check(
  readFileSync('app/_layout.tsx', 'utf8').includes("Platform.OS !== 'web' && !profileHydrated"),
  'static web export를 profile hydration gate로 막지 않음',
);

console.log(`features/profile: ${checks}개 검증 통과`);
