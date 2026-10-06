import { readKnown, type Knowledge, type UserProfile } from '../domain/profile.ts';
import type { FactValue } from '../domain/rules.ts';

export type FactMap = Record<string, FactValue | undefined>;

export function isIsoDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function completedMonths(start: string | undefined, end: string): number | undefined {
  if (!isIsoDate(start) || !isIsoDate(end) || start > end) return undefined;
  const [startYear, startMonth, startDay] = start.split('-').map(Number) as [number, number, number];
  const [endYear, endMonth, endDay] = end.split('-').map(Number) as [number, number, number];
  return (endYear - startYear) * 12 + endMonth - startMonth - (endDay < startDay ? 1 : 0);
}

function knownNumbers(fields: Array<Knowledge<number>>): number[] | undefined {
  const values = fields.map(readKnown);
  return values.every((value): value is number => typeof value === 'number') ? values : undefined;
}

function aggregateBoolean(fields: Array<Knowledge<boolean>>, mode: 'ANY' | 'ALL'): boolean | undefined {
  const values = fields.map(readKnown);
  if (mode === 'ANY') {
    if (values.some(value => value === true)) return true;
    return values.every(value => value === false) ? false : undefined;
  }
  if (values.some(value => value === false)) return false;
  return values.every(value => value === true) ? true : undefined;
}

