import {
  knownField,
  notApplicableField,
  unknownField,
  type ApplicantProfileV2,
  type ProfileFieldState,
} from '../profile/domain.ts';
import {
  profileFactValue,
  type ApplicantProfileV3,
  type PartialDate,
  type ProfileFact,
} from '../profile/v3.ts';
import type { AssessmentInput, Child } from './types.ts';

export type V3AssessmentAdapterOptions = {
  /** 공고일. 정확한 생년월일에서 legacy age를 계산할 때만 사용한다. */
  announcementDate?: string | null;
  /** 공고·공급유형에만 속하는 입력은 영구 프로필과 분리해 마지막에 합친다. */
  announcementDetails?: AssessmentInput['details'];
};

const toV2Field = <T>(fact: ProfileFact<T>): ProfileFieldState<T> => {
  if (fact.state === 'KNOWN') return knownField(fact.value);
  if (fact.state === 'NOT_APPLICABLE') return notApplicableField();
  return unknownField();
};

const exactDate = (date: PartialDate | undefined): string | undefined =>
  date?.precision === 'DAY' ? date.value : undefined;

const partialDateBounds = (date: PartialDate | undefined): { earliest: string; latest: string } | undefined => {
  if (!date) return undefined;
  if (date.precision === 'DAY' && /^\d{4}-\d{2}-\d{2}$/.test(date.value)) {
    return { earliest: date.value, latest: date.value };
  }
  if (date.precision === 'YEAR' && /^\d{4}$/.test(date.value)) {
    return { earliest: `${date.value}-01-01`, latest: `${date.value}-12-31` };
  }
  if (date.precision === 'MONTH' && /^\d{4}-\d{2}$/.test(date.value)) {
    const [year, month] = date.value.split('-').map(Number);
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      earliest: `${date.value}-01`,
      latest: `${date.value}-${String(last).padStart(2, '0')}`,
    };
  }
  return undefined;
};

const ageAt = (birthDate: string | undefined, asOf: string | null | undefined): number => {
  if (!birthDate || !asOf) return 15;
  const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number);
  const [year, month, day] = asOf.split('-').map(Number);
  if (![birthYear, birthMonth, birthDay, year, month, day].every(Number.isFinite)) return 15;
  return Math.max(15, Math.min(99, year - birthYear - (month < birthMonth || (month === birthMonth && day < birthDay) ? 1 : 0)));
};

export function applicantProfileV2FromV3(profile: ApplicantProfileV3, announcementDate?: string | null): ApplicantProfileV2 {
  const birth = exactDate(profileFactValue(profile.identity.birthDate));
  return {
    version: 2,
    basic: {
      name: profileFactValue(profile.identity.displayName) ?? '',
      age: ageAt(birth, announcementDate),
      birthDate: birth ? knownField(birth) : unknownField(),
      occupation: toV2Field(profile.identity.occupation),
    },
    residence: { currentRegion: profileFactValue(profile.residence.currentRegion) ?? '' },
    preferences: { regions: [...profile.preferences.regions] },
    subscriptionAccount: {
      hasAccount: toV2Field(profile.subscriptionAccount.hasAccount),
      accountMonths: toV2Field(profile.subscriptionAccount.legacyAccountMonths),
      monthlyPayment: toV2Field(profile.subscriptionAccount.monthlyPaymentAmount),
    },
    housing: {
      currentOwnership: toV2Field(profile.housing.currentOwnership),
      previousOwnership: toV2Field(profile.housing.previousOwnership),
      householdHasHome: toV2Field(profile.housing.householdHasHome),
      householdDisqualifyingPreviousOwnership: toV2Field(
        profile.housing.householdDisqualifyingPreviousOwnership,
      ),
      hasSpecialSupplyRestriction: toV2Field(profile.housing.hasSpecialSupplyRestriction),
    },
    household: { memberCount: toV2Field(profile.household.memberCount) },
    family: {
      marriageStatus: toV2Field(profile.family.marriageStatus),
      marriageYears: toV2Field(profile.family.legacyMarriageYears),
      childrenCount: toV2Field(profile.family.childrenCount),
      childBirthYears: profile.family.children.state === 'KNOWN'
        ? knownField(profile.family.children.value.flatMap(child => {
          const date = profileFactValue(child.birthDate);
          return date?.precision === 'YEAR' ? [Number(date.value)] : [];
        }).filter(Number.isFinite))
        : profile.family.children.state === 'NOT_APPLICABLE' ? notApplicableField() : unknownField(),
    },
    income: {
      annualRange: toV2Field(profile.income.annualRange),
      workOrBusinessIncomeEligible: toV2Field(profile.income.workOrBusinessIncomeEligible),
      incomeTaxPaymentYears: toV2Field(profile.income.incomeTaxPaymentYears),
    },
    assets: {
      financial: toV2Field(profile.assets.financialRange),
      realEstate: toV2Field(profile.assets.realEstateRange),
      vehicle: toV2Field(profile.assets.vehicleRange),
      debt: toV2Field(profile.assets.debtRange),
    },
  };
}

