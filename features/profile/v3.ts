import type { Occupation } from '../../domain/types.ts';
import type {
  AmountRange,
  ApplicantProfileV2,
  IncomeRange,
  ProfileFieldState,
} from './domain.ts';

export type ProfileFactState = 'KNOWN' | 'UNKNOWN' | 'NOT_APPLICABLE';
export type ProfileFactSource = 'USER' | 'MIGRATED_V2' | 'IMPORTED';

type FactMetadata = {
  observedAt?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  source?: ProfileFactSource;
};

/**
 * 공고와 무관하게 재사용할 수 있는 사용자 사실이다.
 * UNKNOWN/NOT_APPLICABLE에는 value를 허용하지 않아, 모르는 값을 0/false로 저장하지 않는다.
 */
export type ProfileFact<T> =
  | (FactMetadata & { state: 'KNOWN'; value: T })
  | (FactMetadata & { state: 'UNKNOWN'; value?: never })
  | (FactMetadata & { state: 'NOT_APPLICABLE'; value?: never });

export type DatePrecision = 'DAY' | 'MONTH' | 'YEAR';
export type PartialDate = { value: string; precision: DatePrecision };

export type OverseasStay = {
  startDate: PartialDate;
  endDate?: PartialDate;
  ongoing?: boolean;
  reason?: string;
};

export type HouseholdMember = {
  id: string;
  relationship: string;
  birthDate: ProfileFact<PartialDate>;
  livesTogether: ProfileFact<boolean>;
};

export type ChildProfile = {
  id: string;
  status: 'BORN' | 'UNBORN' | 'ADOPTED';
  birthDate: ProfileFact<PartialDate>;
};

export type HousingOwnershipEvent = {
  holder: 'APPLICANT' | 'SPOUSE' | 'HOUSEHOLD_MEMBER';
  acquiredAt: ProfileFact<PartialDate>;
  disposedAt: ProfileFact<PartialDate>;
};

export type SpecialSupplyEvent = {
  awardedAt: ProfileFact<PartialDate>;
  supplyType: ProfileFact<string>;
  outcome: 'AWARDED' | 'CANCELLED';
};

export type ReWinningRestrictionPeriod = {
  startedAt: ProfileFact<PartialDate>;
  endsAt: ProfileFact<PartialDate>;
  reason: ProfileFact<string>;
};

