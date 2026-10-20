import type { ProfileFieldState } from '../profile/domain.ts';
import type { AssessmentInput, Scalar, SupplyType } from './types.ts';
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

/** Facts where -1 means "not applicable to this applicant" (0 points), distinct from unknown. */
const NOT_APPLICABLE_SENTINEL_FACTS = new Set(['calculatedNoHomeMonths', 'newlywedMarriageScoreMonths', 'singleParentChildScoreMonths']);

/**
 * Announcement-configured income/asset scope. Missing role or future-household inputs stay unknown.
 * Existing packages without threshold.*.scopeMode retain their legacy mapping unchanged.
 */
export function resolveScopedThresholdInputs(input: AssessmentInput, parameters: Record<string, Scalar | null>, supplyType?: SupplyType) {
  const d = input.details;
  const mode = supplyType ? parameters[`threshold.${supplyType}.scopeMode`] : undefined;
  let incomeFact = supplyType ? parameters[`threshold.${supplyType}.incomeFact`] : undefined;
  let sizeFact = 'incomeHouseholdSize';
  let size: number | undefined = d.incomeHouseholdSize;
  let assetsFact = 'totalAssets', vehicleFact = 'vehicleValue';
  let dualIncome = d.dualIncome;
  let selectorMissing: string | undefined;
  if (mode === 'APPLICANT_AND_PARENTS') {
    incomeFact = 'parentApplicantMonthlyIncome';
    sizeFact = 'parentApplicantIncomeHouseholdSize'; size = d.parentApplicantIncomeHouseholdSize;
    assetsFact = 'applicantTotalAssets'; vehicleFact = 'applicantVehicleValue';
  } else if (mode === 'HOUSEHOLD_HEAD_OR_SELF') {
    if (d.isHouseholdHead === undefined) selectorMissing = 'isHouseholdHead';
    else if (d.isHouseholdHead) incomeFact = 'householdIncome';
    else {
      incomeFact = 'monthlyIncome'; sizeFact = ''; size = 1;
      assetsFact = 'applicantTotalAssets'; vehicleFact = 'applicantVehicleValue';
    }
  } else if (mode === 'CURRENT_OR_FUTURE_HOUSEHOLD') {
    const family = d.familyCategory;
    if (!family) selectorMissing = 'familyCategory';
    else if (family === 'engaged') {
      incomeFact = 'futureHouseholdIncome';
      sizeFact = 'futureHouseholdIncomeSize'; size = d.futureHouseholdIncomeSize;
      assetsFact = 'futureHouseholdTotalAssets'; vehicleFact = 'futureHouseholdVehicleValue';
      dualIncome = d.futureHouseholdDualIncome;
    } else if (family === 'singleParent') dualIncome = false;
  }
  const get = (key: unknown) => typeof key === 'string' ? d[key as keyof typeof d] : undefined;
  const money = (value: unknown) => typeof value === 'number' && (mode === undefined || (Number.isSafeInteger(value) && value >= 0)) ? value : undefined;
  return {
    incomeFact: typeof incomeFact === 'string' ? incomeFact : undefined,
    incomeAmount: selectorMissing ? undefined : money(get(incomeFact)),
    sizeFact, size: selectorMissing || !Number.isSafeInteger(size) || size! < 1 ? undefined : size,
    assetsFact, assetsAmount: selectorMissing ? undefined : money(get(assetsFact)),
    vehicleFact, vehicleAmount: selectorMissing ? undefined : money(get(vehicleFact)),
    dualIncome: selectorMissing ? undefined : dualIncome,
    selectorMissing,
  };
}

