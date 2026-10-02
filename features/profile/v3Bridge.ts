import type { ApplicantProfileV2 } from './domain.ts';
import {
  knownProfileFact,
  migrateApplicantProfileV2ToV3,
  type ApplicantProfileV3,
  type PartialDate,
  type ProfileFact,
} from './v3.ts';
import type { AssessmentInput, Child } from '../applicationAssessment/types.ts';

const userMetadata = (observedAt: string) => ({ source: 'USER' as const, observedAt });
const day = (value: string): PartialDate => ({ value, precision: 'DAY' });

/**
 * Applies fields the existing profile editor actually exposes. Exact V3 facts
 * that the V2 editor cannot represent (account opening date, marriage date,
 * exact child dates and raw amounts) are preserved.
 */
export function mergeExplicitV2ProfileEditIntoV3(
  current: ApplicantProfileV3,
  edited: ApplicantProfileV2,
  observedAt: string,
): ApplicantProfileV3 {
  const mapped = migrateApplicantProfileV2ToV3(edited, { source: 'PERSISTED_USER', observedAt });
  return {
    ...current,
    identity: { ...current.identity, ...mapped.identity },
    residence: { ...current.residence, currentRegion: mapped.residence.currentRegion },
    preferences: mapped.preferences,
    subscriptionAccount: {
      ...current.subscriptionAccount,
      hasAccount: mapped.subscriptionAccount.hasAccount,
      monthlyPaymentAmount: mapped.subscriptionAccount.monthlyPaymentAmount,
      legacyAccountMonths: mapped.subscriptionAccount.legacyAccountMonths,
    },
    housing: {
      ...current.housing,
      currentOwnership: mapped.housing.currentOwnership,
      previousOwnership: mapped.housing.previousOwnership,
      householdHasHome: mapped.housing.householdHasHome,
      householdDisqualifyingPreviousOwnership:
        mapped.housing.householdDisqualifyingPreviousOwnership,
      hasSpecialSupplyRestriction: mapped.housing.hasSpecialSupplyRestriction,
    },
    household: { ...current.household, memberCount: mapped.household.memberCount },
    family: {
      ...current.family,
      marriageStatus: mapped.family.marriageStatus,
      childrenCount: mapped.family.childrenCount,
      legacyMarriageYears: mapped.family.legacyMarriageYears,
    },
    income: {
      ...current.income,
      annualRange: mapped.income.annualRange,
      workOrBusinessIncomeEligible: mapped.income.workOrBusinessIncomeEligible,
      incomeTaxPaymentYears: mapped.income.incomeTaxPaymentYears,
    },
    assets: {
      ...current.assets,
      financialRange: mapped.assets.financialRange,
      realEstateRange: mapped.assets.realEstateRange,
      vehicleRange: mapped.assets.vehicleRange,
      debtRange: mapped.assets.debtRange,
    },
  };
}

const childrenFact = (children: Child[], observedAt: string): ProfileFact<ApplicantProfileV3['family']['children'] extends ProfileFact<infer T> ? T : never> =>
  knownProfileFact(children.map((child, index) => ({
    id: `user-child-${index + 1}`,
    status: child.unborn ? 'UNBORN' as const : 'BORN' as const,
    birthDate: child.birthDate
      ? knownProfileFact(day(child.birthDate), userMetadata(observedAt))
      : ({ state: 'UNKNOWN', ...userMetadata(observedAt) } as const),
  })), userMetadata(observedAt));

/**
 * Only announcement-independent raw facts are persisted. Priority targets,
 * exception answers, income household-size rules and other announcement-only
 * qualifiers remain in AssessmentInput.details.
 */
