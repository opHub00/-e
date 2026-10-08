import {
  known,
  unknown,
  type AdultProfile,
  type ApplicantProfile,
  type HouseholdComposition,
  type HouseholdMemberProfile,
  type Knowledge,
  type MaritalStatus,
  type SpouseProfile,
  type UserProfile,
} from './frozen/domain/profile.ts';
import { isIsoDate, type KioskAnswers } from './model.ts';

export function ageOn(birthDate: string, referenceDate: Date): number | null {
  if (!isIsoDate(birthDate)) return null;
  const [y, m, d] = birthDate.split('-').map(Number);
  let age = referenceDate.getFullYear() - y;
  const beforeBirthday = referenceDate.getMonth() + 1 < m || (referenceDate.getMonth() + 1 === m && referenceDate.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

const isoLocal = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function monthsBefore(months: number, referenceDate: Date): string {
  const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  date.setMonth(date.getMonth() - Math.max(0, Math.floor(months)));
  return isoLocal(date);
}

const boolKnowledge = (value: boolean | null): Knowledge<boolean> => value === null ? unknown<boolean>() : known(value);
const numberKnowledge = (value: number | null): Knowledge<number> => value === null ? unknown<number>() : known(value);
const dateKnowledge = (value: string): Knowledge<string> => isIsoDate(value) ? known(value) : unknown<string>();

function compositionOf(answers: KioskAnswers): HouseholdComposition {
  if (answers.householdType === 'single') return 'SINGLE';
  if (answers.householdType === 'singleParent') return 'SINGLE_PARENT';
  if (answers.householdType === 'withChildren') return 'COUPLE_WITH_CHILDREN';
  if (answers.householdType === 'couple') return answers.household.marriageRegistered === false ? 'ENGAGED_COUPLE' : 'COUPLE';
  return 'OTHER';
}

function maritalStatusOf(answers: KioskAnswers): Knowledge<MaritalStatus> {
  if (answers.householdType === 'single') return known('SINGLE');
  if (answers.householdType === 'couple' || answers.householdType === 'withChildren') {
    if (answers.household.marriageRegistered === true) return known('MARRIED');
    if (answers.household.marriageRegistered === false) return known('ENGAGED');
  }
  return unknown<MaritalStatus>();
}

function adultBase(answers: KioskAnswers, role: 'APPLICANT' | 'SPOUSE', referenceDate: Date): AdultProfile {
  const singleApplicant = role === 'APPLICANT' && answers.householdType === 'single';
  const allNoHome = answers.applicant.householdNoHome;
  const allNeverOwned = answers.applicant.neverOwnedHome;
  return {
    id: role === 'APPLICANT' ? 'applicant' : 'spouse',
    birthDate: role === 'APPLICANT' ? dateKnowledge(answers.applicant.birthDate) : unknown<string>(),
    maritalStatus: maritalStatusOf(answers),
    marriageDate: dateKnowledge(answers.household.marriageDate),
    residence: role === 'APPLICANT' ? {
      region: answers.applicant.livesInEventRegion === null
        ? unknown<string>()
        : known(answers.applicant.livesInEventRegion ? '제주특별자치도' : '제주특별자치도 외'),
      residentSince: answers.applicant.residenceMonths === null
        ? unknown<string>()
        : known(monthsBefore(answers.applicant.residenceMonths, referenceDate)),
      overseasStayRequiresReview: boolKnowledge(answers.applicant.longOverseasStay),
    } : {
      region: unknown<string>(),
      residentSince: unknown<string>(),
      overseasStayRequiresReview: unknown<boolean>(),
    },
    housing: {
      currentHomeCount: allNoHome === true ? known(0) : singleApplicant && allNoHome === false ? known(1) : unknown<number>(),
      everOwnedHome: allNeverOwned === true ? known(false) : singleApplicant && allNeverOwned === false ? known(true) : unknown<boolean>(),
      noHomeSince: unknown<string>(),
    },
    subscriptionAccount: role === 'APPLICANT' ? {
      hasAccount: answers.subscription.accountKind === null ? unknown<boolean>() : known(answers.subscription.accountKind !== 'none'),
      openedAt: dateKnowledge(answers.subscription.openedAt),
      firstRank: boolKnowledge(answers.subscription.firstRank),
      recognizedPaymentCount: numberKnowledge(answers.subscription.paymentCount),
      recognizedDepositAmountKrw: numberKnowledge(answers.subscription.depositAmount),
    } : {
      hasAccount: unknown<boolean>(), openedAt: unknown<string>(), firstRank: unknown<boolean>(),
      recognizedPaymentCount: unknown<number>(), recognizedDepositAmountKrw: unknown<number>(),
    },
    financial: role === 'APPLICANT' ? {
      monthlyIncomeKrw: numberKnowledge(answers.applicant.monthlyIncome),
      earnedOrBusinessIncome: answers.applicant.taxPaymentYears === null ? unknown<boolean>() : known(answers.applicant.taxPaymentYears > 0),
      incomeTaxPaymentYears: numberKnowledge(answers.applicant.taxPaymentYears),
      totalAssetsKrw: numberKnowledge(answers.adaptive.applicantTotalAssetsKrw ?? (singleApplicant ? answers.household.totalAssets : null)),
      vehicleValueKrw: numberKnowledge(answers.adaptive.vehicleValueKrw),
    } : {
      monthlyIncomeKrw: unknown<number>(), earnedOrBusinessIncome: unknown<boolean>(),
      incomeTaxPaymentYears: unknown<number>(), totalAssetsKrw: unknown<number>(),
    },
    specialSupplyHistory: unknown<boolean>(),
    reWinningRestriction: unknown<boolean>(),
  };
}

function memberProfiles(answers: KioskAnswers): HouseholdMemberProfile[] {
  const childCount = Math.max(answers.household.childBirthYears.length, answers.household.childBirthDates.length);
  const children = Array.from({ length: childCount }, (_, index) => ({
    id: `child-${index + 1}`,
    relationship: 'CHILD' as const,
    // A year-only legacy answer stays unknown. Phase 4 records the exact date.
    birthDate: dateKnowledge(answers.household.childBirthDates[index] ?? ''),
    unborn: false,
    coResident: known(true),
    currentHomeCount: answers.applicant.householdNoHome === true ? known(0) : unknown<number>(),
    monthlyIncomeKrw: unknown<number>(),
    totalAssetsKrw: unknown<number>(),
  }));
  const spouseCount = answers.householdType === 'couple' || answers.householdType === 'withChildren' ? 1 : 0;
  const declared = answers.household.householdSize;
  const otherCount = declared === null ? 0 : Math.max(0, declared - 1 - spouseCount - children.length);
  const others = Array.from({ length: otherCount }, (_, index): HouseholdMemberProfile => ({
    id: `member-${index + 1}`,
    relationship: 'OTHER',
    birthDate: unknown<string>(),
    unborn: false,
    coResident: known(true),
    currentHomeCount: answers.applicant.householdNoHome === true ? known(0) : unknown<number>(),
    monthlyIncomeKrw: unknown<number>(),
    totalAssetsKrw: unknown<number>(),
  }));
  return [...children, ...others];
}

/**
 * Kiosk answers → the reusable event UserProfile.
 * Unknown answers stay UNKNOWN; household totals stay totals and are never
 * fabricated as spouse-level values.
 */
export function toUserProfile(answers: KioskAnswers, referenceDate = new Date()): UserProfile {
  const applicant = { ...adultBase(answers, 'APPLICANT', referenceDate), role: 'APPLICANT', isHouseholdHead: boolKnowledge(answers.applicant.isHouseholdHead) } satisfies ApplicantProfile;
  const hasSpouse = answers.householdType === 'couple' || answers.householdType === 'withChildren';
  const spouse = hasSpouse ? ({ ...adultBase(answers, 'SPOUSE', referenceDate), role: 'SPOUSE' } satisfies SpouseProfile) : undefined;
  const declaredMemberCount = answers.household.householdSize ?? (answers.householdType === 'single' ? 1 : null);
  const declaredIncome = answers.household.householdIncome ?? (answers.householdType === 'single' ? answers.applicant.monthlyIncome : null);
  return {
    schemaVersion: 1,
    profileId: 'event-visitor',
    applicant,
    household: {
      composition: compositionOf(answers),
      ...(spouse ? { spouse } : {}),
      members: memberProfiles(answers),
      declaredTotals: {
        memberCount: numberKnowledge(declaredMemberCount),
        monthlyIncomeKrw: numberKnowledge(declaredIncome),
        totalAssetsKrw: numberKnowledge(answers.household.totalAssets),
        allNoHome: boolKnowledge(answers.applicant.householdNoHome),
        everOwnedHomeByAnyMember: answers.applicant.neverOwnedHome === null ? unknown<boolean>() : known(!answers.applicant.neverOwnedHome),
        specialSupplyHistoryByAnyMember: boolKnowledge(answers.applicant.winningHistory),
        reWinningRestrictionByAnyMember: boolKnowledge(answers.applicant.winningHistory),
        dualIncome: boolKnowledge(answers.household.dualIncome),
        maxVehicleValueKrw: numberKnowledge(answers.adaptive.vehicleValueKrw),
      },
    },
    eventQualifications: {
      marriageBeforeMoveIn: compositionOf(answers) === 'ENGAGED_COUPLE'
        ? boolKnowledge(answers.household.plannedMarriageWithinDeadline)
        : known(false),
      supportedSingleParent: compositionOf(answers) === 'SINGLE_PARENT'
        ? boolKnowledge(answers.household.singleParentQualified)
        : known(false),
      parentTotalAssetsKrw: numberKnowledge(answers.household.parentAssets),
      eligibleResident: boolKnowledge(answers.adaptive.eligibleResident),
      currentProgramTenant: boolKnowledge(answers.adaptive.currentProgramTenant),
      collegeStudent: answers.adaptive.youthStudyStatus === null
        ? boolKnowledge(answers.adaptive.collegeStudent)
        : known(answers.adaptive.youthStudyStatus === 'COLLEGE_STUDENT' || answers.adaptive.youthStudyStatus === 'BOTH'),
      jobSeekerWithinTwoYears: answers.adaptive.youthStudyStatus === null
        ? boolKnowledge(answers.adaptive.jobSeekerWithinTwoYears)
        : known(answers.adaptive.youthStudyStatus === 'JOB_SEEKER' || answers.adaptive.youthStudyStatus === 'BOTH'),
      benefitCategory: answers.adaptive.benefitCategory === null ? unknown() : known(answers.adaptive.benefitCategory),
      parentMonthlyIncomeKrw: numberKnowledge(answers.adaptive.parentMonthlyIncomeKrw),
      parentVehicleValueKrw: numberKnowledge(answers.adaptive.parentVehicleValueKrw),
      parentNoHome: boolKnowledge(answers.adaptive.parentNoHome),
      applicantDisabilityPoints: numberKnowledge(answers.adaptive.applicantDisabilityPoints),
      youthIncomeUnderHalfThreshold: boolKnowledge(answers.adaptive.youthIncomeUnderHalfThreshold),
      housingVulnerable: boolKnowledge(answers.adaptive.housingVulnerable),
      severeDisabilityInHousehold: boolKnowledge(answers.adaptive.severeDisabilityInHousehold),
      supportsSeniorParent: boolKnowledge(answers.adaptive.supportsSeniorParent),
      applicantRegisteredDisabled: boolKnowledge(answers.adaptive.applicantRegisteredDisabled),
      rentBurdenPercent: numberKnowledge(answers.adaptive.rentBurdenPercent),
      workHistoryMonths: numberKnowledge(answers.adaptive.workHistoryMonths),
      generalRentalPriorityCategory: answers.adaptive.generalRentalPriorityCategory === null
        ? unknown()
        : known(answers.adaptive.generalRentalPriorityCategory),
      lhCollegeIncomeEligible: boolKnowledge(answers.adaptive.lhCollegeIncomeEligible),
    },
    consent: { assessment: true, temporaryResultSession: true },
  };
}

/** Compatibility name retained for the UI imports while the event engine uses UserProfile. */
export const toAssessmentInput = (answers: KioskAnswers, _residenceRegion: string, referenceDate = new Date()) => ({
  profile: toUserProfile(answers, referenceDate),
  details: {},
});
