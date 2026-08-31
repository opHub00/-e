import type { Occupation, UserProfile } from '../../domain/types.ts';

export type ProfileFieldState<T> =
  | { status: 'unknown' }
  | { status: 'known'; value: T }
  | { status: 'not_applicable' };

export type AmountRange =
  | 'under-10m'
  | '10m-30m'
  | '30m-50m'
  | '50m-100m'
  | 'over-100m';

export type IncomeRange =
  | 'under-30m'
  | '30m-50m'
  | '50m-70m'
  | '70m-100m'
  | 'over-100m';

export type ApplicantProfileV2 = {
  version: 2;
  basic: {
    name: string;
    age: number;
    occupation: ProfileFieldState<Occupation>;
  };
  residence: { currentRegion: string };
  preferences: { regions: string[] };
  subscriptionAccount: {
    hasAccount: ProfileFieldState<boolean>;
    accountMonths: ProfileFieldState<number>;
    monthlyPayment: ProfileFieldState<number>;
  };
  housing: {
    currentOwnership: ProfileFieldState<'no-home' | 'owns-home'>;
    previousOwnership: ProfileFieldState<boolean>;
    householdHasHome: ProfileFieldState<boolean>;
    householdDisqualifyingPreviousOwnership: ProfileFieldState<boolean>;
    hasSpecialSupplyRestriction: ProfileFieldState<boolean>;
  };
  household: { memberCount: ProfileFieldState<number> };
  family: {
    marriageStatus: ProfileFieldState<'single' | 'married'>;
    marriageYears: ProfileFieldState<number>;
    childrenCount: ProfileFieldState<number>;
    childBirthYears: ProfileFieldState<number[]>;
  };
  income: {
    annualRange: ProfileFieldState<IncomeRange>;
    workOrBusinessIncomeEligible: ProfileFieldState<boolean>;
    incomeTaxPaymentYears: ProfileFieldState<number>;
  };
  assets: {
    financial: ProfileFieldState<AmountRange>;
    realEstate: ProfileFieldState<AmountRange>;
    vehicle: ProfileFieldState<AmountRange>;
    debt: ProfileFieldState<AmountRange>;
  };
};

export type ProfileQuestionBundleId =
  | 'BASIC'
  | 'RESIDENCE'
  | 'SUBSCRIPTION_ACCOUNT'
  | 'HOUSING_HISTORY'
  | 'HOUSEHOLD'
  | 'FAMILY'
  | 'INCOME'
  | 'ASSETS'
  | 'PREFERENCES';

export type ProfileQuestionBundle = {
  id: ProfileQuestionBundleId;
  title: string;
  description: string;
  fields: readonly string[];
  estimatedQuestionCount: number;
  reason: string;
  benefit: string;
};

export const unknownField = <T>(): ProfileFieldState<T> => ({ status: 'unknown' });
export const knownField = <T>(value: T): ProfileFieldState<T> => ({ status: 'known', value });
export const notApplicableField = <T>(): ProfileFieldState<T> => ({ status: 'not_applicable' });