export function mergeReusableAssessmentDetailsIntoV3(
  current: ApplicantProfileV3,
  details: AssessmentInput['details'],
  observedAt: string,
): ApplicantProfileV3 {
  const meta = userMetadata(observedAt);
  const out: ApplicantProfileV3 = structuredClone(current);
  if (details.birthDate) out.identity.birthDate = knownProfileFact(day(details.birthDate), meta);
  if (details.currentResidence) out.residence.currentRegion = knownProfileFact(details.currentResidence, meta);
  if (details.residenceStartDate) out.residence.startedAt = knownProfileFact(day(details.residenceStartDate), meta);
  if (details.overseasStayHistory) out.residence.overseasStays = knownProfileFact(
    details.overseasStayHistory.map(stay => ({
      startDate: day(stay.startDate),
      ...(stay.endDate ? { endDate: day(stay.endDate) } : {}),
    })), meta,
  );
  if (details.marriageDate) out.family.marriageDate = knownProfileFact(day(details.marriageDate), meta);
  if (details.firstMarriageDate) out.family.firstMarriageDate = knownProfileFact(day(details.firstMarriageDate), meta);
  if (details.everMarried !== undefined) {
    out.family.marriageStatus = knownProfileFact(details.everMarried ? 'married' : 'single', meta);
  }
  if (details.children) {
    out.family.children = childrenFact(details.children, observedAt);
    out.family.childrenCount = knownProfileFact(details.children.length, meta);
  }
  if (details.isHouseholdHead !== undefined) out.household.isHouseholdHead = knownProfileFact(details.isHouseholdHead, meta);
  if (details.subscriptionAccountOpenedAt) out.subscriptionAccount.openedAt = knownProfileFact(day(details.subscriptionAccountOpenedAt), meta);
  if (details.recognizedPaymentCount !== undefined) {
    out.subscriptionAccount.recognizedPaymentCount = knownProfileFact(details.recognizedPaymentCount, meta);
    out.subscriptionAccount.recognizedPaymentCountAsOf = knownProfileFact(day(observedAt.slice(0, 10)), meta);
  }
  if (details.recognizedDepositAmount !== undefined) out.subscriptionAccount.recognizedDepositAmount = knownProfileFact(details.recognizedDepositAmount, meta);
  if (details.firstRank !== undefined) out.subscriptionAccount.firstRank = knownProfileFact(details.firstRank, meta);
  if (details.monthlyIncome !== undefined) out.income.monthlyApplicantIncome = knownProfileFact(details.monthlyIncome, meta);
  if (details.spouseIncome !== undefined) out.income.monthlySpouseIncome = knownProfileFact(details.spouseIncome, meta);
  if (details.householdIncome !== undefined) out.income.monthlyHouseholdIncome = knownProfileFact(details.householdIncome, meta);
  if (details.dualIncome !== undefined) out.income.dualIncome = knownProfileFact(details.dualIncome, meta);
  if (details.workStartedAt) out.income.workStartedAt = knownProfileFact(day(details.workStartedAt), meta);
  if (details.monthlyIncome !== undefined || details.householdIncome !== undefined || details.spouseIncome !== undefined) {
    out.income.amountAsOf = knownProfileFact(day(observedAt.slice(0, 10)), meta);
  }
  if (details.totalAssets !== undefined) out.assets.totalApplicantAssets = knownProfileFact(details.totalAssets, meta);
  if (details.parentAssets !== undefined) out.assets.parentAssets = knownProfileFact(details.parentAssets, meta);
  if (details.realEstateAssets !== undefined) out.assets.householdRealEstateAssets = knownProfileFact(details.realEstateAssets, meta);
  if (details.vehicleValue !== undefined) out.assets.vehicleValue = knownProfileFact(details.vehicleValue, meta);
  if ([details.totalAssets, details.parentAssets, details.realEstateAssets, details.vehicleValue].some(value => value !== undefined)) {
    out.assets.amountAsOf = knownProfileFact(day(observedAt.slice(0, 10)), meta);
  }
  if (details.reWinningRestriction !== undefined) {
    out.housing.currentReWinningRestriction = knownProfileFact(details.reWinningRestriction, meta);
  }
  return out;
}
