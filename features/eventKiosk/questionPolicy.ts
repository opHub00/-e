import type { AnswerState, InputStep, KioskAnswers } from './model.ts';

/**
 * A response state is separate from the domain value. `null` can mean either untouched or
 * explicitly unknown; this map is what prevents a later screen from asking the same fact again.
 */
export type AnswerStateMap = Record<string, AnswerState>;

export const COMMON_REQUIRED_QUESTION_KEYS = [
  'householdType',
  'applicant.birthDate',
  'applicant.livesInEventRegion',
  'applicant.longOverseasStay',
  'household.childExpectationStatus',
  'applicant.monthlyIncome',
  'applicant.householdNoHome',
  'applicant.neverOwnedHome',
  'applicant.specialSupplyHistory',
  'applicant.reWinningRestriction',
  'applicant.householdNoWinningFiveYears',
  'household.totalAssets',
  'adaptive.vehicleValueKrw',
  'subscription.accountKind',
] as const;

export const DOES_NOT_KNOW_ACKNOWLEDGEMENT = '괜찮아요. 결과에서 확인이 필요한 항목으로 표시할게요.';

const DOES_NOT_KNOW_LABELS: Record<string, string> = {
  'applicant.residenceMonths': '정확한 기간을 몰라요',
  'applicant.longOverseasStay': '기억나지 않아요',
  'applicant.specialException': '확인해 봐야 해요',
  'applicant.monthlyIncome': '정확히 몰라요',
  'applicant.taxPaymentYears': '정확한 기간을 몰라요',
  'applicant.householdNoHome': '확인해 봐야 해요',
  'applicant.neverOwnedHome': '기억나지 않아요',
  'applicant.specialSupplyHistory': '기억나지 않아요',
  'applicant.reWinningRestriction': '확인해 봐야 해요',
  'applicant.householdNoWinningFiveYears': '기억나지 않아요',
  'household.marriageRegistered': '확인해 봐야 해요',
  'household.marriageDate': '정확한 날짜를 몰라요',
  'household.plannedMarriageWithinDeadline': '확인해 봐야 해요',
  'household.childrenCount': '정확히 몰라요',
  'household.childExpectationStatus': '확인해 봐야 해요',
  'household.householdIncome': '정확히 몰라요',
  'household.householdSize': '정확히 몰라요',
  'household.totalAssets': '정확히 몰라요',
  'household.parentAssets': '정확히 몰라요',
  'household.parentInformationStatus': '정확히 몰라요',
  'adaptive.vehicleValueKrw': '정확히 몰라요',
  'adaptive.applicantTotalAssetsKrw': '정확히 몰라요',
  'adaptive.parentMonthlyIncomeKrw': '정확히 몰라요',
  'adaptive.parentVehicleValueKrw': '정확히 몰라요',
  'adaptive.workHistoryMonths': '정확한 기간을 몰라요',
  'subscription.accountKind': '확인해 봐야 해요',
  'subscription.openedAt': '정확한 날짜를 몰라요',
  'subscription.paymentCount': '정확히 몰라요',
  'subscription.depositAmount': '정확히 몰라요',
  'subscription.firstRank': '확인해 봐야 해요',
};

/** UI copy varies by question, while every choice maps to the same DOES_NOT_KNOW state. */
export function doesNotKnowLabel(questionKey: string): string {
  if (questionKey.startsWith('household.childBirthDates.')) return '정확한 날짜를 몰라요';
  return DOES_NOT_KNOW_LABELS[questionKey] ?? '확인해 봐야 해요';
}

const valuePresent = (value: unknown): boolean => value !== null && value !== undefined && value !== '';