export function buildHouseholdFacts(profile: UserProfile, asOfDate: string): FactMap {
  if (!isIsoDate(asOfDate)) throw new Error('A valid fixed assessment date is required');
  const applicant = profile.applicant;
  const spouse = profile.household.spouse;
  const members = profile.household.members;
  const birthDate = readKnown(applicant.birthDate);
  const spouseBirthDate = spouse ? readKnown(spouse.birthDate) : undefined;
  const childMembers = members.filter(member => member.relationship === 'CHILD');
  const childAges = childMembers.map(member => member.unborn ? -1 : completedMonths(readKnown(member.birthDate), asOfDate));
  const childAgesKnown = childAges.every((age): age is number => typeof age === 'number');
  const adultIncomeFields = [applicant.financial.monthlyIncomeKrw, ...(spouse ? [spouse.financial.monthlyIncomeKrw] : [])];
  const incomeFields = [...adultIncomeFields, ...members.map(member => member.monthlyIncomeKrw)];
  const assetFields = [applicant.financial.totalAssetsKrw, ...(spouse ? [spouse.financial.totalAssetsKrw] : []), ...members.map(member => member.totalAssetsKrw)];
  const homeCountFields = [applicant.housing.currentHomeCount, ...(spouse ? [spouse.housing.currentHomeCount] : []), ...members.map(member => member.currentHomeCount)];
  const homeCounts = knownNumbers(homeCountFields);
  const householdIncome = knownNumbers(incomeFields);
  const householdAssets = knownNumbers(assetFields);
  const declaredMemberCount = profile.household.declaredTotals ? readKnown(profile.household.declaredTotals.memberCount) : undefined;
  const declaredHouseholdIncome = profile.household.declaredTotals ? readKnown(profile.household.declaredTotals.monthlyIncomeKrw) : undefined;
  const declaredHouseholdAssets = profile.household.declaredTotals ? readKnown(profile.household.declaredTotals.totalAssetsKrw) : undefined;
  const declaredAllNoHome = profile.household.declaredTotals ? readKnown(profile.household.declaredTotals.allNoHome) : undefined;
  const declaredEverOwned = profile.household.declaredTotals ? readKnown(profile.household.declaredTotals.everOwnedHomeByAnyMember) : undefined;
  const declaredSpecialSupplyHistory = profile.household.declaredTotals ? readKnown(profile.household.declaredTotals.specialSupplyHistoryByAnyMember) : undefined;
  const declaredReWinningRestriction = profile.household.declaredTotals ? readKnown(profile.household.declaredTotals.reWinningRestrictionByAnyMember) : undefined;
  const specialSupplyHistory = aggregateBoolean(
    [applicant.specialSupplyHistory, ...(spouse ? [spouse.specialSupplyHistory] : [])],
    'ANY',
  );
  const reWinningRestriction = aggregateBoolean(
    [applicant.reWinningRestriction, ...(spouse ? [spouse.reWinningRestriction] : [])],
    'ANY',
  );
  const applicantIncome = readKnown(applicant.financial.monthlyIncomeKrw);
  const spouseIncome = spouse ? readKnown(spouse.financial.monthlyIncomeKrw) : undefined;
  const ageMonths = completedMonths(birthDate, asOfDate);
  const spouseAgeMonths = completedMonths(spouseBirthDate, asOfDate);
  const marriageDate = readKnown(applicant.marriageDate) ?? (spouse ? readKnown(spouse.marriageDate) : undefined);
  const qualifications = profile.eventQualifications;
  const vehicleFields = [applicant.financial.vehicleValueKrw, spouse?.financial.vehicleValueKrw]
    .filter((field): field is Knowledge<number> => field !== undefined);
  const vehicleValues = vehicleFields.length === (spouse ? 2 : 1) ? knownNumbers(vehicleFields) : undefined;
  const residenceRegion = readKnown(applicant.residence.region);
  const isJejuResident = residenceRegion === undefined ? undefined : residenceRegion.includes('제주');
  const newbornCount = childAgesKnown ? childAges.filter(age => age >= -1 && age <= 24).length : undefined;
  const post20230328ChildCount = childMembers.every(member => member.unborn || isIsoDate(readKnown(member.birthDate)))
    ? childMembers.filter(member => member.unborn || (readKnown(member.birthDate) ?? '') >= '2023-03-28').length
    : undefined;
  const benefitCategory = qualifications?.benefitCategory ? readKnown(qualifications.benefitCategory) : undefined;
  const parentIncome = qualifications?.parentMonthlyIncomeKrw ? readKnown(qualifications.parentMonthlyIncomeKrw) : undefined;
  const parentAssets = qualifications?.parentTotalAssetsKrw ? readKnown(qualifications.parentTotalAssetsKrw) : undefined;
  const parentVehicle = qualifications?.parentVehicleValueKrw ? readKnown(qualifications.parentVehicleValueKrw) : undefined;
  const applicantVehicle = applicant.financial.vehicleValueKrw ? readKnown(applicant.financial.vehicleValueKrw) : undefined;
  const booleanPoint = (field: Knowledge<boolean> | undefined, points: number): number | undefined => {
    const value = field ? readKnown(field) : undefined;
    return value === undefined ? undefined : value ? points : 0;
  };

  return {
    'profile.composition': profile.household.composition,
    'applicant.age': ageMonths === undefined ? undefined : Math.floor(ageMonths / 12),
    'applicant.birthDate': birthDate,
    'applicant.maritalStatus': readKnown(applicant.maritalStatus),
    'applicant.isHouseholdHead': readKnown(applicant.isHouseholdHead),
    'applicant.currentHomeCount': readKnown(applicant.housing.currentHomeCount),
    'applicant.everOwnedHome': readKnown(applicant.housing.everOwnedHome),
    'applicant.noHomeMonths': completedMonths(readKnown(applicant.housing.noHomeSince), asOfDate),
    'applicant.hasSubscriptionAccount': readKnown(applicant.subscriptionAccount.hasAccount),
    'applicant.subscriptionMonths': completedMonths(readKnown(applicant.subscriptionAccount.openedAt), asOfDate),
    'applicant.subscriptionFirstRank': readKnown(applicant.subscriptionAccount.firstRank),
    'applicant.recognizedPaymentCount': readKnown(applicant.subscriptionAccount.recognizedPaymentCount),
    'applicant.recognizedDepositAmountKrw': readKnown(applicant.subscriptionAccount.recognizedDepositAmountKrw),
    'applicant.monthlyIncomeKrw': applicantIncome,
    'applicant.earnedOrBusinessIncome': readKnown(applicant.financial.earnedOrBusinessIncome),
    'applicant.incomeTaxPaymentYears': readKnown(applicant.financial.incomeTaxPaymentYears),
    'applicant.totalAssetsKrw': readKnown(applicant.financial.totalAssetsKrw),
    'applicant.residenceRegion': residenceRegion,
    'applicant.isJejuResident': isJejuResident,
    'applicant.residenceMonths': completedMonths(readKnown(applicant.residence.residentSince), asOfDate),
    'applicant.overseasStayRequiresReview': readKnown(applicant.residence.overseasStayRequiresReview),
    'spouse.exists': spouse !== undefined,
    'spouse.age': spouseAgeMonths === undefined ? undefined : Math.floor(spouseAgeMonths / 12),
    'spouse.currentHomeCount': spouse ? readKnown(spouse.housing.currentHomeCount) : undefined,
    'spouse.everOwnedHome': spouse ? readKnown(spouse.housing.everOwnedHome) : undefined,
    'spouse.monthlyIncomeKrw': spouseIncome,
    'family.marriageMonths': completedMonths(marriageDate, asOfDate),
    'household.memberCount': declaredMemberCount ?? 1 + (spouse ? 1 : 0) + members.length,
    'household.childCount': childMembers.length,
    'household.hasChild': childMembers.length > 0,
    'household.minorChildCount': childAgesKnown ? childAges.filter(age => age < 19 * 12).length : undefined,
    'household.childUnder7Count': childAgesKnown ? childAges.filter(age => age < 7 * 12).length : undefined,
    'household.currentHomeCount': declaredAllNoHome === true ? 0 : homeCounts?.reduce((sum, value) => sum + value, 0),
    'household.allNoHome': declaredAllNoHome ?? (homeCounts ? homeCounts.every(value => value === 0) : undefined),
    'household.everOwnedHomeByAnyMember': declaredEverOwned,
    'household.monthlyIncomeKrw': declaredHouseholdIncome ?? householdIncome?.reduce((sum, value) => sum + value, 0),
    'household.totalAssetsKrw': declaredHouseholdAssets ?? householdAssets?.reduce((sum, value) => sum + value, 0),
    'household.dualIncome': spouse === undefined || applicantIncome === undefined || spouseIncome === undefined
      ? spouse === undefined ? false : undefined
      : applicantIncome > 0 && spouseIncome > 0,
    'household.specialSupplyHistory': declaredSpecialSupplyHistory ?? specialSupplyHistory,
    'household.noSpecialSupplyHistory': (declaredSpecialSupplyHistory ?? specialSupplyHistory) === undefined ? undefined : !(declaredSpecialSupplyHistory ?? specialSupplyHistory),
    'household.reWinningRestriction': declaredReWinningRestriction ?? reWinningRestriction,
    'household.noReWinningRestriction': (declaredReWinningRestriction ?? reWinningRestriction) === undefined ? undefined : !(declaredReWinningRestriction ?? reWinningRestriction),
    'household.maxVehicleValueKrw': vehicleValues ? Math.max(...vehicleValues) : undefined,
    'household.dependentCount': (spouse ? 1 : 0) + members.length,
    'household.newbornCountWithinTwoYears': newbornCount,
    'household.post20230328ChildCount': post20230328ChildCount,
    'event.eligibleResident': qualifications?.eligibleResident ? readKnown(qualifications.eligibleResident) : undefined,
    'event.currentProgramTenant': qualifications?.currentProgramTenant ? readKnown(qualifications.currentProgramTenant) : undefined,
    'event.collegeStudent': qualifications?.collegeStudent ? readKnown(qualifications.collegeStudent) : undefined,
    'event.jobSeekerWithinTwoYears': qualifications?.jobSeekerWithinTwoYears ? readKnown(qualifications.jobSeekerWithinTwoYears) : undefined,
    'event.marriageBeforeMoveIn': qualifications?.marriageBeforeMoveIn ? readKnown(qualifications.marriageBeforeMoveIn) : undefined,
    'event.supportedSingleParent': qualifications?.supportedSingleParent ? readKnown(qualifications.supportedSingleParent) : undefined,
    'event.benefitCategory': benefitCategory,
    'event.isBenefitHousehold': benefitCategory === undefined ? undefined : benefitCategory !== 'NONE',
    'event.isHousingBenefitRecipient': benefitCategory === undefined ? undefined : benefitCategory === 'BASIC_HOUSING',
    'event.parentMonthlyIncomeKrw': parentIncome,
    'event.parentTotalAssetsKrw': parentAssets,
    'event.parentVehicleValueKrw': parentVehicle,
    'event.applicantParentMonthlyIncomeKrw': applicantIncome === undefined || parentIncome === undefined ? undefined : applicantIncome + parentIncome,
    'event.applicantParentTotalAssetsKrw': readKnown(applicant.financial.totalAssetsKrw) === undefined || parentAssets === undefined ? undefined : readKnown(applicant.financial.totalAssetsKrw)! + parentAssets,
    'event.applicantParentMaxVehicleValueKrw': applicantVehicle === undefined || parentVehicle === undefined ? undefined : Math.max(applicantVehicle, parentVehicle),
    'event.parentNoHome': qualifications?.parentNoHome ? readKnown(qualifications.parentNoHome) : undefined,
    'event.applicantDisabilityPoints': qualifications?.applicantDisabilityPoints ? readKnown(qualifications.applicantDisabilityPoints) : undefined,
    'event.youthIncomeUnderHalfThreshold': qualifications?.youthIncomeUnderHalfThreshold ? readKnown(qualifications.youthIncomeUnderHalfThreshold) : undefined,
    'event.housingVulnerable': qualifications?.housingVulnerable ? readKnown(qualifications.housingVulnerable) : undefined,
    'event.severeDisabilityInHousehold': qualifications?.severeDisabilityInHousehold ? readKnown(qualifications.severeDisabilityInHousehold) : undefined,
    'event.supportsSeniorParent': qualifications?.supportsSeniorParent ? readKnown(qualifications.supportsSeniorParent) : undefined,
    'event.applicantRegisteredDisabled': qualifications?.applicantRegisteredDisabled ? readKnown(qualifications.applicantRegisteredDisabled) : undefined,
    'event.rentBurdenPercent': qualifications?.rentBurdenPercent ? readKnown(qualifications.rentBurdenPercent) : undefined,
    'event.workHistoryMonths': qualifications?.workHistoryMonths ? readKnown(qualifications.workHistoryMonths) : undefined,
    'event.generalRentalPriorityCategory': qualifications?.generalRentalPriorityCategory ? readKnown(qualifications.generalRentalPriorityCategory) : undefined,
    'event.lhCollegeIncomeEligible': qualifications?.lhCollegeIncomeEligible ? readKnown(qualifications.lhCollegeIncomeEligible) : undefined,
    'score.benefit.jpdcNewlywed': benefitCategory === undefined ? undefined : benefitCategory === 'BASIC_LIVELIHOOD' ? 3 : benefitCategory === 'NEAR_POOR' ? 2 : 0,
    'score.benefit.jpdcYouth': benefitCategory === undefined ? undefined : ['BASIC_LIVELIHOOD', 'BASIC_MEDICAL', 'SUPPORTED_SINGLE_PARENT'].includes(benefitCategory) ? 3 : 0,
    'score.parentNoHome': booleanPoint(qualifications?.parentNoHome, 2),
    'score.youthIncomeUnderHalf': booleanPoint(qualifications?.youthIncomeUnderHalfThreshold, 3),
    'score.housingVulnerable': booleanPoint(qualifications?.housingVulnerable, 2),
    'score.severeDisability': booleanPoint(qualifications?.severeDisabilityInHousehold, 1),
    'score.supportsSeniorParent': booleanPoint(qualifications?.supportsSeniorParent, 1),
    'score.applicantDisabled': booleanPoint(qualifications?.applicantRegisteredDisabled, 2),
    'score.benefit.jpdcMultiChild': benefitCategory === undefined ? undefined : ['BASIC_LIVELIHOOD', 'BASIC_MEDICAL', 'BASIC_HOUSING', 'BASIC_EDUCATION', 'NEAR_POOR', 'SUPPORTED_SINGLE_PARENT'].includes(benefitCategory) ? 3 : 0,
  };
}