export const PROFILE_BUNDLES: readonly ProfileQuestionBundle[] = [
  {
    id: 'BASIC',
    title: '기본 정보',
    description: '나이와 현재 상황을 확인해요.',
    fields: ['name', 'age', 'occupation'],
    estimatedQuestionCount: 3,
    reason: '연령대와 현재 상황에 맞는 설명을 제공하는 데 필요해요.',
    benefit: '또래 기준 설명을 더 자연스럽게 볼 수 있어요.',
  },
  {
    id: 'RESIDENCE',
    title: '거주 정보',
    description: '현재 거주지역을 확인해요.',
    fields: ['currentRegion'],
    estimatedQuestionCount: 1,
    reason: '지역에 따라 확인해야 할 공고와 주거 소식이 달라져요.',
    benefit: '지역 관련 공고를 더 정확하게 살펴볼 수 있어요.',
  },
  {
    id: 'SUBSCRIPTION_ACCOUNT',
    title: '청약통장',
    description: '통장 보유와 유지 상태를 함께 확인해요.',
    fields: ['hasAccount', 'accountMonths', 'monthlyPayment'],
    estimatedQuestionCount: 3,
    reason: '준비도와 미래 변화는 통장 유지 정보를 바탕으로 계산해요.',
    benefit: 'Future와 준비도 변화를 더 정확하게 볼 수 있어요.',
  },
  {
    id: 'HOUSING_HISTORY',
    title: '주택 이력',
    description: '본인·세대의 주택 보유와 특별공급 이력을 확인해요.',
    fields: ['currentOwnership', 'previousOwnership', 'householdHasHome', 'householdDisqualifyingPreviousOwnership', 'hasSpecialSupplyRestriction'],
    estimatedQuestionCount: 5,
    reason: '일부 공급 유형은 본인과 세대의 주택 이력을 함께 확인해요.',
    benefit: '향후 생애최초·특별공급 분석에 재사용할 수 있어요.',
  },
  {
    id: 'HOUSEHOLD',
    title: '세대 정보',
    description: '현재 함께 사는 세대 규모를 확인해요.',
    fields: ['memberCount'],
    estimatedQuestionCount: 1,
    reason: '공급 유형에 따라 세대 정보 확인이 필요할 수 있어요.',
    benefit: '가구 조건이 필요한 분석을 준비할 수 있어요.',
  },
  {
    id: 'FAMILY',
    title: '가족 정보',
    description: '혼인과 자녀 정보를 한 번에 확인해요.',
    fields: ['marriageStatus', 'marriageYears', 'childrenCount', 'childBirthYears'],
    estimatedQuestionCount: 4,
    reason: '신혼부부·다자녀 등 가족 관련 공급을 살펴볼 때 필요해요.',
    benefit: '한 번 입력하면 가족 관련 분석에서 다시 묻지 않아요.',
  },
  {
    id: 'INCOME',
    title: '소득',
    description: '소득 범위와 근로·사업소득세 이력을 확인해요.',
    fields: ['annualRange', 'workOrBusinessIncomeEligible', 'incomeTaxPaymentYears'],
    estimatedQuestionCount: 3,
    reason: '생애최초는 공고별 소득 기준과 근로·사업소득세 납부 이력을 함께 확인해요.',
    benefit: '소득세 기본조건과 공고에서 확인할 소득 기준을 나눠 볼 수 있어요.',
  },
  {
    id: 'ASSETS',
    // 소득은 INCOME bundle 이 따로 묻는다. 제목에 소득을 넣으면 여기서 묻는 것처럼 읽힌다.
    title: '자산 정보',
    description: '금융자산·부동산·차량·부채를 범위로 확인해요.',
    fields: ['financial', 'realEstate', 'vehicle', 'debt'],
    estimatedQuestionCount: 4,
    reason: '일부 공급 유형은 자산 기준을 함께 확인해요. 정확한 금액은 받지 않아요.',
    benefit: '향후 자산 기준이 있는 분석을 더 정확하게 볼 수 있어요.',
  },
  {
    id: 'PREFERENCES',
    title: '관심지역',
    description: '관심 있는 지역을 함께 저장해요.',
    fields: ['regions'],
    estimatedQuestionCount: 1,
    reason: '보고 싶은 공고와 지역 소식을 먼저 보여드리는 데 사용해요.',
    benefit: '청약찾기 개인화가 더 정확해져요.',
  },
] as const;

export type ProfileFeature =
  | 'home'
  | 'preparation'
  | 'future'
  | 'ai'
  | 'discovery'
  | 'first-home'
  | 'newlywed'
  | 'multi-child';

const FEATURE_REQUIREMENTS: Record<
  ProfileFeature,
  { required: readonly ProfileQuestionBundleId[]; optional: readonly ProfileQuestionBundleId[] }
