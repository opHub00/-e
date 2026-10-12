import type { SamdoQuestion, SamdoQuestionPlan, SamdoRecommendation, SamdoSupplyType } from './types.ts';
import { samdoFactWasAddressed, type AnswerStateMap } from '../questionPolicy.ts';

type Definition = Omit<SamdoQuestion, 'usedBy'>;

const QUESTIONS: Record<string, Definition> = {
  age: { id: 'birthDate', factKey: 'birthDate', scope: 'APPLICANT', kind: 'DATE', title: '신청자의 생년월일은 언제인가요?', hint: '공고일 기준 연령을 정확히 계산해요.', evidenceOnly: false },
  birthDate: { id: 'birthDate', factKey: 'birthDate', scope: 'APPLICANT', kind: 'DATE', title: '신청자의 생년월일은 언제인가요?', hint: '공고일 기준 연령을 정확히 계산해요.', evidenceOnly: false },
  currentResidence: { id: 'currentResidence', factKey: 'currentResidence', scope: 'APPLICANT', kind: 'SELECT', title: '공고일 현재 제주특별자치도에 거주하고 있나요?', hint: '주민등록표 등·초본 기준으로 확인해요.', evidenceOnly: false },
  residence: { id: 'currentResidence', factKey: 'currentResidence', scope: 'APPLICANT', kind: 'SELECT', title: '공고일 현재 제주특별자치도에 거주하고 있나요?', hint: '주민등록표 등·초본 기준으로 확인해요.', evidenceOnly: false },
  residenceStartDate: { id: 'residenceStartDate', factKey: 'residenceStartDate', scope: 'APPLICANT', kind: 'DATE', title: '제주에 계속 거주하기 시작한 날은 언제인가요?', hint: '전입일과 해외 체류기간을 함께 확인해요.', evidenceOnly: false },
  overseasClear: { id: 'overseasStayHistory', factKey: 'overseasStayHistory', scope: 'APPLICANT', kind: 'BOOLEAN', title: '제주 거주기간 중 장기 해외 체류가 있었나요?', hint: '연속 거주기간은 출입국 기록에 따라 달라질 수 있어요.', evidenceOnly: true },
  maritalStatus: { id: 'maritalStatus', factKey: 'maritalStatus', scope: 'APPLICANT', kind: 'SELECT', title: '현재 혼인 상태는 어떻게 되나요?', hint: '미혼·기혼·예비신혼·한부모 여부를 확인해요.', evidenceOnly: false },
  familyCategory: { id: 'familyCategory', factKey: 'familyCategory', scope: 'HOUSEHOLD', kind: 'SELECT', title: '신혼부부 공급에서 어떤 가구 유형에 해당하나요?', hint: '기혼, 예비신혼부부, 자격 있는 한부모가족 중 선택해요.', evidenceOnly: false },
  marriageDate: { id: 'marriageDate', factKey: 'marriageDate', scope: 'HOUSEHOLD', kind: 'DATE', title: '혼인신고일은 언제인가요?', hint: '혼인기간과 신혼부부 공급단계를 계산해요.', evidenceOnly: false },
  plannedMarriageWithinDeadline: { id: 'plannedMarriageWithinDeadline', factKey: 'plannedMarriageWithinDeadline', scope: 'SPOUSE', kind: 'BOOLEAN', title: '예비배우자와 입주 전까지 혼인관계를 증명할 수 있나요?', hint: '예비신혼부부에게만 필요해요.', evidenceOnly: false },
  children: { id: 'children', factKey: 'children', scope: 'HOUSEHOLD', kind: 'DATE', title: '자녀 각각의 생년월일과 태아·입양 여부를 알려주세요.', hint: '2세 미만, 미성년 자녀 수, 출산특례를 같은 답으로 확인해요.', evidenceOnly: false },
  childUnderTwo: { id: 'children', factKey: 'children', scope: 'HOUSEHOLD', kind: 'DATE', title: '자녀 각각의 생년월일과 태아·입양 여부를 알려주세요.', hint: '2세가 되는 날을 포함해 공고일 기준으로 계산해요.', evidenceOnly: false },
  householdNoHome: { id: 'householdNoHome', factKey: 'householdNoHome', scope: 'HOUSEHOLD', kind: 'BOOLEAN', title: '본인과 세대구성원 모두 현재 무주택인가요?', hint: '분리된 배우자와 그 세대원도 포함될 수 있어요.', evidenceOnly: false },
  noHome: { id: 'applicantNoHome', factKey: 'noHome', scope: 'APPLICANT', kind: 'BOOLEAN', title: '신청자 본인은 현재 무주택인가요?', hint: '청년은 신청자 본인을 기준으로 확인해요.', evidenceOnly: false },
  neverOwned: { id: 'applicantNeverOwned', factKey: 'neverOwned', scope: 'APPLICANT', kind: 'BOOLEAN', title: '신청자 본인이 과거 주택을 소유한 적이 있나요?', hint: '분양권 등을 포함한 주택소유 이력을 확인해요.', evidenceOnly: false },
  householdNeverOwned: { id: 'householdNeverOwned', factKey: 'householdNeverOwned', scope: 'HOUSEHOLD', kind: 'BOOLEAN', title: '세대구성원 모두 과거 주택을 소유한 적이 없나요?', hint: '생애최초는 세대 전체의 과거 이력을 확인해요.', evidenceOnly: false },
  housing: { id: 'housingHistory', factKey: 'housingHistory', scope: 'HOUSEHOLD', kind: 'BOOLEAN', title: '본인과 세대의 현재·과거 주택소유 이력을 확인했나요?', hint: '소유·처분일과 분양권 이력을 함께 확인해요.', evidenceOnly: false },
  noHomeMonths: { id: 'noHomeSince', factKey: 'noHomeSince', scope: 'HOUSEHOLD', kind: 'DATE', title: '세대 전체가 무주택이 된 날은 언제인가요?', hint: '일반공급 1순위 선정순차를 확인해요.', evidenceOnly: false },
  calculatedNoHomeMonths: { id: 'housingHistory', factKey: 'housingHistory', scope: 'HOUSEHOLD', kind: 'DATE', title: '가장 최근 주택 처분일과 최초 혼인신고일을 확인해 주세요.', hint: '공고 기준 무주택기간을 계산해요.', evidenceOnly: false },
  hasAccount: { id: 'hasAccount', factKey: 'hasAccount', scope: 'APPLICANT', kind: 'BOOLEAN', title: '주택청약종합저축 또는 청약저축이 있나요?', hint: '공고가 인정하는 입주자저축인지 확인해요.', evidenceOnly: false },
  accountKindEligible: { id: 'accountKindEligible', factKey: 'accountKindEligible', scope: 'APPLICANT', kind: 'BOOLEAN', title: '공고가 인정하는 청약통장 종류인가요?', hint: '주택청약종합저축 또는 청약저축 기준입니다.', evidenceOnly: true },
  accountMonths: { id: 'subscriptionAccountOpenedAt', factKey: 'subscriptionAccountOpenedAt', scope: 'APPLICANT', kind: 'DATE', title: '청약통장 가입일은 언제인가요?', hint: '가입 6개월 경과 여부를 계산해요.', evidenceOnly: false },
  recognizedPaymentCount: { id: 'recognizedPaymentCount', factKey: 'recognizedPaymentCount', scope: 'APPLICANT', kind: 'NUMBER', title: '청약통장 인정 납입 횟수는 몇 회인가요?', hint: '청약통장 순위확인서 기준의 인정 횟수를 입력해요.', evidenceOnly: false },
  recognizedDepositAmount: { id: 'recognizedDepositAmount', factKey: 'recognizedDepositAmount', scope: 'APPLICANT', kind: 'NUMBER', title: '청약통장 인정 저축총액은 얼마인가요?', hint: '생애최초 600만원 기준과 일반공급 선정순차에 사용해요.', evidenceOnly: false },
  firstRank: { id: 'firstRank', factKey: 'firstRank', scope: 'APPLICANT', kind: 'BOOLEAN', title: '청약통장 순위확인서상 1순위인가요?', hint: '가입기간·납입횟수·세대주·5년 무당첨을 함께 확인해요.', evidenceOnly: false },
  isHouseholdHead: { id: 'isHouseholdHead', factKey: 'isHouseholdHead', scope: 'APPLICANT', kind: 'BOOLEAN', title: '공고일 현재 세대주인가요?', hint: '생애최초 및 일반공급 1순위에 필요해요.', evidenceOnly: false },
  householdNoWinningFiveYears: { id: 'householdNoWinningFiveYears', factKey: 'householdNoWinningFiveYears', scope: 'HOUSEHOLD', kind: 'BOOLEAN', title: '세대구성원 모두 과거 5년 이내 다른 주택 당첨 이력이 없나요?', hint: '일반공급 1순위와 생애최초에 필요해요.', evidenceOnly: false },
  householdIncome: { id: 'householdIncome', factKey: 'householdIncome', scope: 'HOUSEHOLD', kind: 'NUMBER', title: '세대 전체 월평균소득은 얼마인가요?', hint: '사회보장정보시스템에서 확인되는 세대원 소득 합계 기준입니다.', evidenceOnly: true },
  monthlyIncome: { id: 'monthlyIncome', factKey: 'monthlyIncome', scope: 'APPLICANT', kind: 'NUMBER', title: '신청자 본인의 월평균소득은 얼마인가요?', hint: '청년 특별공급 소득과 가점을 확인해요.', evidenceOnly: true },
  dualIncome: { id: 'dualIncome', factKey: 'dualIncome', scope: 'HOUSEHOLD', kind: 'BOOLEAN', title: '신청자와 배우자 모두 근로·사업소득이 있나요?', hint: '공고의 맞벌이 소득기준을 적용해요.', evidenceOnly: false },
  incomeHouseholdSize: { id: 'incomeHouseholdSize', factKey: 'incomeHouseholdSize', scope: 'HOUSEHOLD', kind: 'NUMBER', title: '소득기준에 포함되는 가구원은 몇 명인가요?', hint: '직계존속은 등재기간에 따라 제외될 수 있어요.', evidenceOnly: true },
  totalAssets: { id: 'totalAssets', factKey: 'totalAssets', scope: 'HOUSEHOLD', kind: 'NUMBER', title: '세대의 총자산은 얼마인가요?', hint: '부동산·자동차·금융·일반자산에서 인정 부채를 차감한 금액이에요.', evidenceOnly: true },
  parentAssets: { id: 'parentAssets', factKey: 'parentAssets', scope: 'HOUSEHOLD', kind: 'NUMBER', title: '청년 신청자의 부모님 총자산은 얼마인가요?', hint: '청년 특별공급에서만 확인해요.', evidenceOnly: true },
  incomeTaxPaymentYears: { id: 'incomeTaxPaymentYears', factKey: 'incomeTaxPaymentYears', scope: 'APPLICANT', kind: 'NUMBER', title: '근로·사업소득세를 납부한 기간은 총 몇 년인가요?', hint: '생애최초는 5년 이상, 청년 우선·가점에도 사용해요.', evidenceOnly: true },
  workOrBusinessIncome: { id: 'workOrBusinessIncome', factKey: 'workOrBusinessIncome', scope: 'APPLICANT', kind: 'BOOLEAN', title: '현재 근로 또는 사업소득이 있나요?', hint: '청년 우선공급 대상 여부를 확인해요.', evidenceOnly: true },
  specialSupplyHistory: { id: 'specialSupplyHistory', factKey: 'specialSupplyHistory', scope: 'HOUSEHOLD', kind: 'BOOLEAN', title: '본인 또는 세대에 과거 특별공급 당첨 이력이 있나요?', hint: '혼인·출산특례 대상이면 해당 이력과 날짜를 별도로 확인해요.', evidenceOnly: true },
  noSpecialSupplyHistory: { id: 'specialSupplyHistory', factKey: 'specialSupplyHistory', scope: 'HOUSEHOLD', kind: 'BOOLEAN', title: '본인 또는 세대에 과거 특별공급 당첨 이력이 있나요?', hint: '혼인·출산특례 대상이면 해당 이력과 날짜를 별도로 확인해요.', evidenceOnly: true },
  reWinningRestriction: { id: 'reWinningRestriction', factKey: 'reWinningRestriction', scope: 'HOUSEHOLD', kind: 'BOOLEAN', title: '현재 재당첨 또는 부적격 당첨 제한기간에 해당하나요?', hint: '청약홈 제한사항 조회 결과를 기준으로 답해요.', evidenceOnly: true },
  noReWinningRestriction: { id: 'reWinningRestriction', factKey: 'reWinningRestriction', scope: 'HOUSEHOLD', kind: 'BOOLEAN', title: '현재 재당첨 또는 부적격 당첨 제한기간에 해당하나요?', hint: '청약홈 제한사항 조회 결과를 기준으로 답해요.', evidenceOnly: true },
  specialExceptions: { id: 'specialExceptions', factKey: 'specialExceptions', scope: 'HOUSEHOLD', kind: 'SELECT', title: '혼인·출산·장기복무군인 특례에 해당하는 항목이 있나요?', hint: '특례는 자동 확정하지 않고 증빙 확인으로 남겨요.', evidenceOnly: true },
  exceptionsClear: { id: 'specialExceptions', factKey: 'specialExceptions', scope: 'HOUSEHOLD', kind: 'SELECT', title: '혼인·출산·장기복무군인 특례에 해당하는 항목이 있나요?', hint: '특례는 자동 확정하지 않고 증빙 확인으로 남겨요.', evidenceOnly: true },
};

