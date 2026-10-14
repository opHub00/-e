import type { AssessmentInput } from '../../applicationAssessment/types.ts';
import type { SamdoRecommendationItem, SamdoSupplyType } from '../samdo/types.ts';

export type OfficialCriterionStatus = 'PASS' | 'REVIEW' | 'FAIL';

export type OfficialCriterion = {
  id: 'eligibility' | 'income' | 'assets' | 'subscription';
  title: string;
  status: OfficialCriterionStatus;
  statusLabel: 'PASS' | '확인 필요' | '미충족';
  requirements: string[];
  current: string[];
};

const REQUIREMENTS: Record<Exclude<SamdoSupplyType, 'INSTITUTIONAL_RECOMMENDATION'>, {
  eligibility: string[];
  income: string[];
  subscription: string[];
}> = {
  YOUTH: {
    eligibility: ['19~39세', '미혼', '주택 소유 이력 無(본인)'],
    income: ['가구원수별 월평균소득 140% 이하'],
    subscription: ['주택청약종합저축 가입 6개월', '월 납입 6회 이상'],
  },
  NEWLYWED: {
    eligibility: ['혼인 7년 이내 또는 6세 이하 자녀', '예비신혼부부', '한부모가족(6세 이하 자녀)', '무주택세대구성원'],
    income: ['가구당 월평균소득 130% 이하', '맞벌이 200% 이하'],
    subscription: ['주택청약종합저축 가입 6개월', '월 납입 6회 이상'],
  },
  FIRST_HOME: {
    eligibility: ['주택 소유 이력 無(세대 전원)', '혼인 중 또는 미혼자녀 有', '근로자 또는 자영업자로서 5년 이상 소득세 납부'],
    income: ['가구당 월평균소득 130% 이하', '맞벌이 200% 이하'],
    subscription: ['주택청약종합저축 가입 6개월', '월 납입 6회 이상', '주택청약저축액 600만원 이상'],
  },
  NEWBORN: {
    eligibility: ['2세 미만 자녀 有', '무주택세대구성원'],
    income: ['가구당 월평균소득 140% 이하', '맞벌이 200% 이하'],
    subscription: ['주택청약종합저축 가입 6개월', '월 납입 6회 이상'],
  },
  GENERAL: {
    eligibility: ['무주택세대구성원'],
    income: ['가구당 월평균소득 100% 이하', '맞벌이 200% 이하'],
    subscription: ['주택청약종합저축 가입 6개월', '월 납입 6회 이상'],
  },
};

const MISSING: Record<OfficialCriterion['id'], RegExp> = {
  eligibility: /age|birth|marriage|family|child|home|housing|history|residence|restriction|special|winning/i,
  income: /income|dual|householdSize/i,
  assets: /asset|parent|children/i,
  subscription: /account|subscription|payment|deposit|firstRank/i,
};

const TEXT: Record<OfficialCriterion['id'], RegExp> = {
  eligibility: /19|39|혼인|미혼|자녀|태아|한부모|무주택|주택 소유|재당첨|당첨 제한|제주 거주/,
  income: /소득/,
  assets: /자산/,
  subscription: /청약|입주자저축|납입|저축액|통장|1순위/,
};

const labelOf = (status: OfficialCriterionStatus): OfficialCriterion['statusLabel'] =>
  status === 'PASS' ? 'PASS' : status === 'FAIL' ? '미충족' : '확인 필요';

function statusOf(item: SamdoRecommendationItem, id: OfficialCriterion['id']): OfficialCriterionStatus {
  if (item.failedReasons.some(reason => TEXT[id].test(reason))) return 'FAIL';
  if (item.missingFacts.some(fact => MISSING[id].test(fact))) return 'REVIEW';
  if (item.evidenceRequired.some(reason => TEXT[id].test(reason))) return 'REVIEW';
  if (item.matchedAdvantages.some(reason => TEXT[id].test(reason))) return 'PASS';
  return item.eligibility === 'ELIGIBLE' ? 'PASS' : 'REVIEW';
}

function childrenAfter(input: AssessmentInput, cutoff: string): number | null {
  const children = input.details.children;
  if (!children || children.some(child => !child.unborn && !child.birthDate)) return null;
  return children.filter(child => child.unborn || child.birthDate! >= cutoff).length;
}

const moneyMan = (value: number): string => `${Math.round(value / 10_000).toLocaleString('ko-KR')}만원`;
const moneyMillion = (value: number): string => `${Math.round(value / 1_000_000).toLocaleString('ko-KR')}백만원`;