> = {
  home: { required: ['BASIC', 'RESIDENCE'], optional: ['SUBSCRIPTION_ACCOUNT', 'HOUSING_HISTORY'] },
  preparation: { required: ['BASIC'], optional: ['SUBSCRIPTION_ACCOUNT', 'HOUSING_HISTORY'] },
  future: { required: ['SUBSCRIPTION_ACCOUNT'], optional: ['BASIC', 'HOUSING_HISTORY'] },
  ai: { required: ['BASIC'], optional: ['RESIDENCE', 'SUBSCRIPTION_ACCOUNT', 'HOUSING_HISTORY'] },
  discovery: { required: ['RESIDENCE', 'PREFERENCES'], optional: ['HOUSING_HISTORY'] },
  'first-home': {
    required: ['HOUSING_HISTORY', 'SUBSCRIPTION_ACCOUNT', 'INCOME', 'ASSETS', 'HOUSEHOLD', 'FAMILY'],
    optional: [],
  },
  newlywed: { required: ['FAMILY'], optional: ['INCOME', 'ASSETS'] },
  'multi-child': { required: ['FAMILY', 'HOUSEHOLD'], optional: ['INCOME', 'ASSETS'] },
};

export type PromptFatigueState = {
  shownBundleIds: ProfileQuestionBundleId[];
  dismissedBundleIds: ProfileQuestionBundleId[];
  automaticPromptUsed: boolean;
};

export const createPromptFatigueState = (): PromptFatigueState => ({
  shownBundleIds: [],
  dismissedBundleIds: [],
  automaticPromptUsed: false,
});

export function recordBundleShown(
  state: PromptFatigueState,
  bundleId: ProfileQuestionBundleId,
): PromptFatigueState {
  return {
    ...state,
    automaticPromptUsed: true,
    shownBundleIds: [...new Set([...state.shownBundleIds, bundleId])],
  };
}

export function recordBundleDismissed(
  state: PromptFatigueState,
  bundleId: ProfileQuestionBundleId,
): PromptFatigueState {
  return {
    ...state,
    automaticPromptUsed: true,
    dismissedBundleIds: [...new Set([...state.dismissedBundleIds, bundleId])],
  };
}

export function createApplicantProfileFromLegacy(profile: UserProfile): ApplicantProfileV2 {
  const hasAccount = Boolean(profile.hasSubscriptionAccount);
  return {
    version: 2,
    basic: {
      name: profile.name.trim(),
      age: clampInt(profile.age, 15, 99),
      occupation: knownField(isOccupation(profile.occupation) ? profile.occupation : 'etc'),
    },
    residence: { currentRegion: profile.region.trim() },
    preferences: { regions: profile.region.trim() ? [profile.region.trim()] : [] },
    subscriptionAccount: {
      hasAccount: knownField(hasAccount),
      accountMonths: hasAccount
        ? knownField(clampInt(profile.accountMonths, 0, 600))
        : notApplicableField(),
      monthlyPayment: hasAccount
        ? knownField(clampInt(profile.monthlyPayment, 0, 5_000_000))
        : notApplicableField(),
    },
    housing: {
      currentOwnership: knownField(profile.isNoHomeOwner ? 'no-home' : 'owns-home'),
      previousOwnership: unknownField(),
      householdHasHome: unknownField(),
      householdDisqualifyingPreviousOwnership: unknownField(),
      hasSpecialSupplyRestriction: unknownField(),
    },
    household: { memberCount: unknownField() },
    family: {
      marriageStatus: unknownField(),
      marriageYears: unknownField(),
      childrenCount: unknownField(),
      childBirthYears: unknownField(),
    },
    income: {
      annualRange: unknownField(),
      workOrBusinessIncomeEligible: unknownField(),
      incomeTaxPaymentYears: unknownField(),
    },
    assets: {
      financial: unknownField(),
      realEstate: unknownField(),
      vehicle: unknownField(),
      debt: unknownField(),
    },
  };
}