export type ApplicantProfileV3 = {
  version: 3;
  /** 사용자 fact가 바뀔 때 저장소가 증가시키는 optimistic revision. */
  revision: number;
  identity: {
    displayName: ProfileFact<string>;
    birthDate: ProfileFact<PartialDate>;
    occupation: ProfileFact<Occupation>;
  };
  /** Optional for backward-compatible reads of profiles written before rental eligibility facts existed. */
  education?: {
    status: ProfileFact<'ENROLLED_OR_INCOMING' | 'GRADUATED_OR_WITHDRAWN' | 'OTHER'>;
    graduationDate: ProfileFact<PartialDate>;
    schoolRegion: ProfileFact<string>;
  };
  residence: {
    currentRegion: ProfileFact<string>;
    startedAt: ProfileFact<PartialDate>;
    overseasStays: ProfileFact<OverseasStay[]>;
  };
  preferences: { regions: string[] };
  subscriptionAccount: {
    hasAccount: ProfileFact<boolean>;
    kind: ProfileFact<'HOUSING_SUBSCRIPTION' | 'SUBSCRIPTION_SAVINGS' | 'OTHER'>;
    openedAt: ProfileFact<PartialDate>;
    monthlyPaymentAmount: ProfileFact<number>;
    recognizedPaymentCount: ProfileFact<number>;
    recognizedPaymentCountAsOf: ProfileFact<PartialDate>;
    recognizedDepositAmount: ProfileFact<number>;
    firstRank: ProfileFact<boolean>;
    /** V2의 개월 수는 가입일로 역산하지 않고 호환 요약값으로만 보존한다. */
    legacyAccountMonths: ProfileFact<number>;
  };
  housing: {
    currentOwnership: ProfileFact<'no-home' | 'owns-home'>;
    previousOwnership: ProfileFact<boolean>;
    householdHasHome: ProfileFact<boolean>;
    householdDisqualifyingPreviousOwnership: ProfileFact<boolean>;
    hasSpecialSupplyRestriction: ProfileFact<boolean>;
    ownershipHistory: ProfileFact<HousingOwnershipEvent[]>;
    specialSupplyHistory: ProfileFact<SpecialSupplyEvent[]>;
    reWinningRestrictionHistory: ProfileFact<ReWinningRestrictionPeriod[]>;
    currentReWinningRestriction: ProfileFact<boolean>;
  };
  household: {
    memberCount: ProfileFact<number>;
    members: ProfileFact<HouseholdMember[]>;
    isHouseholdHead: ProfileFact<boolean>;
  };
  family: {
    marriageStatus: ProfileFact<'single' | 'married'>;
    marriageDate: ProfileFact<PartialDate>;
    firstMarriageDate: ProfileFact<PartialDate>;
    childrenCount: ProfileFact<number>;
    children: ProfileFact<ChildProfile[]>;
    /** V2의 연수는 혼인일로 역산하지 않고 호환 요약값으로만 보존한다. */
    legacyMarriageYears: ProfileFact<number>;
  };
  income: {
    annualRange: ProfileFact<IncomeRange>;
    monthlyApplicantIncome: ProfileFact<number>;
    monthlySpouseIncome: ProfileFact<number>;
    monthlyHouseholdIncome: ProfileFact<number>;
    amountAsOf: ProfileFact<PartialDate>;
    dualIncome: ProfileFact<boolean>;
    workStartedAt: ProfileFact<PartialDate>;
    workOrBusinessIncomeEligible: ProfileFact<boolean>;
    incomeTaxPaymentYears: ProfileFact<number>;
    incomeSourceRegion?: ProfileFact<string>;
    youthActivityCategory?: ProfileFact<'WORKER' | 'RECENTLY_UNEMPLOYED' | 'ARTIST' | 'OTHER'>;
    totalIncomeWorkMonths?: ProfileFact<number>;
    parentApplicantMonthlyIncome?: ProfileFact<number>;
  };
  assets: {
    financialRange: ProfileFact<AmountRange>;
    realEstateRange: ProfileFact<AmountRange>;
    vehicleRange: ProfileFact<AmountRange>;
    debtRange: ProfileFact<AmountRange>;
    totalApplicantAssets: ProfileFact<number>;
    parentAssets: ProfileFact<number>;
    householdRealEstateAssets: ProfileFact<number>;
    vehicleValue: ProfileFact<number>;
    financialAssets: ProfileFact<number>;
    debtAmount: ProfileFact<number>;
    amountAsOf: ProfileFact<PartialDate>;
  };
  benefits?: {
    housingBenefitRecipient: ProfileFact<boolean>;
  };
};

export type ApplicantProfileV2MigrationOptions = {
  source: 'PERSISTED_USER' | 'DEMO_SEED';
  observedAt?: string;
};

export const knownProfileFact = <T>(value: T, metadata: FactMetadata = {}): ProfileFact<T> => ({
  state: 'KNOWN',
  value,
  ...metadata,
});

export const unknownProfileFact = <T>(metadata: FactMetadata = {}): ProfileFact<T> => ({
  state: 'UNKNOWN',
  ...metadata,
});

export const notApplicableProfileFact = <T>(metadata: FactMetadata = {}): ProfileFact<T> => ({
  state: 'NOT_APPLICABLE',
  ...metadata,
});

export const profileFactValue = <T>(fact: ProfileFact<T>): T | undefined =>
  fact.state === 'KNOWN' ? fact.value : undefined;

const unknowns = <T>(metadata: FactMetadata) => unknownProfileFact<T>(metadata);