function buildExactFacts(input: AssessmentInput, asOf: string | null, workPeriodBasis?: Scalar | null, parameters: Record<string, Scalar | null> = {}, supplyType?: SupplyType): Record<string, Scalar | undefined> {
  const p = input.profile;
  const d = input.details;
  const months = (date: string | undefined) => completedMonths(date, asOf);
  // 저장된 생년월일을 그대로 쓴다. 이번 판정에서 직접 답한 값이 있으면 그 값이 우선이다(자녀 정보와 같은 규칙).
  const birthDate = d.birthDate ?? known(p.basic.birthDate);
  const birthMonths = months(birthDate);
  const overseasClear = d.overseasStayHistory?.length === 0;
  const children = d.children;
  const childAges = children?.filter(c => !c.unborn).map(c => months(c.birthDate));
  const validChildren = childAges?.every(age => age !== undefined);
  const ownership = known(p.housing.currentOwnership);
  const duration = noHomeDuration({ birthDate, firstMarriageDate:d.firstMarriageDate, everMarried:d.everMarried, disposalDates:d.housingDisposalDates },asOf);
  const householdSize = d.incomeHouseholdSize;
  const incomeSize = Number.isInteger(householdSize) && householdSize! >= 1 ? Math.max(3,householdSize!) : undefined;
  const incomeThreshold = (name: string) => incomeSize === undefined ? undefined : parameters[`income.${incomeSize}.${name}`];
  const low = incomeThreshold(d.dualIncome ? '80' : '70'), mid = incomeThreshold(d.dualIncome ? '110' : '100');
  const cutoff = parameters['exceptions.childbirthAfter'];
  const childbirthClear = typeof cutoff === 'string' && children && validChildren ? !children.some(c => c.unborn || c.birthDate! >= cutoff) : undefined;
  const recentChildCount = typeof cutoff === 'string' && children && validChildren
    ? children.filter(c => c.unborn || c.adopted || c.birthDate! >= cutoff).length
    : undefined;
  const childBand = recentChildCount === undefined ? undefined : Math.min(2, recentChildCount);
  const scoped = resolveScopedThresholdInputs(input, parameters, supplyType);
  const rawHouseholdSize = scoped.size;
  const incomeAmount = scoped.incomeAmount;
  const scopeMode = supplyType ? parameters[`threshold.${supplyType}.scopeMode`] : undefined;
  const incomeMode = scoped.dualIncome ? 'dual' : 'single';
  const percentKey = supplyType && Number.isSafeInteger(rawHouseholdSize)
    ? `threshold.${supplyType}.incomePercent.${incomeMode}.${rawHouseholdSize}` : undefined;
  const defaultPercentKey = supplyType ? `threshold.${supplyType}.incomePercent.${incomeMode}.default` : undefined;
  const explicitPercent = percentKey && Object.prototype.hasOwnProperty.call(parameters, percentKey);
  const basePercent = scopeMode === 'CURRENT_OR_FUTURE_HOUSEHOLD' && scoped.dualIncome === undefined ? undefined
    : explicitPercent ? (typeof parameters[percentKey] === 'number' ? parameters[percentKey] as number : undefined)
    : defaultPercentKey && typeof parameters[defaultPercentKey] === 'number' ? parameters[defaultPercentKey] as number : undefined;
  const maxPercentKey = supplyType ? `threshold.${supplyType}.incomeMaxPercent` : undefined;
  const maxPercent = maxPercentKey && typeof parameters[maxPercentKey] === 'number' ? parameters[maxPercentKey] as number : undefined;
  const adjustedPercent = basePercent === undefined || childBand === undefined ? undefined
    : Math.min(basePercent + childBand * 10, maxPercent ?? Number.POSITIVE_INFINITY);
  const incomeLimitKey = supplyType && rawHouseholdSize && adjustedPercent !== undefined
    ? `threshold.${supplyType}.income.${rawHouseholdSize}.${adjustedPercent}` : undefined;
  const announcementIncomeLimit = incomeLimitKey && typeof parameters[incomeLimitKey] === 'number' ? parameters[incomeLimitKey] as number : undefined;
  const assetLimitKey = supplyType && childBand !== undefined ? `threshold.${supplyType}.assets.${childBand}` : undefined;
  const vehicleLimitKey = supplyType && childBand !== undefined ? `threshold.${supplyType}.vehicle.${childBand}` : undefined;
  const announcementAssetLimit = assetLimitKey && typeof parameters[assetLimitKey] === 'number' ? parameters[assetLimitKey] as number : undefined;
  const announcementVehicleLimit = vehicleLimitKey && typeof parameters[vehicleLimitKey] === 'number' ? parameters[vehicleLimitKey] as number : undefined;
  const minorAgeYears = typeof parameters['children.minorAgeYears'] === 'number' ? parameters['children.minorAgeYears'] : 18;
  // 가구소득 배점: 공고가 정한 비율(외벌이/맞벌이) 이하이면 1, 초과면 0. 비율이 없으면 계산하지 않는다.
  const scorePercent = d.dualIncome === undefined ? undefined : parameters[d.dualIncome ? 'incomeScore.dualPercent' : 'incomeScore.singlePercent'];
  const scoreLimit = typeof scorePercent === 'number' ? incomeThreshold(String(scorePercent)) : undefined;
  const familyCategory = d.familyCategory ?? (known(p.family.marriageStatus) === 'married' ? 'married' : undefined);
  const youngestChildMonths = validChildren && childAges!.length ? Math.min(...childAges as number[]) : undefined;
  const facts: Record<string, Scalar | undefined> = {
    age: birthMonths === undefined ? undefined : Math.floor(birthMonths / 12),
    accountKindEligible: d.accountKindEligible,
    firstRank: d.firstRank,
    isHouseholdHead:d.isHouseholdHead,
    minorHouseholdHeadException:d.minorHouseholdHeadException,
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
    recentChildCount,
    householdIncomeScoreTier: d.dualIncome !== undefined && typeof d.householdIncome === 'number' && d.householdIncome >= 0 && typeof low === 'number' && typeof mid === 'number' ? (d.householdIncome <= low ? 0 : d.householdIncome <= mid ? 1 : 2) : undefined,
    // -1 is an explicit not-applicable sentinel, distinct from a valid period under one month.
    calculatedNoHomeMonths: duration && !(known(p.housing.householdDisqualifyingPreviousOwnership) === true && !d.housingDisposalDates?.length) ? (duration.applicable ? duration.months : -1) : undefined,
    maritalStatus: known(p.family.marriageStatus),
    familyCategory,
    marriageMonths: months(d.marriageDate),
    hasChildren: children ? children.length > 0 : undefined,
    minorChildren: validChildren ? childAges!.filter(age => age! < minorAgeYears * 12).length + (parameters['children.includeUnborn'] === true ? children!.filter(c => c.unborn).length : 0) : undefined,
    youngestChildMonths,
    // 가족 유형에 따라 선택할 수 없는 배점 항목은 -1(해당 없음, 0점)로 둔다. 모르면 undefined.
    newlywedMarriageScoreMonths: familyCategory === 'married' ? months(d.marriageDate) : familyCategory ? -1 : undefined,
    singleParentChildScoreMonths: familyCategory === 'singleParent' ? youngestChildMonths : familyCategory ? -1 : undefined,
    householdIncomeScoreEligible: typeof scoreLimit === 'number' && typeof d.householdIncome === 'number' && d.householdIncome >= 0 ? (d.householdIncome <= scoreLimit ? 1 : 0) : undefined,
    noHome: ownership === undefined ? undefined : ownership === 'no-home',
    neverOwned: inverse(known(p.housing.previousOwnership)),
    householdNoHome: ownership === 'owns-home' ? false : ownership === undefined ? undefined : inverse(known(p.housing.householdHasHome)),
    futureHouseholdNoHome: d.futureHouseholdNoHome,
    householdNeverOwned: inverse(known(p.housing.householdDisqualifyingPreviousOwnership)),
    noSpecialRestriction: inverse(known(p.housing.hasSpecialSupplyRestriction)),
    noSpecialSupplyHistory: inverse(d.specialSupplyHistory),
    noReWinningRestriction: inverse(d.reWinningRestriction),
    hasAccount: known(p.subscriptionAccount.hasAccount),
    accountMonths: months(d.subscriptionAccountOpenedAt),
    recognizedPaymentCount: d.recognizedPaymentCount,
    recognizedDepositAmount: d.recognizedDepositAmount,
    residence: d.currentResidence,
    spouseResidence: d.spouseResidence,
    spouseIncomeSourceRegion: d.spouseIncomeSourceRegion,
    residenceMonths: overseasClear ? months(d.residenceStartDate) : undefined,
    overseasClear: d.overseasStayHistory ? overseasClear : undefined,
    noHomeMonths: months(d.noHomeSince),
    monthlyIncome: d.monthlyIncome,
    householdIncome: d.householdIncome,
    dualIncome: d.dualIncome,
    totalAssets: d.totalAssets,
    parentAssets: d.parentAssets,
    realEstateAssets: d.realEstateAssets,
    vehicleValue: d.vehicleValue,
    workMonths: months(d.workStartedAt),
    incomeTaxPaymentYears: known(p.income.incomeTaxPaymentYears),
    workOrBusinessIncome: known(p.income.workOrBusinessIncomeEligible),
    youthPriorityTarget: d.youthPriorityTarget,
    newlywedPriorityTarget: d.newlywedPriorityTarget,
    workOrTaxMonths: workPeriodBasis === 'work' ? months(d.workStartedAt)
      : workPeriodBasis === 'tax' && known(p.income.incomeTaxPaymentYears) !== undefined ? known(p.income.incomeTaxPaymentYears)! * 12 : undefined,
    exceptionsClear: d.specialExceptions ? d.specialExceptions.length === 0 : undefined,
    educationStatus: d.educationStatus,
    graduationMonths: months(d.graduationDate),
    schoolRegion: d.schoolRegion,
    incomeSourceRegion: d.incomeSourceRegion,
    youthActivityCategory: d.youthActivityCategory,
    totalIncomeWorkMonths: d.totalIncomeWorkMonths,
    parentApplicantMonthlyIncome: d.parentApplicantMonthlyIncome,
    parentApplicantIncomeHouseholdSize: d.parentApplicantIncomeHouseholdSize,
    applicantTotalAssets: d.applicantTotalAssets,
    applicantVehicleValue: d.applicantVehicleValue,
    applicantOwnsVehicle: d.applicantOwnsVehicle,
    futureHouseholdIncome: d.futureHouseholdIncome,
    futureHouseholdIncomeSize: d.futureHouseholdIncomeSize,
    futureHouseholdDualIncome: d.futureHouseholdDualIncome,
    futureHouseholdTotalAssets: d.futureHouseholdTotalAssets,
    futureHouseholdVehicleValue: d.futureHouseholdVehicleValue,
    housingBenefitRecipient: d.housingBenefitRecipient,
    canProveSubscriptionByMoveIn: d.canProveSubscriptionByMoveIn,
    applicantCanProveSubscriptionByMoveIn: d.applicantCanProveSubscriptionByMoveIn,
    spouseCanProveSubscriptionByMoveIn: d.spouseCanProveSubscriptionByMoveIn,
    adultOrMinorHouseholdHeadException: d.adultOrMinorHouseholdHeadException,
    applicationResidencyEligible: d.applicationResidencyEligible,
    noPublicRentalSubletRestriction: d.noPublicRentalSubletRestriction,
    singleHouseholdApplicationClear: d.singleHouseholdApplicationClear,
    incomeWithinAnnouncementLimit: typeof incomeAmount === 'number' && typeof announcementIncomeLimit === 'number' ? incomeAmount <= announcementIncomeLimit : undefined,
    assetsWithinAnnouncementLimit: typeof scoped.assetsAmount === 'number' && typeof announcementAssetLimit === 'number' ? scoped.assetsAmount <= announcementAssetLimit : undefined,
    vehicleWithinAnnouncementLimit: typeof scoped.vehicleAmount === 'number' && typeof announcementVehicleLimit === 'number' ? scoped.vehicleAmount <= announcementVehicleLimit : undefined,
  };
  // Never coerce negative values, fractions in counts, NaN, or infinity into eligibility.
  for (const [key, value] of Object.entries(facts)) {
    if (typeof value === 'number' && (!Number.isFinite(value) || (value < 0 && !(NOT_APPLICABLE_SENTINEL_FACTS.has(key) && value === -1)) ||
      (['recognizedPaymentCount', 'incomeTaxPaymentYears','householdMemberCount','incomeHouseholdSize','recentChildCount','totalIncomeWorkMonths'].includes(key) && !Number.isSafeInteger(value)) ||
      (parameters['amounts.integerWon'] === true && ['monthlyIncome','householdIncome','parentApplicantMonthlyIncome','totalAssets','parentAssets','recognizedDepositAmount','realEstateAssets','vehicleValue'].includes(key) && !Number.isSafeInteger(value)))) facts[key] = undefined;
  }
  return facts;
}

