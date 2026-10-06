import { createMinimalApplicantProfile, knownField, type ApplicantProfileV2 } from '../profile/domain.ts';
import type { AssessmentInput, Child } from '../applicationAssessment/types.ts';
import { isIsoDate, type KioskAnswers } from './model.ts';

/**
 * 행사 입력 → 판정 엔진 입력.
 *
 * 규칙은 하나: **방문자가 답한 것만 known 으로 넣는다.** 답하지 않았거나 '모르겠어요'면 비워 둔다.
 * 엔진은 비어 있는 값을 '정보 필요'로 처리하므로, 모르는 값이 '아니요'로 둔갑하지 않는다.
 *
 * 한 질문이 여러 사실을 덮는 경우가 있다(예: '당첨된 적이 있나요?'). 그 질문 문구가 그 사실들을
 * 모두 묻도록 쓰여 있을 때만 그렇게 한다. 문구보다 넓게 해석하지 않는다.
 */

/** 기준일 시점의 만 나이. 생년월일을 모르면 null. */
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

/** 'n개월 전'을 날짜로. 거주 시작일은 엔진이 날짜로 받는다. */
export function monthsBefore(months: number, referenceDate: Date): string {
  const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  date.setMonth(date.getMonth() - Math.max(0, Math.floor(months)));
  return isoLocal(date);
}

/**
 * 출생 연도만 아는 자녀. 엔진은 가장 이른 날짜와 가장 늦은 날짜를 함께 받아,
 * 두 끝이 같은 답을 낼 때만 그 사실(예: 만 7세 미만)을 쓴다.
 */
const childFromYear = (year: number | null): Child =>
  year === null ? { unborn: false } : { birthDate: `${year}-01-01`, birthDateLatest: `${year}-12-31`, unborn: false };