export function createEmptyApplicantProfileV3(): ApplicantProfileV3 {
  const metadata: FactMetadata = {};
  return {
    version: 3,
    revision: 0,
    identity: {
      displayName: unknowns(metadata),
      birthDate: unknowns(metadata),
      occupation: unknowns(metadata),
    },
    education: {
      status: unknowns(metadata),
      graduationDate: unknowns(metadata),
      schoolRegion: unknowns(metadata),
    },
    residence: {
      currentRegion: unknowns(metadata),
      startedAt: unknowns(metadata),
      overseasStays: unknowns(metadata),
    },
    preferences: { regions: [] },
    subscriptionAccount: {
      hasAccount: unknowns(metadata),
      kind: unknowns(metadata),
      openedAt: unknowns(metadata),
      monthlyPaymentAmount: unknowns(metadata),
      recognizedPaymentCount: unknowns(metadata),
      recognizedPaymentCountAsOf: unknowns(metadata),
      recognizedDepositAmount: unknowns(metadata),
      firstRank: unknowns(metadata),
      legacyAccountMonths: unknowns(metadata),
    },
    housing: {
      currentOwnership: unknowns(metadata),
      previousOwnership: unknowns(metadata),
      householdHasHome: unknowns(metadata),
      householdDisqualifyingPreviousOwnership: unknowns(metadata),
      hasSpecialSupplyRestriction: unknowns(metadata),
      ownershipHistory: unknowns(metadata),
      specialSupplyHistory: unknowns(metadata),
      reWinningRestrictionHistory: unknowns(metadata),
      currentReWinningRestriction: unknowns(metadata),
    },
    household: {
      memberCount: unknowns(metadata),
      members: unknowns(metadata),
      isHouseholdHead: unknowns(metadata),
    },
    family: {
      marriageStatus: unknowns(metadata),
      marriageDate: unknowns(metadata),
      firstMarriageDate: unknowns(metadata),
      childrenCount: unknowns(metadata),
      children: unknowns(metadata),
      legacyMarriageYears: unknowns(metadata),
    },
    income: {
      annualRange: unknowns(metadata),
      monthlyApplicantIncome: unknowns(metadata),
      monthlySpouseIncome: unknowns(metadata),
      monthlyHouseholdIncome: unknowns(metadata),
      amountAsOf: unknowns(metadata),
      dualIncome: unknowns(metadata),
      workStartedAt: unknowns(metadata),
      workOrBusinessIncomeEligible: unknowns(metadata),
      incomeTaxPaymentYears: unknowns(metadata),
      incomeSourceRegion: unknowns(metadata),
      youthActivityCategory: unknowns(metadata),
      totalIncomeWorkMonths: unknowns(metadata),
      parentApplicantMonthlyIncome: unknowns(metadata),
    },
    assets: {
      financialRange: unknowns(metadata),
      realEstateRange: unknowns(metadata),
      vehicleRange: unknowns(metadata),
      debtRange: unknowns(metadata),
      totalApplicantAssets: unknowns(metadata),
      parentAssets: unknowns(metadata),
      householdRealEstateAssets: unknowns(metadata),
      vehicleValue: unknowns(metadata),
      financialAssets: unknowns(metadata),
      debtAmount: unknowns(metadata),
      amountAsOf: unknowns(metadata),
    },
    benefits: { housingBenefitRecipient: unknowns(metadata) },
  };
}

const migratedFact = <T>(field: ProfileFieldState<T>, metadata: FactMetadata): ProfileFact<T> => {
  if (field.status === 'known') return knownProfileFact(field.value, metadata);
  if (field.status === 'not_applicable') return notApplicableProfileFact(metadata);
  return unknownProfileFact(metadata);
};

/**
 * V2가 실제 사용자 저장값이라는 provenance가 있을 때만 이관한다.
 * 데모 기본값은 사용자 사실이 아니므로 전부 빈 V3로 분리한다.
 */