type Details = AssessmentInput['details'];

/** Children from the saved profile when the answers carry none: count 0, or one birth year per child. */
function profileChildren(profile: AssessmentInput['profile']): Details['children'] {
  const count = known(profile.family.childrenCount);
  if (count === 0) return [];
  const years = known(profile.family.childBirthYears);
  if (!Number.isInteger(count) || !Array.isArray(years) || years.length !== count || !years.every(y => Number.isInteger(y) && y >= 1900 && y <= 2100)) return undefined;
  return years.map(year => ({ birthDate: `${year}-01-01`, birthDateLatest: `${year}-12-31`, unborn: false }));
}

const hasRange = (d: Details) => !!d.marriageDateLatest || !!d.children?.some(child => child.birthDateLatest);

/**
 * Facts at the announcement date. A marriage date or a child's birth date may be known only to a
 * month, a year or a duration ("결혼한 지 3년"). Every fact is then computed at the earliest and the
 * latest possible dates and kept only where both agree — the facts are monotone in these dates, so
 * the two ends decide every case in between. A disagreement leaves the fact unknown (fail closed).
 */
export function buildFacts(input: AssessmentInput, asOf: string | null, workPeriodBasis?: Scalar | null, parameters: Record<string, Scalar | null> = {}, supplyType?: SupplyType): Record<string, Scalar | undefined> {
  return buildFactsWithRanges(input, asOf, workPeriodBasis, parameters, supplyType).facts;
}