export function createMinimalApplicantProfile(input: {
  name: string;
  age: number;
  currentRegion: string;
  preferredRegions: string[];
}): ApplicantProfileV2 {
  const legacy: UserProfile = {
    name: input.name.trim() || '완판이',
    age: clampInt(input.age, 15, 99),
    occupation: 'etc',
    region: input.currentRegion.trim(),
    hasSubscriptionAccount: false,
    accountMonths: 0,
    monthlyPayment: 0,
    isNoHomeOwner: false,
  };
  const profile = createApplicantProfileFromLegacy(legacy);
  return {
    ...profile,
    basic: { ...profile.basic, occupation: unknownField() },
    preferences: {
      regions: uniqueStrings(input.preferredRegions.length ? input.preferredRegions : [input.currentRegion]),
    },
    subscriptionAccount: {
      hasAccount: unknownField(),
      accountMonths: unknownField(),
      monthlyPayment: unknownField(),
    },
    housing: {
      currentOwnership: unknownField(),
      previousOwnership: unknownField(),
      householdHasHome: unknownField(),
      householdDisqualifyingPreviousOwnership: unknownField(),
      hasSpecialSupplyRestriction: unknownField(),
    },
  };
}

export function migrateApplicantProfile(
  input: unknown,
  fallback: UserProfile,
): ApplicantProfileV2 {
  if (!isRecord(input)) return createApplicantProfileFromLegacy(fallback);
  if (input.version !== 2) {
    return createApplicantProfileFromLegacy(normalizeLegacyInput(input, fallback));
  }

  const base = createApplicantProfileFromLegacy(fallback);
  const basic = isRecord(input.basic) ? input.basic : {};
  const residence = isRecord(input.residence) ? input.residence : {};
  const preferences = isRecord(input.preferences) ? input.preferences : {};
  const subscription = isRecord(input.subscriptionAccount) ? input.subscriptionAccount : {};
  const housing = isRecord(input.housing) ? input.housing : {};
  const household = isRecord(input.household) ? input.household : {};
  const family = isRecord(input.family) ? input.family : {};
  const income = isRecord(input.income) ? input.income : {};
  const assets = isRecord(input.assets) ? input.assets : {};

  return {
    version: 2,
    basic: {
      name: readString(basic.name, base.basic.name),
      age: clampInt(readNumber(basic.age, base.basic.age), 15, 99),
      occupation: readField(basic.occupation, isOccupation),
    },
    residence: { currentRegion: readString(residence.currentRegion, base.residence.currentRegion) },
    preferences: {
      regions: Array.isArray(preferences.regions)
        ? uniqueStrings(preferences.regions.filter((value): value is string => typeof value === 'string'))
        : base.preferences.regions,
    },
    subscriptionAccount: {
      hasAccount: readField(subscription.hasAccount, isBoolean),
      accountMonths: readField(subscription.accountMonths, isFiniteNumber),
      monthlyPayment: readField(subscription.monthlyPayment, isFiniteNumber),
    },
    housing: {
      currentOwnership: readField(housing.currentOwnership, isOwnership),
      previousOwnership: readField(housing.previousOwnership, isBoolean),
      householdHasHome: readField(housing.householdHasHome, isBoolean),
      householdDisqualifyingPreviousOwnership: readField(housing.householdDisqualifyingPreviousOwnership, isBoolean),
      hasSpecialSupplyRestriction: readField(housing.hasSpecialSupplyRestriction, isBoolean),
    },
    household: { memberCount: readField(household.memberCount, isFiniteNumber) },
    family: {
      marriageStatus: readField(family.marriageStatus, isMarriageStatus),
      marriageYears: readField(family.marriageYears, isFiniteNumber),
      childrenCount: readField(family.childrenCount, isFiniteNumber),
      childBirthYears: readField(family.childBirthYears, isNumberArray),
    },
    income: {
      annualRange: readField(income.annualRange, isIncomeRange),
      workOrBusinessIncomeEligible: readField(income.workOrBusinessIncomeEligible, isBoolean),
      incomeTaxPaymentYears: readField(income.incomeTaxPaymentYears, isFiniteNumber),
    },
    assets: {
      financial: readField(assets.financial, isAmountRange),
      realEstate: readField(assets.realEstate, isAmountRange),
      vehicle: readField(assets.vehicle, isAmountRange),
      debt: readField(assets.debt, isAmountRange),
    },
  };
}