/** Questions visible in each base step. Leaving one blank and continuing records DOES_NOT_KNOW. */
export function visibleQuestionKeysForStep(answers: KioskAnswers, step: InputStep): string[] {
  const spouse = answers.householdType === 'couple' || answers.householdType === 'withChildren';
  const children = answers.householdType === 'withChildren' || answers.householdType === 'singleParent';
  const single = answers.householdType === 'single';
  const unmarried = !spouse || answers.household.marriageRegistered === false;
  if (step === 'household') return ['householdType'];
  if (step === 'applicant') return [
    'applicant.birthDate', 'applicant.isHouseholdHead', 'applicant.livesInEventRegion',
    ...(answers.applicant.livesInEventRegion ? ['applicant.residenceMonths'] : []),
    'applicant.longOverseasStay', 'applicant.specialException', 'household.childExpectationStatus',
  ];
  if (step === 'family') return [
    ...(spouse ? ['household.marriageRegistered'] : []),
    ...(spouse && answers.household.marriageRegistered === true ? ['household.marriageDate'] : []),
    ...(spouse && answers.household.marriageRegistered === false ? ['household.plannedMarriageWithinDeadline'] : []),
    ...(answers.householdType === 'singleParent' ? ['household.singleParentQualified'] : []),
    ...(children ? ['household.childrenCount', ...answers.household.childBirthDates.map((_, index) => `household.childBirthDates.${index}`)] : []),
  ];
  if (step === 'finance') return [
    'applicant.monthlyIncome', 'applicant.taxPaymentYears',
    ...(spouse ? ['household.dualIncome'] : []),
    ...(!single ? ['household.householdSize', 'household.householdIncome'] : []),
    'household.totalAssets', 'adaptive.vehicleValueKrw',
    ...(unmarried ? ['household.parentInformationStatus'] : []),
    ...(unmarried && answers.household.parentInformationStatus === 'KNOWN' ? ['household.parentAssets'] : []),
  ];
  const hasAccount = answers.subscription.accountKind === 'housing' || answers.subscription.accountKind === 'other';
  return [
    'applicant.householdNoHome', 'applicant.neverOwnedHome',
    'applicant.specialSupplyHistory', 'applicant.reWinningRestriction', 'applicant.householdNoWinningFiveYears',
    'subscription.accountKind',
    ...(hasAccount ? ['subscription.openedAt', 'subscription.paymentCount', 'subscription.depositAmount', 'subscription.firstRank'] : []),
  ];
}