/** Facts, plus [low, high] for numeric facts whose two ends disagree (e.g. a child born "2022년 5월" is 51–52 months old). */
export function buildFactsWithRanges(input: AssessmentInput, asOf: string | null, workPeriodBasis?: Scalar | null, parameters: Record<string, Scalar | null> = {}, supplyType?: SupplyType): { facts: Record<string, Scalar | undefined>; ranges: Record<string, [number, number]> } {
  const details: Details = input.details.children === undefined ? { ...input.details, children: profileChildren(input.profile) } : input.details;
  if (!hasRange(details)) return { facts: buildExactFacts({ ...input, details }, asOf, workPeriodBasis, parameters, supplyType), ranges: {} };
  if (details.marriageDateLatest && (!validDate(details.marriageDate) || !validDate(details.marriageDateLatest) || details.marriageDateLatest < details.marriageDate!)) {
    return { facts: buildExactFacts({ ...input, details: { ...details, marriageDate: undefined, marriageDateLatest: undefined } }, asOf, workPeriodBasis, parameters, supplyType), ranges: {} };
  }
  const at = (end: 'early' | 'late'): Details => ({
    ...details,
    marriageDate: end === 'late' && details.marriageDateLatest ? details.marriageDateLatest : details.marriageDate,
    children: details.children?.map(child => ({
      unborn: child.unborn,
      birthDate: end === 'late' && child.birthDateLatest ? child.birthDateLatest : child.birthDate,
    })),
  });
  const early = buildExactFacts({ ...input, details: at('early') }, asOf, workPeriodBasis, parameters, supplyType);
  const late = buildExactFacts({ ...input, details: at('late') }, asOf, workPeriodBasis, parameters, supplyType);
  const ranges: Record<string, [number, number]> = {};
  for (const key of Object.keys(early)) {
    const a = early[key], b = late[key];
    if (a !== b && typeof a === 'number' && typeof b === 'number' && a >= 0 && b >= 0) ranges[key] = [Math.min(a, b), Math.max(a, b)];
  }
  return { facts: Object.fromEntries(Object.keys(early).map(key => [key, early[key] === late[key] ? early[key] : undefined])), ranges };
}