/**
 * 기존 MVP 계산식(준비도·Future·Discovery relevance)에 넘기기 위한 compatibility adapter.
 * 기존 계산식은 unknown 을 모르므로 여기서 한 번만 fallback 을 정한다.
 *
 * fallback 방향은 항상 "단정하지 않는 쪽"이다.
 * - 통장 unknown  → hasSubscriptionAccount: false. 모르는 통장을 점수로 인정하지 않는다.
 * - 주택 unknown  → isNoHomeOwner: false. 모르는 상태를 무주택이라고 주장하지 않는다.
 * - 직업 unknown  → 'etc'. 학생 전용 가중치를 임의로 주지 않는다.
 *
 * 그래서 unknown 은 점수를 깎기만 하고 거짓을 표시하지는 않는다.
 * 화면은 이 값을 "없음"으로 쓰지 말고 hasCoreProfileForCalculations 로 "확인 필요"를 구분한다.
 */
export function toLegacyUserProfile(profile: ApplicantProfileV2): UserProfile {
  const hasAccount = knownValue(profile.subscriptionAccount.hasAccount) === true;
  const ownership = knownValue(profile.housing.currentOwnership);
  return {
    name: profile.basic.name.trim() || '완판이',
    age: clampInt(profile.basic.age, 15, 99),
    occupation: knownValue(profile.basic.occupation) ?? 'etc',
    region: profile.residence.currentRegion.trim(),
    hasSubscriptionAccount: hasAccount,
    accountMonths: hasAccount
      ? clampInt(knownValue(profile.subscriptionAccount.accountMonths) ?? 0, 0, 600)
      : 0,
    monthlyPayment: hasAccount
      ? clampInt(knownValue(profile.subscriptionAccount.monthlyPayment) ?? 0, 0, 5_000_000)
      : 0,
    isNoHomeOwner: ownership === 'no-home',
  };
}

/** Discovery relevance에는 기존 대표 region과 전체 관심지역을 함께 전달한다. */
export function toDiscoveryUserProfile(
  profile: ApplicantProfileV2,
): UserProfile & { preferredRegions: string[] } {
  return {
    ...toLegacyUserProfile(profile),
    region: profile.preferences.regions[0] ?? profile.residence.currentRegion,
    preferredRegions: [...profile.preferences.regions],
  };
}

export function knownValue<T>(field: ProfileFieldState<T>): T | undefined {
  return field.status === 'known' ? field.value : undefined;
}

/**
 * 준비도·미래 수치를 그대로 보여주거나 AI 설명 맥락에 넣어도 되는 최소 조건.
 *
 * 통장과 주택 상태가 unknown 이면 legacy adapter 가 false/0 으로 메운 값이고,
 * 그 위에서 계산한 숫자는 "통장 없음 / 주택 보유"를 단정한 결과가 된다.
 * 화면은 그 상태를 "확인 필요"로 표시하고, AI 에는 아예 넘기지 않는다.
 */
export function hasCoreProfileForCalculations(profile: ApplicantProfileV2): boolean {
  return (
    profile.subscriptionAccount.hasAccount.status === 'known' &&
    profile.housing.currentOwnership.status === 'known'
  );
}

export type BundleCompletion = 'complete' | 'partial' | 'missing';