const childDetails = (profile: ApplicantProfileV3): Child[] | undefined => {
  const children = profileFactValue(profile.family.children);
  if (!children) return undefined;
  return children.map(child => {
    const bounds = partialDateBounds(profileFactValue(child.birthDate));
    return {
      ...(bounds ? { birthDate: bounds.earliest, ...(bounds.latest !== bounds.earliest ? { birthDateLatest: bounds.latest } : {}) } : {}),
      unborn: child.status === 'UNBORN',
    };
  });
};

/**
 * V3 원시 facts를 현재 deterministic engine의 AssessmentInput으로 투영한다.
 * 공고별 target/priority/exception 값은 options.announcementDetails로만 주입한다.
 */
export function assessmentInputFromApplicantProfileV3(
  profile: ApplicantProfileV3,
  options: V3AssessmentAdapterOptions = {},
): AssessmentInput {
  const details: AssessmentInput['details'] = {};
  const assign = <K extends keyof AssessmentInput['details']>(key: K, value: AssessmentInput['details'][K] | undefined) => {
    if (value !== undefined) details[key] = value as never;
  };

  assign('birthDate', exactDate(profileFactValue(profile.identity.birthDate)));
  assign('currentResidence', profileFactValue(profile.residence.currentRegion));
  assign('residenceStartDate', exactDate(profileFactValue(profile.residence.startedAt)));
  const stays = profileFactValue(profile.residence.overseasStays);
  if (stays) {
    assign('overseasStayHistory', stays.flatMap(stay => {
      const startDate = exactDate(stay.startDate);
      if (!startDate) return [];
      const endDate = exactDate(stay.endDate);
      return [{ startDate, ...(endDate ? { endDate } : {}) }];
    }));
  }

  assign('marriageDate', exactDate(profileFactValue(profile.family.marriageDate)));
  assign('firstMarriageDate', exactDate(profileFactValue(profile.family.firstMarriageDate)));
  const marriage = profileFactValue(profile.family.marriageStatus);
  if (marriage) {
    assign('everMarried', marriage === 'married');
    assign('familyCategory', marriage === 'married' ? 'married' : undefined);
  }
  assign('children', childDetails(profile));
  const members = profileFactValue(profile.household.members);
  if (members) {
    assign('householdMembers', members.map(member => ({
      relationship: member.relationship,
      ...(exactDate(profileFactValue(member.birthDate)) ? { birthDate: exactDate(profileFactValue(member.birthDate)) } : {}),
    })));
  }
  assign('isHouseholdHead', profileFactValue(profile.household.isHouseholdHead));

  const ownership = profileFactValue(profile.housing.ownershipHistory);
  if (ownership) {
    const exact = ownership.flatMap(event => {
      const acquiredAt = exactDate(profileFactValue(event.acquiredAt));
      if (!acquiredAt) return [];
      const disposedAt = exactDate(profileFactValue(event.disposedAt));
      return [{ acquiredAt, ...(disposedAt ? { disposedAt } : {}) }];
    });
    assign('housingOwnershipHistory', exact);
    assign('housingDisposalDates', exact.flatMap(event => event.disposedAt ? [event.disposedAt] : []));
  }
  const specialSupplyHistory = profileFactValue(profile.housing.specialSupplyHistory);
  if (specialSupplyHistory) {
    assign('specialSupplyHistory', specialSupplyHistory.some(event => event.outcome === 'AWARDED'));
  }
  assign('reWinningRestriction', profileFactValue(profile.housing.currentReWinningRestriction));

  assign('subscriptionAccountOpenedAt', exactDate(profileFactValue(profile.subscriptionAccount.openedAt)));
  assign('recognizedPaymentCount', profileFactValue(profile.subscriptionAccount.recognizedPaymentCount));
  assign('recognizedDepositAmount', profileFactValue(profile.subscriptionAccount.recognizedDepositAmount));
  assign('firstRank', profileFactValue(profile.subscriptionAccount.firstRank));

  assign('monthlyIncome', profileFactValue(profile.income.monthlyApplicantIncome));
  assign('spouseIncome', profileFactValue(profile.income.monthlySpouseIncome));
  assign('householdIncome', profileFactValue(profile.income.monthlyHouseholdIncome));
  assign('dualIncome', profileFactValue(profile.income.dualIncome));
  assign('workStartedAt', exactDate(profileFactValue(profile.income.workStartedAt)));

  assign('totalAssets', profileFactValue(profile.assets.totalApplicantAssets));
  assign('parentAssets', profileFactValue(profile.assets.parentAssets));
  assign('realEstateAssets', profileFactValue(profile.assets.householdRealEstateAssets));
  assign('vehicleValue', profileFactValue(profile.assets.vehicleValue));

  return {
    profile: applicantProfileV2FromV3(profile, options.announcementDate),
    details: { ...details, ...(options.announcementDetails ?? {}) },
  };
}
