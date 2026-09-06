import type { ApplicantProfileV2, ProfileFieldState } from '../profile/domain.ts';
import { normalizeSavedListingIds } from '../discovery/savedListingStorage.ts';

export type ProfileConflictPreference = 'detect' | 'local' | 'cloud';

export type ProfileMergeResult = {
  profile: ApplicantProfileV2;
  conflictPaths: string[];
};

export function mergeApplicantProfiles(
  local: ApplicantProfileV2,
  cloud: ApplicantProfileV2,
  preference: ProfileConflictPreference = 'detect',
): ProfileMergeResult {
  const conflictPaths: string[] = [];
  const plain = <T>(localValue: T, cloudValue: T, path: string): T => {
    if (sameValue(localValue, cloudValue)) return localValue;
    conflictPaths.push(path);
    return preference === 'cloud' ? cloudValue : localValue;
  };
  const field = <T>(
    localValue: ProfileFieldState<T>,
    cloudValue: ProfileFieldState<T>,
    path: string,
  ): ProfileFieldState<T> => {
    if (sameValue(localValue, cloudValue)) return localValue;
    if (localValue.status === 'unknown') return cloudValue;
    if (cloudValue.status === 'unknown') return localValue;
    conflictPaths.push(path);
    return preference === 'cloud' ? cloudValue : localValue;
  };

  return {
    profile: {
      version: 2,
      basic: {
        name: plain(local.basic.name, cloud.basic.name, 'basic.name'),
        age: plain(local.basic.age, cloud.basic.age, 'basic.age'),
        occupation: field(local.basic.occupation, cloud.basic.occupation, 'basic.occupation'),
      },
      residence: {
        currentRegion: plain(
          local.residence.currentRegion,
          cloud.residence.currentRegion,
          'residence.currentRegion',
        ),
      },
      preferences: {
        regions: normalizeRegions([...local.preferences.regions, ...cloud.preferences.regions]),
      },
      subscriptionAccount: {
        hasAccount: field(
          local.subscriptionAccount.hasAccount,
          cloud.subscriptionAccount.hasAccount,
          'subscriptionAccount.hasAccount',
        ),
        accountMonths: field(
          local.subscriptionAccount.accountMonths,
          cloud.subscriptionAccount.accountMonths,
          'subscriptionAccount.accountMonths',
        ),
        monthlyPayment: field(
          local.subscriptionAccount.monthlyPayment,
          cloud.subscriptionAccount.monthlyPayment,
          'subscriptionAccount.monthlyPayment',
        ),
      },
      housing: {
        currentOwnership: field(
          local.housing.currentOwnership,
          cloud.housing.currentOwnership,
          'housing.currentOwnership',
        ),
        previousOwnership: field(
          local.housing.previousOwnership,
          cloud.housing.previousOwnership,
          'housing.previousOwnership',
        ),
        householdHasHome: field(
          local.housing.householdHasHome,
          cloud.housing.householdHasHome,
          'housing.householdHasHome',
        ),
        householdDisqualifyingPreviousOwnership: field(
          local.housing.householdDisqualifyingPreviousOwnership,
          cloud.housing.householdDisqualifyingPreviousOwnership,
          'housing.householdDisqualifyingPreviousOwnership',
        ),
        hasSpecialSupplyRestriction: field(
          local.housing.hasSpecialSupplyRestriction,
          cloud.housing.hasSpecialSupplyRestriction,
          'housing.hasSpecialSupplyRestriction',
        ),
      },
      household: {
        memberCount: field(
          local.household.memberCount,
          cloud.household.memberCount,
          'household.memberCount',
        ),
      },
      family: {
        marriageStatus: field(
          local.family.marriageStatus,
          cloud.family.marriageStatus,
          'family.marriageStatus',
        ),
        marriageYears: field(
          local.family.marriageYears,
          cloud.family.marriageYears,
          'family.marriageYears',
        ),
        childrenCount: field(
          local.family.childrenCount,
          cloud.family.childrenCount,
          'family.childrenCount',
        ),
        childBirthYears: field(
          local.family.childBirthYears,
          cloud.family.childBirthYears,
          'family.childBirthYears',
        ),
      },
      income: {
        annualRange: field(
          local.income.annualRange,
          cloud.income.annualRange,
          'income.annualRange',
        ),
        workOrBusinessIncomeEligible: field(
          local.income.workOrBusinessIncomeEligible,
          cloud.income.workOrBusinessIncomeEligible,
          'income.workOrBusinessIncomeEligible',
        ),
        incomeTaxPaymentYears: field(
          local.income.incomeTaxPaymentYears,
          cloud.income.incomeTaxPaymentYears,
          'income.incomeTaxPaymentYears',
        ),
      },
      assets: {
        financial: field(local.assets.financial, cloud.assets.financial, 'assets.financial'),
        realEstate: field(local.assets.realEstate, cloud.assets.realEstate, 'assets.realEstate'),
        vehicle: field(local.assets.vehicle, cloud.assets.vehicle, 'assets.vehicle'),
        debt: field(local.assets.debt, cloud.assets.debt, 'assets.debt'),
      },
    },
    conflictPaths: preference === 'detect' ? conflictPaths : [],
  };
}

export function mergeSavedListingIds(local: unknown, cloud: unknown): string[] {
  return normalizeSavedListingIds([
    ...normalizeSavedListingIds(local),
    ...normalizeSavedListingIds(cloud),
  ]);
}

export function isApplicantProfileV2Payload(value: unknown): value is ApplicantProfileV2 {
  if (!isRecord(value) || value.version !== 2) return false;
  return [
    'basic',
    'residence',
    'preferences',
    'subscriptionAccount',
    'housing',
    'household',
    'family',
    'income',
    'assets',
  ].every((key) => isRecord(value[key]));
}

function normalizeRegions(regions: readonly string[]): string[] {
  return [...new Set(regions.map((region) => region.trim()).filter(Boolean))];
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