export function questionValue(answers: KioskAnswers, key: string): unknown {
  if (key === 'householdType') return answers.householdType;
  const parts = key.split('.');
  let current: unknown = answers;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function skippedQuestionKeys(answers: KioskAnswers, step: InputStep, states: AnswerStateMap): string[] {
  return visibleQuestionKeysForStep(answers, step).filter(key => !states[key] && !valuePresent(questionValue(answers, key)));
}

/** A base answer and a later adaptive question can have different UI keys but represent one fact. */
const FACT_RESPONSE_KEYS: Record<string, readonly string[]> = {
  'applicant.totalAssetsKrw': ['household.totalAssets', 'adaptive.applicantTotalAssetsKrw'],
  'household.maxVehicleValueKrw': ['adaptive.vehicleValueKrw'],
  'event.eligibleResident': ['adaptive.eligibleResident'],
  'event.currentProgramTenant': ['adaptive.currentProgramTenant'],
  'event.collegeStudent': ['adaptive.youthStudyStatus', 'adaptive.collegeStudent'],
  'event.jobSeekerWithinTwoYears': ['adaptive.youthStudyStatus', 'adaptive.jobSeekerWithinTwoYears'],
  'event.benefitCategory': ['adaptive.benefitCategory'],
  'event.isHousingBenefitRecipient': ['adaptive.benefitCategory'],
  'event.workHistoryMonths': ['adaptive.workHistoryMonths'],
  'event.applicantParentMonthlyIncomeKrw': ['applicant.monthlyIncome', 'adaptive.parentMonthlyIncomeKrw'],
  'event.applicantParentTotalAssetsKrw': ['household.totalAssets', 'household.parentInformationStatus', 'household.parentAssets', 'adaptive.applicantTotalAssetsKrw'],
  'event.applicantParentMaxVehicleValueKrw': ['adaptive.vehicleValueKrw', 'adaptive.parentVehicleValueKrw'],
  'score.benefit.jpdcMultiChild': ['adaptive.benefitCategory'],
  'score.benefit.jpdcNewlywed': ['adaptive.benefitCategory'],
  'score.benefit.jpdcYouth': ['adaptive.benefitCategory'],
};

export function factWasExplicitlyAddressed(fact: string, adaptiveId: string, states: AnswerStateMap): boolean {
  const composite: Record<string, readonly (readonly string[])[]> = {
    'event.applicantParentMonthlyIncomeKrw': [['applicant.monthlyIncome'], ['adaptive.parentMonthlyIncomeKrw']],
    'event.applicantParentTotalAssetsKrw': [['household.totalAssets', 'adaptive.applicantTotalAssetsKrw'], ['household.parentInformationStatus', 'household.parentAssets']],
    'event.applicantParentMaxVehicleValueKrw': [['adaptive.vehicleValueKrw'], ['adaptive.parentVehicleValueKrw']],
  };
  const groups = composite[fact] ?? [FACT_RESPONSE_KEYS[fact] ?? [`adaptive.${adaptiveId}`]];
  return groups.length > 0 && groups.every(group => group.some(key => states[key] !== undefined));
}

/** Samdo definitions use engine fact names; map them back to the base questions already shown. */
const SAMDO_FACT_RESPONSE_KEYS: Record<string, readonly string[]> = {
  birthDate: ['applicant.birthDate'], age: ['applicant.birthDate'],
  currentResidence: ['applicant.livesInEventRegion'], residence: ['applicant.livesInEventRegion'],
  residenceStartDate: ['applicant.residenceMonths'], overseasClear: ['applicant.longOverseasStay'],
  maritalStatus: ['householdType'], familyCategory: ['householdType', 'household.marriageRegistered'],
  marriageDate: ['household.marriageDate'], plannedMarriageWithinDeadline: ['household.plannedMarriageWithinDeadline'],
  children: ['household.childExpectationStatus'], childUnderTwo: ['household.childExpectationStatus'], childbirthClear: ['household.childExpectationStatus'],
  householdNoHome: ['applicant.householdNoHome'], noHome: ['applicant.householdNoHome'],
  neverOwned: ['applicant.neverOwnedHome'], householdNeverOwned: ['applicant.neverOwnedHome'], housing: ['applicant.neverOwnedHome'],
  hasAccount: ['subscription.accountKind'], accountKindEligible: ['subscription.accountKind'],
  accountMonths: ['subscription.openedAt'], recognizedPaymentCount: ['subscription.paymentCount'],
  recognizedDepositAmount: ['subscription.depositAmount'], firstRank: ['subscription.firstRank'],
  isHouseholdHead: ['applicant.isHouseholdHead'], householdNoWinningFiveYears: ['applicant.householdNoWinningFiveYears'],
  householdIncome: ['household.householdIncome'], monthlyIncome: ['applicant.monthlyIncome'],
  dualIncome: ['household.dualIncome'], incomeHouseholdSize: ['household.householdSize'],
  totalAssets: ['household.totalAssets'], parentAssets: ['household.parentInformationStatus', 'household.parentAssets'],
  incomeTaxPaymentYears: ['applicant.taxPaymentYears'], workOrBusinessIncome: ['applicant.taxPaymentYears'],
  specialSupplyHistory: ['applicant.specialSupplyHistory'], noSpecialSupplyHistory: ['applicant.specialSupplyHistory'],
  reWinningRestriction: ['applicant.reWinningRestriction'], noReWinningRestriction: ['applicant.reWinningRestriction'],
  specialExceptions: ['applicant.specialException'], exceptionsClear: ['applicant.specialException'],
};

export function samdoFactWasAddressed(fact: string, states: AnswerStateMap): boolean {
  const normalized = fact.replace(/^(?:input|review|fact):/, '');
  const keys = SAMDO_FACT_RESPONSE_KEYS[normalized] ?? [];
  if (['children', 'childUnderTwo', 'childbirthClear'].includes(normalized)) {
    if (states['household.childExpectationStatus'] === 'DOES_NOT_KNOW') return true;
    if (states['household.childrenCount'] === 'DOES_NOT_KNOW') return true;
    const childDateStates = Object.entries(states).filter(([key]) => key.startsWith('household.childBirthDates.'));
    if (childDateStates.some(([, state]) => state === 'DOES_NOT_KNOW')) return true;
    // A no-children household has no count/date controls; the explicit expectation answer is sufficient.
    if (states['household.childrenCount'] === undefined) return states['household.childExpectationStatus'] !== undefined;
    return childDateStates.length > 0 && childDateStates.every(([, state]) => state !== undefined);
  }
  if (normalized === 'parentAssets') {
    // A reason such as no parents / cannot contact is itself a completed response.
    // It must remain UNKNOWN in the evaluator, but the amount must not be asked again.
    return states['household.parentInformationStatus'] !== undefined || states['household.parentAssets'] !== undefined;
  }
  return keys.length > 0 && keys.every(key => states[key] !== undefined);
}
