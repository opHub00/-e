import type { ProfileFieldState } from '../profile/domain.ts';
import type { AssessmentInput, Scalar } from './types.ts';
import { noHomeDuration, withinYears } from './dateFacts.ts';

export function validDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Calendar arithmetic at a fixed announcement date; no device clock/timezone. */
export function completedMonths(start: string | undefined, end: string | null): number | undefined {
  if (!validDate(start) || !validDate(end ?? undefined) || start > end!) return undefined;
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end!.split('-').map(Number);
  return (ey - sy) * 12 + em - sm - (ed < sd ? 1 : 0);
}
const known = <T>(field: ProfileFieldState<T>): T | undefined => field.status === 'known' ? field.value : undefined;
const inverse = (value: boolean | undefined) => value === undefined ? undefined : !value;

export function buildFacts(input: AssessmentInput, asOf: string | null, workPeriodBasis?: Scalar | null, parameters: Record<string, Scalar | null> = {}): Record<string, Scalar | undefined> {
  const p = input.profile;
  const d = input.details;
  const months = (date: string | undefined) => completedMonths(date, asOf);
  const birthMonths = months(d.birthDate);
  const overseasClear = d.overseasStayHistory?.length === 0;
  const children = d.children;
  const childAges = children?.filter(c => !c.unborn).map(c => months(c.birthDate));
  const validChildren = childAges?.every(age => age !== undefined);
  const ownership = known(p.housing.currentOwnership);
  const duration = noHomeDuration({ birthDate:d.birthDate, firstMarriageDate:d.firstMarriageDate, everMarried:d.everMarried, disposalDates:d.housingDisposalDates },asOf);
  const householdSize = d.incomeHouseholdSize;
  const incomeSize = Number.isInteger(householdSize) && householdSize! >= 1 ? Math.max(3,householdSize!) : undefined;
  const incomeThreshold = (name: string) => incomeSize === undefined ? undefined : parameters[`income.${incomeSize}.${name}`];
  const low = incomeThreshold(d.dualIncome ? '80' : '70'), mid = incomeThreshold(d.dualIncome ? '110' : '100');
  const cutoff = parameters['exceptions.childbirthAfter'];
  const childbirthClear = typeof cutoff === 'string' && children && validChildren ? !children.some(c => c.unborn || c.birthDate! >= cutoff) : undefined;
  const minorAgeYears = typeof parameters['children.minorAgeYears'] === 'number' ? parameters['children.minorAgeYears'] : 18;
  const facts: Record<string, Scalar | undefined> = {
    age: birthMonths === undefined ? undefined : Math.floor(birthMonths / 12),
    accountKindEligible: d.accountKindEligible,
    firstRank: d.firstRank,
    isHouseholdHead:d.isHouseholdHead,
    householdNoWinningFiveYears:d.householdNoWinningFiveYears,
    incomeHouseholdSize: incomeSize,
    householdMemberCount: known(p.household.memberCount),
    plannedMarriageWithinDeadline:d.plannedMarriageWithinDeadline,
    singleParentQualified:d.singleParentQualified,
    unmarriedChildInHousehold:d.unmarriedChildInHousehold,
    marriageWithin2Years: withinYears(d.marriageDate,asOf,2),
    marriageWithin7Years: withinYears(d.marriageDate,asOf,7),
    hasChildUnder7: validChildren ? children!.some(c => c.unborn) || childAges!.some(a => a! < 84) : undefined,
    hasChildUnder3: validChildren ? children!.some(c => c.unborn) || childAges!.some(a => a! < 36) : undefined,
    childbirthClear,
    householdIncomeScoreTier: d.dualIncome !== undefined && typeof d.householdIncome === 'number' && d.householdIncome >= 0 && typeof low === 'number' && typeof mid === 'number' ? (d.householdIncome <= low ? 0 : d.householdIncome <= mid ? 1 : 2) : undefined,
    // -1 is an explicit not-applicable sentinel, distinct from a valid period under one month.
    calculatedNoHomeMonths: duration && !(known(p.housing.householdDisqualifyingPreviousOwnership) === true && !d.housingDisposalDates?.length) ? (duration.applicable ? duration.months : -1) : undefined,
    maritalStatus: known(p.family.marriageStatus),
    familyCategory: d.familyCategory ?? (known(p.family.marriageStatus) === 'married' ? 'married' : undefined),
    marriageMonths: months(d.marriageDate),
    hasChildren: children ? children.length > 0 : undefined,
    minorChildren: validChildren ? childAges!.filter(age => age! < minorAgeYears * 12).length + (parameters['children.includeUnborn'] === true ? children!.filter(c => c.unborn).length : 0) : undefined,
    youngestChildMonths: validChildren && childAges!.length ? Math.min(...childAges as number[]) : undefined,
    noHome: ownership === undefined ? undefined : ownership === 'no-home',
    neverOwned: inverse(known(p.housing.previousOwnership)),
    householdNoHome: ownership === 'owns-home' ? false : ownership === undefined ? undefined : inverse(known(p.housing.householdHasHome)),
    householdNeverOwned: inverse(known(p.housing.householdDisqualifyingPreviousOwnership)),
    noSpecialRestriction: inverse(known(p.housing.hasSpecialSupplyRestriction)),
    noSpecialSupplyHistory: inverse(d.specialSupplyHistory),
    noReWinningRestriction: inverse(d.reWinningRestriction),
    hasAccount: known(p.subscriptionAccount.hasAccount),
    accountMonths: months(d.subscriptionAccountOpenedAt),
    recognizedPaymentCount: d.recognizedPaymentCount,
    recognizedDepositAmount: d.recognizedDepositAmount,
    residence: d.currentResidence,
    residenceMonths: overseasClear ? months(d.residenceStartDate) : undefined,
    overseasClear: d.overseasStayHistory ? overseasClear : undefined,
    noHomeMonths: months(d.noHomeSince),
    monthlyIncome: d.monthlyIncome,
    householdIncome: d.householdIncome,
    dualIncome: d.dualIncome,
    totalAssets: d.totalAssets,
    parentAssets: d.parentAssets,
    workMonths: months(d.workStartedAt),
    incomeTaxPaymentYears: known(p.income.incomeTaxPaymentYears),
    workOrBusinessIncome: known(p.income.workOrBusinessIncomeEligible),
    youthPriorityTarget: d.youthPriorityTarget,
    newlywedPriorityTarget: d.newlywedPriorityTarget,
    workOrTaxMonths: workPeriodBasis === 'work' ? months(d.workStartedAt)
      : workPeriodBasis === 'tax' && known(p.income.incomeTaxPaymentYears) !== undefined ? known(p.income.incomeTaxPaymentYears)! * 12 : undefined,
    exceptionsClear: d.specialExceptions ? d.specialExceptions.length === 0 : undefined,
  };
  // Never coerce negative values, fractions in counts, NaN, or infinity into eligibility.
  for (const [key, value] of Object.entries(facts)) {
    if (typeof value === 'number' && (!Number.isFinite(value) || (value < 0 && !(key === 'calculatedNoHomeMonths' && value === -1)) ||
      (['recognizedPaymentCount', 'incomeTaxPaymentYears','householdMemberCount','incomeHouseholdSize'].includes(key) && !Number.isSafeInteger(value)) ||
      (parameters['amounts.integerWon'] === true && ['monthlyIncome','householdIncome','totalAssets','parentAssets','recognizedDepositAmount'].includes(key) && !Number.isSafeInteger(value)))) facts[key] = undefined;
  }
  return facts;
}
