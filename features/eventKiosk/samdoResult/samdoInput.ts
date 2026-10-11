import type { AssessmentInput, Child } from '../../applicationAssessment/types.ts';
import { createMinimalApplicantProfile, knownField } from '../../profile/domain.ts';
import { monthsBefore } from '../engineInput.ts';
import { isIsoDate, type KioskAnswers } from '../model.ts';
import { SAMDO_DEEP_RULE_PACKAGE } from '../samdo/rulePackage.ts';

/**
 * 행사 답변 → 삼도이동 1지구 전용 판정 입력.
 *
 * 판정 규칙은 건드리지 않는다. 답을 판정 엔진이 읽는 칸으로 옮기기만 한다.
 * '잘 모르겠어요'(null·빈 값)는 채우지 않는다. 비어 있으면 엔진이 CONDITIONAL 로 남긴다.
 * 행사 질문 하나가 여러 사실을 덮는 경우(당첨 이력)는 질문 문구가 약속한 범위만 옮긴다.
 */
const JEJU = '제주특별자치도';

const defined = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;

const yes = (value: boolean | null | undefined) => (value === null || value === undefined ? undefined : value);

function childrenOf(answers: KioskAnswers): Child[] | undefined {
  const { household, householdType } = answers;
  if (householdType === 'single') return [];
  if (household.childrenCount === 0) return [];
  const count = household.childrenCount ?? household.childBirthDates.length;
  if (!count) return householdType === 'couple' ? [] : undefined;
  const dates = Array.from({ length: count }, (_, index) => household.childBirthDates[index] ?? '');
  // 한 명이라도 생년월일을 모르면 자녀 정보 전체를 모름으로 둔다(2세 미만·미성년 자녀 수가 틀어지지 않게).
  if (!dates.every(isIsoDate)) return undefined;
  return dates.map(birthDate => ({ birthDate, unborn: false }));
}

function familyCategoryOf(answers: KioskAnswers): AssessmentInput['details']['familyCategory'] {
  if (answers.householdType === 'singleParent') return 'singleParent';
  if (answers.householdType === 'couple' || answers.householdType === 'withChildren') {
    if (answers.household.marriageRegistered === true) return 'married';
    if (answers.household.marriageRegistered === false) return 'engaged';
  }
  return undefined;
}

export function samdoInputFromAnswers(answers: KioskAnswers): AssessmentInput {
  const { applicant, household, subscription, householdType } = answers;
  const single = householdType === 'single';
  const familyCategory = familyCategoryOf(answers);
  const married = familyCategory === 'married';
  const residence = applicant.livesInEventRegion === null ? undefined : applicant.livesInEventRegion ? JEJU : `${JEJU} 외`;

  const profile = createMinimalApplicantProfile({ name: '', age: 30, currentRegion: residence ?? '', preferredRegions: [] });
  if (single) profile.family.marriageStatus = knownField('single');
  else if (married) profile.family.marriageStatus = knownField('married');
  else if (familyCategory === 'engaged') profile.family.marriageStatus = knownField('single');

  // 본인·세대 무주택: 질문이 세대 전체를 묻는다. '아니요'면 세대에 집이 있는 것이고, 혼자 사는 사람은 본인 소유다.
  if (applicant.householdNoHome === true) {
    profile.housing.currentOwnership = knownField('no-home');
    profile.housing.householdHasHome = knownField(false);
  } else if (applicant.householdNoHome === false) {
    profile.housing.householdHasHome = knownField(true);
    if (single) profile.housing.currentOwnership = knownField('owns-home');
  }
  // 과거 소유: '가진 적 없어요'만 세대 전체 사실로 옮긴다. 있었다는 답은 처분일·예외를 모르니 본인(1인 가구)만 옮긴다.
  if (applicant.neverOwnedHome === true) {
    profile.housing.previousOwnership = knownField(false);
    profile.housing.householdDisqualifyingPreviousOwnership = knownField(false);
  } else if (applicant.neverOwnedHome === false && single) {
    profile.housing.previousOwnership = knownField(true);
  }
  // 당첨된 적이 있다는 답은 어떤 공급·언제인지 모르니 제한으로 확정하지 않는다.
  if (applicant.winningHistory === false) profile.housing.hasSpecialSupplyRestriction = knownField(false);
  if (subscription.accountKind !== null) profile.subscriptionAccount.hasAccount = knownField(subscription.accountKind !== 'none');
  if (applicant.taxPaymentYears !== null) {
    profile.income.incomeTaxPaymentYears = knownField(applicant.taxPaymentYears);
    profile.income.workOrBusinessIncomeEligible = knownField(applicant.taxPaymentYears > 0);
  }
  const memberCount = household.householdSize ?? (single ? 1 : null);
  if (memberCount !== null) profile.household.memberCount = knownField(memberCount);

  const marriageDate = married && isIsoDate(household.marriageDate) ? household.marriageDate : undefined;
  const winning = applicant.winningHistory;
  const details: AssessmentInput['details'] = defined({
    birthDate: isIsoDate(applicant.birthDate) ? applicant.birthDate : undefined,
    currentResidence: residence,
    // 거주기간은 '몇 년 이상' 같은 하한이라 공고일에서 그만큼 뺀 날을 시작일로 둔다(실제보다 길게 보지 않는다).
    residenceStartDate: applicant.residenceMonths === null ? undefined
      : monthsBefore(applicant.residenceMonths, new Date(`${SAMDO_DEEP_RULE_PACKAGE.announcementDate}T00:00:00`)),
    overseasStayHistory: applicant.longOverseasStay === false ? [] : undefined,
    isHouseholdHead: yes(applicant.isHouseholdHead),
    familyCategory,
    everMarried: single ? false : married ? true : undefined,
    marriageDate,
    firstMarriageDate: marriageDate,
    plannedMarriageWithinDeadline: familyCategory === 'engaged' ? yes(household.plannedMarriageWithinDeadline) : undefined,
    singleParentQualified: familyCategory === 'singleParent' ? yes(household.singleParentQualified) : undefined,
    children: childrenOf(answers),
    housingDisposalDates: applicant.neverOwnedHome === true ? [] : undefined,
    // '당첨된 적 없어요'는 특별공급 당첨·재당첨 제한·5년 내 당첨이 모두 없다는 뜻이다(질문 문구 그대로).
    specialSupplyHistory: winning === false ? false : undefined,
    reWinningRestriction: winning === false ? false : undefined,
    householdNoWinningFiveYears: winning === false ? true : undefined,
    specialExceptions: applicant.specialException === false ? [] : applicant.specialException === true ? ['행사 답변: 공고 특례 해당'] : undefined,
    accountKindEligible: subscription.accountKind === 'housing' ? true : subscription.accountKind === 'none' ? false : undefined,
    subscriptionAccountOpenedAt: isIsoDate(subscription.openedAt) ? subscription.openedAt : undefined,
    recognizedPaymentCount: subscription.paymentCount ?? undefined,
    recognizedDepositAmount: subscription.depositAmount ?? undefined,
    firstRank: yes(subscription.firstRank),
    monthlyIncome: applicant.monthlyIncome ?? undefined,
    householdIncome: household.householdIncome ?? (single ? applicant.monthlyIncome ?? undefined : undefined),
    incomeHouseholdSize: memberCount ?? undefined,
    dualIncome: single ? false : yes(household.dualIncome),
    totalAssets: household.totalAssets ?? undefined,
    parentAssets: household.parentAssets ?? undefined,
    vehicleValue: answers.adaptive.vehicleValueKrw ?? undefined,
  });
  return { profile, details };
}