export function toAssessmentInput(answers: KioskAnswers, residenceRegion: string, referenceDate = new Date()): AssessmentInput {
  const { householdType, applicant, household, subscription } = answers;
  const age = ageOn(applicant.birthDate, referenceDate);
  const withSpouse = householdType === 'couple' || householdType === 'withChildren';
  const engaged = withSpouse && household.marriageRegistered === false;
  const married = withSpouse && household.marriageRegistered !== false;

  const profile: ApplicantProfileV2 = createMinimalApplicantProfile({
    name: applicant.displayName.trim() || '방문자',
    age: age ?? 30,
    currentRegion: applicant.livesInEventRegion === true ? residenceRegion : '',
    preferredRegions: [residenceRegion],
  });
  const details: AssessmentInput['details'] = {};

  // 혼인 상태: 가구 형태와 혼인신고 여부로 정해지는 경우만 넣는다. '기타'는 모른다.
  if (householdType === 'single' || householdType === 'singleParent' || engaged) profile.family.marriageStatus = knownField('single');
  if (married) profile.family.marriageStatus = knownField('married');

  if (married) {
    details.familyCategory = 'married';
    details.everMarried = true;
    if (isIsoDate(household.marriageDate)) {
      details.marriageDate = household.marriageDate;
      details.firstMarriageDate = household.marriageDate;
    }
  } else if (engaged) {
    details.familyCategory = 'engaged';
    details.everMarried = false;
    if (household.plannedMarriageWithinDeadline !== null) details.plannedMarriageWithinDeadline = household.plannedMarriageWithinDeadline;
  } else if (householdType === 'singleParent') {
    details.familyCategory = 'singleParent';
    if (household.singleParentQualified !== null) details.singleParentQualified = household.singleParentQualified;
  } else if (householdType === 'single') {
    details.everMarried = false;
  }

  // 주택: 질문이 '본인과 세대원 모두'를 묻는다.
  if (applicant.householdNoHome !== null) {
    profile.housing.currentOwnership = knownField(applicant.householdNoHome ? 'no-home' : 'owns-home');
    profile.housing.householdHasHome = knownField(!applicant.householdNoHome);
  }
  if (applicant.neverOwnedHome !== null) {
    profile.housing.previousOwnership = knownField(!applicant.neverOwnedHome);
    profile.housing.householdDisqualifyingPreviousOwnership = knownField(!applicant.neverOwnedHome);
    if (applicant.neverOwnedHome) details.housingDisposalDates = [];
  }
  // 당첨 이력: 질문이 특별공급 당첨·재당첨 제한·최근 5년 당첨을 함께 묻는다.
  if (applicant.winningHistory !== null) {
    profile.housing.hasSpecialSupplyRestriction = knownField(applicant.winningHistory);
    details.specialSupplyHistory = applicant.winningHistory;
    details.reWinningRestriction = applicant.winningHistory;
    details.householdNoWinningFiveYears = !applicant.winningHistory;
  }

  if (age !== null) details.birthDate = applicant.birthDate;
  if (applicant.livesInEventRegion === true) {
    details.currentResidence = residenceRegion;
    if (applicant.residenceMonths !== null) details.residenceStartDate = monthsBefore(applicant.residenceMonths, referenceDate);
  } else if (applicant.livesInEventRegion === false) {
    details.currentResidence = '그 외 지역';
  }
  // 오래 나가 있었던 적이 '없다'면 이력이 빈 것이다. '있다'면 기간을 모르므로 비워 두고 확인 필요로 남긴다.
  if (applicant.longOverseasStay === false) details.overseasStayHistory = [];
  if (applicant.specialException === false) details.specialExceptions = [];
  if (applicant.specialException === true) details.specialExceptions = ['방문자가 특례 해당 가능성을 알렸어요'];
  if (applicant.isHouseholdHead !== null) details.isHouseholdHead = applicant.isHouseholdHead;

  if (applicant.taxPaymentYears !== null) {
    profile.income.incomeTaxPaymentYears = knownField(applicant.taxPaymentYears);
    profile.income.workOrBusinessIncomeEligible = knownField(applicant.taxPaymentYears > 0);
  }
  if (applicant.monthlyIncome !== null) details.monthlyIncome = applicant.monthlyIncome;

  // 세대: 1인 가구는 세대원 수를 따로 묻지 않는다. 본인 하나이고, 세대 소득은 본인 소득이다.
  const size = household.householdSize ?? (householdType === 'single' ? 1 : null);
  if (size !== null) {
    details.incomeHouseholdSize = size;
    profile.household.memberCount = knownField(size);
  }
  if (household.householdIncome !== null) details.householdIncome = household.householdIncome;
  else if (householdType === 'single' && applicant.monthlyIncome !== null) details.householdIncome = applicant.monthlyIncome;
  if (household.dualIncome !== null) details.dualIncome = household.dualIncome;
  else if (householdType === 'single' || householdType === 'singleParent') details.dualIncome = false;
  if (household.totalAssets !== null) details.totalAssets = household.totalAssets;
  if (household.parentAssets !== null) details.parentAssets = household.parentAssets;

  // 자녀: 자녀를 묻지 않는 가구 형태(혼자, 배우자와 둘)는 자녀가 없다고 본다.
  const childCount = household.childrenCount ?? (householdType === 'single' || householdType === 'couple' ? 0 : null);
  if (childCount !== null) {
    const years = household.childBirthYears.slice(0, childCount);
    while (years.length < childCount) years.push(null);
    details.children = years.map(childFromYear);
    profile.family.childrenCount = knownField(childCount);
    if (householdType === 'withChildren' || householdType === 'singleParent') details.unmarriedChildInHousehold = childCount > 0;
  }

  if (subscription.accountKind !== null) {
    profile.subscriptionAccount.hasAccount = knownField(subscription.accountKind !== 'none');
    details.accountKindEligible = subscription.accountKind === 'housing';
  }
  if (isIsoDate(subscription.openedAt)) details.subscriptionAccountOpenedAt = subscription.openedAt;
  if (subscription.paymentCount !== null) details.recognizedPaymentCount = subscription.paymentCount;
  if (subscription.depositAmount !== null) details.recognizedDepositAmount = subscription.depositAmount;
  if (subscription.firstRank !== null) details.firstRank = subscription.firstRank;

  return { profile, details };
}