export function migrateApplicantProfileV2ToV3(
  profile: ApplicantProfileV2,
  options: ApplicantProfileV2MigrationOptions,
): ApplicantProfileV3 {
  if (options.source === 'DEMO_SEED') return createEmptyApplicantProfileV3();

  const metadata: FactMetadata = {
    source: 'MIGRATED_V2',
    ...(options.observedAt ? { observedAt: options.observedAt } : {}),
  };
  const out = createEmptyApplicantProfileV3();
  const birthDate = profile.basic.birthDate.status === 'known'
    ? knownProfileFact<PartialDate>({ value: profile.basic.birthDate.value, precision: 'DAY' }, metadata)
    : migratedFact<PartialDate>(profile.basic.birthDate as ProfileFieldState<PartialDate>, metadata);
  const children = profile.family.childBirthYears.status === 'known'
    ? knownProfileFact(
      profile.family.childBirthYears.value.map((year, index) => ({
        id: `migrated-child-${index + 1}`,
        status: 'BORN' as const,
        birthDate: knownProfileFact<PartialDate>({ value: String(year), precision: 'YEAR' }, metadata),
      })),
      metadata,
    )
    : migratedFact<ChildProfile[]>(profile.family.childBirthYears as ProfileFieldState<ChildProfile[]>, metadata);

  return {
    ...out,
    revision: 1,
    identity: {
      displayName: profile.basic.name.trim()
        ? knownProfileFact(profile.basic.name.trim(), metadata)
        : unknownProfileFact(metadata),
      birthDate,
      occupation: migratedFact(profile.basic.occupation, metadata),
    },
    residence: {
      currentRegion: profile.residence.currentRegion.trim()
        ? knownProfileFact(profile.residence.currentRegion.trim(), metadata)
        : unknownProfileFact(metadata),
      startedAt: unknownProfileFact(metadata),
      overseasStays: unknownProfileFact(metadata),
    },
    preferences: { regions: [...profile.preferences.regions] },
    subscriptionAccount: {
      ...out.subscriptionAccount,
      hasAccount: migratedFact(profile.subscriptionAccount.hasAccount, metadata),
      monthlyPaymentAmount: migratedFact(profile.subscriptionAccount.monthlyPayment, metadata),
      legacyAccountMonths: migratedFact(profile.subscriptionAccount.accountMonths, metadata),
    },
    housing: {
      ...out.housing,
      currentOwnership: migratedFact(profile.housing.currentOwnership, metadata),
      previousOwnership: migratedFact(profile.housing.previousOwnership, metadata),
      householdHasHome: migratedFact(profile.housing.householdHasHome, metadata),
      householdDisqualifyingPreviousOwnership: migratedFact(
        profile.housing.householdDisqualifyingPreviousOwnership,
        metadata,
      ),
      hasSpecialSupplyRestriction: migratedFact(profile.housing.hasSpecialSupplyRestriction, metadata),
    },
    household: {
      ...out.household,
      memberCount: migratedFact(profile.household.memberCount, metadata),
    },
    family: {
      ...out.family,
      marriageStatus: migratedFact(profile.family.marriageStatus, metadata),
      childrenCount: migratedFact(profile.family.childrenCount, metadata),
      children,
      legacyMarriageYears: migratedFact(profile.family.marriageYears, metadata),
    },
    income: {
      ...out.income,
      annualRange: migratedFact(profile.income.annualRange, metadata),
      workOrBusinessIncomeEligible: migratedFact(profile.income.workOrBusinessIncomeEligible, metadata),
      incomeTaxPaymentYears: migratedFact(profile.income.incomeTaxPaymentYears, metadata),
    },
    assets: {
      ...out.assets,
      financialRange: migratedFact(profile.assets.financial, metadata),
      realEstateRange: migratedFact(profile.assets.realEstate, metadata),
      vehicleRange: migratedFact(profile.assets.vehicle, metadata),
      debtRange: migratedFact(profile.assets.debt, metadata),
    },
  };
}