export function getBundleProgress(
  profile: ApplicantProfileV2,
  bundleId: ProfileQuestionBundleId,
): number {
  const known = (field: ProfileFieldState<unknown>) => field.status !== 'unknown';
  switch (bundleId) {
    case 'BASIC':
      return ratio([Boolean(profile.basic.name.trim()), profile.basic.age >= 15, known(profile.basic.occupation)]);
    case 'RESIDENCE':
      return profile.residence.currentRegion.trim() ? 1 : 0;
    case 'PREFERENCES':
      return profile.preferences.regions.length > 0 ? 1 : 0;
    case 'SUBSCRIPTION_ACCOUNT': {
      const hasAccount = knownValue(profile.subscriptionAccount.hasAccount);
      if (hasAccount === undefined) return 0;
      if (!hasAccount) return 1;
      return ratio([
        true,
        known(profile.subscriptionAccount.accountMonths),
        known(profile.subscriptionAccount.monthlyPayment),
      ]);
    }
    case 'HOUSING_HISTORY':
      return ratio([
        known(profile.housing.currentOwnership),
        known(profile.housing.previousOwnership),
        known(profile.housing.householdHasHome),
        known(profile.housing.householdDisqualifyingPreviousOwnership),
        known(profile.housing.hasSpecialSupplyRestriction),
      ]);
    case 'HOUSEHOLD':
      return known(profile.household.memberCount) ? 1 : 0;
    case 'FAMILY': {
      const marriage = knownValue(profile.family.marriageStatus);
      const children = knownValue(profile.family.childrenCount);
      const childBirthYears = knownValue(profile.family.childBirthYears);
      const answers = [marriage !== undefined, children !== undefined];
      if (marriage === 'married') answers.push(known(profile.family.marriageYears));
      if ((children ?? 0) > 0) answers.push(childBirthYears?.length === children);
      return ratio(answers);
    }
    case 'INCOME':
      return ratio([
        known(profile.income.annualRange),
        known(profile.income.workOrBusinessIncomeEligible),
        known(profile.income.incomeTaxPaymentYears),
      ]);
    case 'ASSETS':
      return ratio([
        known(profile.assets.financial),
        known(profile.assets.realEstate),
        known(profile.assets.vehicle),
        known(profile.assets.debt),
      ]);
  }
}

export function getBundleCompletion(
  profile: ApplicantProfileV2,
  bundleId: ProfileQuestionBundleId,
): BundleCompletion {
  const progress = getBundleProgress(profile, bundleId);
  return progress === 1 ? 'complete' : progress > 0 ? 'partial' : 'missing';
}

export function calculateProfileCompleteness(profile: ApplicantProfileV2): number {
  const progress = PROFILE_BUNDLES.reduce(
    (sum, bundle) => sum + getBundleProgress(profile, bundle.id),
    0,
  );
  return Math.round((progress / PROFILE_BUNDLES.length) * 100);
}

export function getFeatureProfileRequirements(
  feature: ProfileFeature,
  profile: ApplicantProfileV2,
): {
  known: ProfileQuestionBundleId[];
  optional: ProfileQuestionBundleId[];
  missing: ProfileQuestionBundleId[];
} {
  const requirement = FEATURE_REQUIREMENTS[feature];
  return {
    known: requirement.required.filter((id) => getBundleCompletion(profile, id) === 'complete'),
    missing: requirement.required.filter((id) => getBundleCompletion(profile, id) !== 'complete'),
    optional: requirement.optional.filter((id) => getBundleCompletion(profile, id) !== 'complete'),
  };
}

export function resolveFeaturePrompt(
  feature: ProfileFeature,
  profile: ApplicantProfileV2,
  fatigue: PromptFatigueState,
): ProfileQuestionBundleId | null {
  if (fatigue.automaticPromptUsed) return null;
  const next = getFeatureProfileRequirements(feature, profile).missing[0];
  if (!next) return null;
  if (fatigue.shownBundleIds.includes(next) || fatigue.dismissedBundleIds.includes(next)) return null;
  return next;
}