function currentLine(value: string | null, status: OfficialCriterionStatus): string {
  if (!value) return '현재 입력: 확인 필요';
  return `현재 입력: ${value} · ${status === 'PASS' ? '기준 충족' : status === 'FAIL' ? '기준 미충족' : '확인 필요'}`;
}

function assetRequirements(type: SamdoSupplyType, recentChildren: number | null): string[] {
  if (type === 'YOUTH') {
    return [
      '2023.03.28 이후 출생 자녀 0명: 본인 276백만원 이하 / 부모 1,035백만원 이하',
      '2023.03.28 이후 출생 자녀 1명: 본인 311백만원 이하 / 부모 1,035백만원 이하',
      '2023.03.28 이후 출생 자녀 2명 이상: 본인 345백만원 이하 / 부모 1,035백만원 이하',
      ...(recentChildren === null ? [] : [`현재 적용 구간: 자녀 ${recentChildren >= 2 ? '2명 이상' : `${recentChildren}명`}`]),
    ];
  }
  return [
    '2023.03.28 이후 출생 자녀 0명: 세대 총자산 362백만원 이하',
    '2023.03.28 이후 출생 자녀 1명: 세대 총자산 397백만원 이하',
    '2023.03.28 이후 출생 자녀 2명 이상: 세대 총자산 431백만원 이하',
    ...(recentChildren === null ? [] : [`현재 적용 구간: 자녀 ${recentChildren >= 2 ? '2명 이상' : `${recentChildren}명`}`]),
  ];
}

export function buildOfficialCriteria(item: SamdoRecommendationItem, input: AssessmentInput): OfficialCriterion[] {
  if (item.supplyType === 'INSTITUTIONAL_RECOMMENDATION') return [];
  const requirements = REQUIREMENTS[item.supplyType];
  const recentChildren = childrenAfter(input, '2023-03-28');
  const statuses = {
    eligibility: statusOf(item, 'eligibility'),
    income: statusOf(item, 'income'),
    assets: statusOf(item, 'assets'),
    subscription: statusOf(item, 'subscription'),
  } as const;
  const income = item.supplyType === 'YOUTH' ? input.details.monthlyIncome : input.details.householdIncome;
  const assets = input.details.totalAssets;
  const parentAssets = input.details.parentAssets;
  const subscriptionParts = [
    input.details.subscriptionAccountOpenedAt ? `가입일 ${input.details.subscriptionAccountOpenedAt}` : null,
    input.details.recognizedPaymentCount === undefined ? null : `인정 납입 ${input.details.recognizedPaymentCount}회`,
    item.supplyType === 'FIRST_HOME' && input.details.recognizedDepositAmount !== undefined
      ? `저축총액 ${moneyMan(input.details.recognizedDepositAmount)}` : null,
  ].filter((part): part is string => Boolean(part));
  const assetParts = [
    assets === undefined ? null : `${item.supplyType === 'YOUTH' ? '본인' : '세대'} ${moneyMillion(assets)}`,
    item.supplyType === 'YOUTH' && parentAssets !== undefined ? `부모 ${moneyMillion(parentAssets)}` : null,
  ].filter((part): part is string => Boolean(part));

  return [
    {
      id: 'eligibility', title: '입주자격', status: statuses.eligibility, statusLabel: labelOf(statuses.eligibility),
      requirements: requirements.eligibility,
      current: [currentLine(statuses.eligibility === 'REVIEW' ? null : '공고 기준 판정 완료', statuses.eligibility)],
    },
    {
      id: 'income', title: '소득기준', status: statuses.income, statusLabel: labelOf(statuses.income),
      requirements: requirements.income,
      current: [currentLine(income === undefined ? null : `월 ${moneyMan(income)}`, statuses.income)],
    },
    {
      id: 'assets', title: '자산기준', status: statuses.assets, statusLabel: labelOf(statuses.assets),
      requirements: assetRequirements(item.supplyType, recentChildren),
      current: [currentLine(assetParts.length && !(item.supplyType === 'YOUTH' && parentAssets === undefined) ? assetParts.join(' / ') : null, statuses.assets)],
    },
    {
      id: 'subscription', title: '청약통장', status: statuses.subscription, statusLabel: labelOf(statuses.subscription),
      requirements: requirements.subscription,
      current: [currentLine(subscriptionParts.length >= 2 ? subscriptionParts.join(' / ') : null, statuses.subscription)],
    },
  ];
}