const strip = (key: string) => key.replace(/^(?:input|review|fact):/, '');

function definition(key: string): Definition | undefined {
  return QUESTIONS[strip(key)];
}

/** Missing facts are deduplicated across only the still-viable supply types. */
export function buildSamdoQuestionPlan(recommendation: SamdoRecommendation, answerStates: AnswerStateMap = {}): SamdoQuestionPlan {
  const usage = new Map<string, { definition: Definition; usedBy: Set<SamdoSupplyType> }>();
  const excludedIneligible: SamdoSupplyType[] = [];
  for (const evaluation of recommendation.evaluations) {
    if (!evaluation.autoRecommend) continue;
    if (evaluation.eligibility === 'INELIGIBLE') {
      excludedIneligible.push(evaluation.supplyType);
      continue;
    }
    for (const fact of evaluation.missingFacts) {
      if (samdoFactWasAddressed(fact, answerStates)) continue;
      const item = definition(fact);
      if (!item) continue;
      const current = usage.get(item.id) ?? { definition: item, usedBy: new Set<SamdoSupplyType>() };
      current.usedBy.add(evaluation.supplyType);
      usage.set(item.id, current);
    }
  }
  const all = [...usage.values()].map(item => ({ ...item.definition, usedBy: [...item.usedBy] }));
  return {
    questions: all.filter(item => !item.evidenceOnly),
    evidenceOnly: all.filter(item => item.evidenceOnly),
    excludedIneligible,
  };
}

export const SAMDO_QUESTION_DEFINITIONS = QUESTIONS;