export function getKnownApplicantSignals(profile: ApplicantProfileV2) {
  return {
    name: profile.basic.name.trim() || undefined,
    age: profile.basic.age,
    occupation: knownValue(profile.basic.occupation),
    currentRegion: profile.residence.currentRegion.trim() || undefined,
    preferredRegions: profile.preferences.regions,
    hasSubscriptionAccount: knownValue(profile.subscriptionAccount.hasAccount),
    accountMonths: knownValue(profile.subscriptionAccount.accountMonths),
    monthlyPayment: knownValue(profile.subscriptionAccount.monthlyPayment),
    housingStatus: knownValue(profile.housing.currentOwnership),
    previousHomeOwnership: knownValue(profile.housing.previousOwnership),
    householdHasHome: knownValue(profile.housing.householdHasHome),
    householdDisqualifyingPreviousHomeOwnership: knownValue(profile.housing.householdDisqualifyingPreviousOwnership),
    hasSpecialSupplyRestriction: knownValue(profile.housing.hasSpecialSupplyRestriction),
    householdMemberCount: knownValue(profile.household.memberCount),
    marriageStatus: knownValue(profile.family.marriageStatus),
    marriageYears: knownValue(profile.family.marriageYears),
    childrenCount: knownValue(profile.family.childrenCount),
    childBirthYears: knownValue(profile.family.childBirthYears),
    incomeRange: knownValue(profile.income.annualRange),
    workOrBusinessIncomeEligible: knownValue(profile.income.workOrBusinessIncomeEligible),
    incomeTaxPaymentYears: knownValue(profile.income.incomeTaxPaymentYears),
    financialAssetRange: knownValue(profile.assets.financial),
    realEstateRange: knownValue(profile.assets.realEstate),
    vehicleRange: knownValue(profile.assets.vehicle),
    debtRange: knownValue(profile.assets.debt),
  };
}

function normalizeLegacyInput(input: Record<string, unknown>, fallback: UserProfile): UserProfile {
  return {
    name: readString(input.name, fallback.name),
    age: clampInt(readNumber(input.age, fallback.age), 15, 99),
    occupation: isOccupation(input.occupation) ? input.occupation : fallback.occupation,
    region: readString(input.region, fallback.region),
    hasSubscriptionAccount:
      typeof input.hasSubscriptionAccount === 'boolean'
        ? input.hasSubscriptionAccount
        : fallback.hasSubscriptionAccount,
    accountMonths: clampInt(readNumber(input.accountMonths, fallback.accountMonths), 0, 600),
    monthlyPayment: clampInt(readNumber(input.monthlyPayment, fallback.monthlyPayment), 0, 5_000_000),
    isNoHomeOwner:
      typeof input.isNoHomeOwner === 'boolean' ? input.isNoHomeOwner : fallback.isNoHomeOwner,
  };
}

function readField<T>(input: unknown, validate: (value: unknown) => value is T): ProfileFieldState<T> {
  if (!isRecord(input)) return unknownField();
  if (input.status === 'not_applicable') return notApplicableField();
  if (input.status === 'known' && validate(input.value)) return knownField(input.value);
  return unknownField();
}

function ratio(values: boolean[]): number {
  return values.length === 0 ? 0 : values.filter(Boolean).length / values.length;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(Number.isFinite(value) ? value : min)));
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback.trim();
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isFiniteNumber);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isOccupation(value: unknown): value is Occupation {
  return value === 'student' || value === 'worker' || value === 'etc';
}

function isOwnership(value: unknown): value is 'no-home' | 'owns-home' {
  return value === 'no-home' || value === 'owns-home';
}

function isMarriageStatus(value: unknown): value is 'single' | 'married' {
  return value === 'single' || value === 'married';
}

function isAmountRange(value: unknown): value is AmountRange {
  return ['under-10m', '10m-30m', '30m-50m', '50m-100m', 'over-100m'].includes(String(value));
}

function isIncomeRange(value: unknown): value is IncomeRange {
  return ['under-30m', '30m-50m', '50m-70m', '70m-100m', 'over-100m'].includes(String(value));
}
