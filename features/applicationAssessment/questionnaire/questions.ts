import type { AnnouncementRules, SupplyType } from '../types.ts';
import type { ApplicantProfileV2, ProfileFieldState } from '../../profile/domain.ts';
import { displayDate } from './dateInput.ts';

/**
 * 조건부 질문지.
 *
 * 답변은 기존 판정 화면과 같은 `Record<string, string>` 이다. 그래서 이 계층은 마지막에
 * parseForm 에 그대로 넘어가고, 엔진 입력(details) 계약은 하나도 바뀌지 않는다.
 * 여기서 하는 일은 세 가지뿐이다: 무엇을 물을지 고르고, 순서를 정하고, 프로필 값을 기본값으로 채운다.
 */
export type Answers = Record<string, string>;
export type QuestionKind = 'boolean' | 'choice' | 'date' | 'number' | 'money' | 'dateList';
export type QuestionOption = { value: string; label: string };

export type Question = {
  id: string;
  /** 한 번에 하나만 판단하게 하는 질문 문장. */
  title: string;
  kind: QuestionKind;
  section: string;
  options?: QuestionOption[];
  /** 왜 이 질문이 지금 필요한지. 앞선 답변 때문에 생긴 질문이면 그 이유를 적는다. */
  why?: string;
  help?: string;
  placeholder?: string;
  /** 프로필에서 가져와 채운 기본값. 사용자가 그대로 두거나 고칠 수 있다. */
  prefill?: { value: string; source: string };
};

type ProfileField<T> = ProfileFieldState<T>;
const known = <T>(field: ProfileField<T> | undefined): T | undefined => (field?.status === 'known' ? field.value : undefined);

/** 질문이 채우는 엔진 사실. 규칙이 하나도 읽지 않으면 그 질문은 묻지 않는다. */
const QUESTION_FACTS: Record<string, string[]> = {
  birthDate: ['age', 'calculatedNoHomeMonths'],
  currentResidence: ['residence'],
  overseas: ['overseasClear', 'residenceMonths'],
  residenceStartDate: ['residenceMonths'],
  familyCategory: ['familyCategory', 'newlywedMarriageScoreMonths', 'singleParentChildScoreMonths'],
  marriageDate: ['marriageWithin2Years', 'marriageWithin7Years', 'marriageMonths', 'newlywedMarriageScoreMonths'],
  everMarried: ['calculatedNoHomeMonths'],
  firstMarriageDate: ['calculatedNoHomeMonths'],
  housingDisposalDates: ['calculatedNoHomeMonths'],
  plannedMarriageWithinDeadline: ['plannedMarriageWithinDeadline'],
  singleParentQualified: ['singleParentQualified'],
  unmarriedChildInHousehold: ['unmarriedChildInHousehold'],
  children: ['hasChildren', 'hasChildUnder3', 'hasChildUnder7', 'minorChildren', 'youngestChildMonths', 'childbirthClear', 'singleParentChildScoreMonths'],
  isHouseholdHead: ['isHouseholdHead'],
  incomeHouseholdSize: ['incomeHouseholdSize', 'householdIncomeScoreTier', 'householdIncomeScoreEligible'],
  noHomeSince: ['noHomeMonths'],
  specialSupplyHistory: ['noSpecialSupplyHistory'],
  reWinningRestriction: ['noReWinningRestriction'],
  householdNoWinningFiveYears: ['householdNoWinningFiveYears'],
  hasAccount: ['hasAccount', 'accountMonths', 'accountKindEligible', 'recognizedPaymentCount', 'recognizedDepositAmount'],
  accountKindEligible: ['accountKindEligible'],
  subscriptionAccountOpenedAt: ['accountMonths'],
  recognizedPaymentCount: ['recognizedPaymentCount'],
  recognizedDepositAmount: ['recognizedDepositAmount'],
  firstRank: ['firstRank'],
  monthlyIncome: ['monthlyIncome'],
  householdIncome: ['householdIncome', 'householdIncomeScoreTier', 'householdIncomeScoreEligible'],
  dualIncome: ['dualIncome', 'householdIncomeScoreTier', 'householdIncomeScoreEligible'],
  workStartedAt: ['workMonths', 'workOrTaxMonths'],
  totalAssets: ['totalAssets'],
  parentAssets: ['parentAssets'],
  realEstateAssets: ['realEstateAssets'],
  vehicleValue: ['vehicleValue'],
  youthPriorityTarget: ['youthPriorityTarget'],
  newlywedPriorityTarget: ['newlywedPriorityTarget'],
  exceptions: ['exceptionsClear'],
};

/** 한 공급유형의 규칙이 읽는 사실만 모은다(자격·공급단계·배점 전부). */
export function factsUsedBySupply(rules: AnnouncementRules | undefined, supply: SupplyType): Set<string> {
  const out = new Set<string>();
  const walk = (expression: unknown) => {
    if (!expression || typeof expression !== 'object') return;
    const node = expression as Record<string, unknown>;
    if (Array.isArray(node.all)) node.all.forEach(walk);
    else if (Array.isArray(node.any)) node.any.forEach(walk);
    else if (typeof node.fact === 'string') out.add(node.fact);
  };
  for (const item of rules?.supplies ?? []) {
    if (item.type !== supply) continue;
    item.eligibility.forEach(rule => walk(rule.expression));
    for (const stage of item.stages) {
      stage.conditions.forEach(rule => walk(rule.expression));
      stage.scores?.forEach(rule => out.add(rule.fact));
    }
  }
  return out;
}

const YES_NO: QuestionOption[] = [{ value: 'yes', label: '예' }, { value: 'no', label: '아니요' }, { value: '', label: '잘 모르겠어요' }];
const FAMILY_OPTIONS: QuestionOption[] = [
  { value: 'married', label: '신혼부부 (혼인신고를 마쳤어요)' },
  { value: 'engaged', label: '예비신혼부부 (아직 혼인 전이에요)' },
  { value: 'singleParent', label: '한부모 가족' },
  { value: '', label: '잘 모르겠어요' },
];

export type QuestionnaireInput = {
  rules: AnnouncementRules | undefined;
  supply: SupplyType;
  profile: ApplicantProfileV2;
  answers: Answers;
  /** 공고 기준일. 날짜 상한과 "공고일 현재" 문구에 쓴다. */
  announcementDate?: string | null;
  /** 공고가 지역 요건을 볼 때의 지역 이름. */
  residenceRegion?: { short: string; profile: string } | null;
};

const answered = (answers: Answers, id: string) => (answers[id] ?? '').trim() !== '';

/**
 * 지금 화면에 필요한 질문만, 물어볼 순서대로 돌려준다.
 * 앞선 답변이나 저장된 프로필로 이미 정해진 질문은 목록에서 빠진다.
 */
export function buildQuestionnaire(input: QuestionnaireInput): Question[] {
  const { rules, supply, profile, answers } = input;
  const facts = factsUsedBySupply(rules, supply);
  const uses = (id: string) => (QUESTION_FACTS[id] ?? []).some(fact => facts.has(fact));
  const asOf = input.announcementDate ?? undefined;
  const asOfLabel = asOf ? `공고일(${displayDate(asOf)}) 기준` : '공고일 기준';
  const questions: Question[] = [];
  const add = (question: Question | null) => { if (question) questions.push(question); };

  // ── 기본
  const savedBirthDate = known(profile.basic.birthDate);
  if (uses('birthDate')) add({
    id: 'birthDate', kind: 'date', section: '기본',
    title: '생년월일이 언제인가요?',
    help: '숫자만 입력해도 돼요. 예: 19940705',
    why: `${asOfLabel} 나이로 신청 자격을 확인해요.`,
    prefill: savedBirthDate ? { value: savedBirthDate, source: '프로필에 저장된 생년월일' } : undefined,
  });

  // ── 거주
  const region = input.residenceRegion;
  if (uses('currentResidence')) add({
    id: 'currentResidence', kind: 'choice', section: '거주',
    title: region ? `${asOfLabel}으로 ${region.short}에 살고 계신가요?` : `${asOfLabel} 거주지역은 어디인가요?`,
    options: region
      ? [{ value: region.profile, label: `네, ${region.short}에 살아요` }, { value: '기타', label: `아니요, ${region.short} 밖에 살아요` }, { value: '', label: '잘 모르겠어요' }]
      : [{ value: profile.residence.currentRegion, label: profile.residence.currentRegion }, { value: '기타', label: '다른 지역' }, { value: '', label: '잘 모르겠어요' }],
    why: '공고의 지역 요건과 지역우선 공급을 확인해요.',
    prefill: profile.residence.currentRegion ? { value: profile.residence.currentRegion, source: '프로필에 저장된 거주지역' } : undefined,
  });
  if (uses('overseas')) add({
    id: 'overseas', kind: 'boolean', section: '거주', options: YES_NO,
    title: '최근 거주기간 중 해외에 머문 적이 있나요?',
    why: '해외체류가 있으면 연속거주 인정 기준을 따로 확인해야 해요.',
  });
  // 해외체류가 있으면 연속거주기간을 이 화면에서 계산하지 않는다. 물어도 쓰이지 않으므로 묻지 않는다.
  if (uses('residenceStartDate') && answers.overseas !== 'yes') add({
    id: 'residenceStartDate', kind: 'date', section: '거주',
    title: '지금 지역에 언제부터 계속 살고 계신가요?',
    help: '전입신고일 기준으로 입력해 주세요. 예: 20230914',
    why: '연속거주기간이 지역우선 공급과 배점에 쓰여요.',
  });

  // ── 가족
  const marriageStatus = known(profile.family.marriageStatus);
  if (supply === 'newlywed' && uses('familyCategory')) add({
    id: 'familyCategory', kind: 'choice', section: '가족', options: FAMILY_OPTIONS,
    title: '어느 쪽에 해당하시나요?',
    why: '신혼부부·예비신혼부부·한부모는 확인하는 정보와 배점 항목이 서로 달라요.',
    prefill: marriageStatus === 'married' ? { value: 'married', source: '프로필의 혼인 여부(기혼)' } : undefined,
  });
  const family = answers.familyCategory ?? (marriageStatus === 'married' ? 'married' : '');
  if (uses('marriageDate') && (supply !== 'newlywed' || family === 'married')) add({
    id: 'marriageDate', kind: 'date', section: '가족',
    title: '혼인신고일이 언제인가요?',
    help: '숫자만 입력해도 돼요. 예: 20240911',
    why: '혼인기간으로 신혼부부 자격과 혼인기간 배점을 계산해요.',
  });
  if (supply === 'newlywed' && family === 'engaged' && uses('plannedMarriageWithinDeadline')) add({
    id: 'plannedMarriageWithinDeadline', kind: 'boolean', section: '가족', options: YES_NO,
    title: '입주 전까지 혼인 사실을 증명할 수 있나요?',
    why: '예비신혼부부는 이 조건이 자격 요건이에요.',
  });
  if (supply === 'newlywed' && family === 'singleParent' && uses('singleParentQualified')) add({
    id: 'singleParentQualified', kind: 'boolean', section: '가족', options: YES_NO,
    title: '한부모가족 증명서를 낼 수 있나요?',
    why: '한부모 자격은 증명서로 확인해요.',
  });
  if (uses('everMarried') && supply === 'newlywed') add({
    id: 'everMarried', kind: 'boolean', section: '가족', options: YES_NO,
    title: '과거를 포함해 혼인한 적이 있나요?',
    why: '무주택기간을 혼인신고일부터 셀지 만 30세부터 셀지가 달라져요.',
    prefill: marriageStatus === 'married' ? { value: 'yes', source: '프로필의 혼인 여부(기혼)' } : undefined,
  });
  if (uses('firstMarriageDate') && answers.everMarried === 'yes' && !answered(answers, 'marriageDate')) add({
    id: 'firstMarriageDate', kind: 'date', section: '가족',
    title: '최초 혼인신고일이 언제인가요?',
    why: '혼인 이력이 있으면 무주택기간을 최초 혼인신고일부터 계산해요.',
  });
  const childrenCount = known(profile.family.childrenCount);
  const childYears = known(profile.family.childBirthYears);
  if (uses('children')) add({
    id: 'children', kind: 'dateList', section: '가족',
    title: '자녀가 있나요? 있다면 생년월일을 알려주세요.',
    help: '여러 명이면 쉼표로 구분해요. 예: 20220510, 20240103 · 없으면 "없음"',
    why: '자녀 수와 나이가 자격과 배점에 쓰여요.',
    prefill: childrenCount === 0
      ? { value: '없음', source: '프로필에 저장된 자녀 수(0명)' }
      : childrenCount && childYears?.length === childrenCount
        ? { value: childYears.map(year => `${year}-01-01`).join(', '), source: `프로필에 저장된 자녀 ${childrenCount}명의 출생연도` }
        : undefined,
  });
  if (uses('unmarriedChildInHousehold') && supply === 'firstHome' && marriageStatus !== 'married') add({
    id: 'unmarriedChildInHousehold', kind: 'boolean', section: '가족', options: YES_NO,
    title: '같은 등본에 미혼 자녀가 있나요?',
    why: '혼인 중이 아니라면 이 조건으로 자격을 확인해요.',
  });
  if (uses('incomeHouseholdSize')) add({
    id: 'incomeHouseholdSize', kind: 'number', section: '가족',
    title: '소득을 계산할 가구원은 몇 명인가요?',
    help: '본인·배우자·자녀(태아 포함)를 세어 주세요.',
    why: '가구원 수에 따라 소득 기준 금액이 달라져요.',
    prefill: known(profile.household.memberCount) ? { value: String(known(profile.household.memberCount)), source: '프로필에 저장된 세대원 수' } : undefined,
  });
  if (uses('isHouseholdHead') && supply === 'firstHome') add({
    id: 'isHouseholdHead', kind: 'boolean', section: '가족', options: YES_NO,
    title: `${asOfLabel}으로 세대주이신가요?`,
    why: '생애최초 특별공급은 세대주 여부를 확인해요.',
  });

  // ── 주택 이력
  if (uses('noHomeSince') && supply === 'newlywed') add({
    id: 'noHomeSince', kind: 'date', section: '주택', title: '무주택기간은 언제부터인가요?',
    why: '공고가 인정하는 무주택기간을 확인해요.',
  });
  if (uses('housingDisposalDates') && known(profile.housing.householdDisqualifyingPreviousOwnership) === true) add({
    id: 'housingDisposalDates', kind: 'dateList', section: '주택',
    title: '세대원이 주택을 처분한 날짜를 알려주세요.',
    help: '여러 건이면 쉼표로 구분해요. 예: 20180301, 20200715',
    why: '프로필에 세대원의 과거 주택 소유 이력이 있어서, 처분일이 있어야 무주택기간을 계산할 수 있어요.',
  });
  if (uses('specialSupplyHistory')) add({
    id: 'specialSupplyHistory', kind: 'boolean', section: '주택', options: YES_NO,
    title: '특별공급에 당첨된 적이 있나요?',
    why: '특별공급은 세대당 한 번만 받을 수 있어요.',
  });
  if (uses('reWinningRestriction')) add({
    id: 'reWinningRestriction', kind: 'boolean', section: '주택', options: YES_NO,
    title: '재당첨 제한 기간에 해당하나요?',
    why: '제한 기간에는 신청할 수 없어요.',
  });
  if (uses('householdNoWinningFiveYears') && supply === 'firstHome') add({
    id: 'householdNoWinningFiveYears', kind: 'boolean', section: '주택', options: YES_NO,
    title: '세대원 모두 최근 5년 안에 다른 주택에 당첨된 적이 없나요?',
    why: '생애최초 특별공급의 자격 요건이에요.',
  });

  // ── 청약통장: 없으면 뒤따르는 통장 질문을 모두 건너뛴다.
  const savedAccount = known(profile.subscriptionAccount.hasAccount);
  if (uses('hasAccount') && savedAccount === undefined) add({
    id: 'hasAccount', kind: 'boolean', section: '청약통장', options: [{ value: 'yes', label: '네, 있어요' }, { value: 'no', label: '아니요, 없어요' }],
    title: '청약통장을 가지고 계신가요?',
    why: '통장이 없으면 통장 관련 질문은 묻지 않아요.',
  });
  const hasAccount = savedAccount ?? (answers.hasAccount === 'yes' ? true : answers.hasAccount === 'no' ? false : undefined);
  if (hasAccount === true) {
    if (uses('accountKindEligible')) add({
      id: 'accountKindEligible', kind: 'boolean', section: '청약통장', options: YES_NO,
      title: '주택청약종합저축(또는 청약저축)인가요?',
      why: '공고가 인정하는 통장 종류인지 확인해요.',
    });
    if (uses('subscriptionAccountOpenedAt')) add({
      id: 'subscriptionAccountOpenedAt', kind: 'date', section: '청약통장',
      title: '청약통장에 언제 가입하셨나요?',
      help: '숫자만 입력해도 돼요. 예: 20200315',
      why: '가입기간이 순위와 배점에 쓰여요.',
      prefill: accountOpenedFromProfile(profile, asOf),
    });
    if (uses('recognizedPaymentCount')) add({
      id: 'recognizedPaymentCount', kind: 'number', section: '청약통장',
      title: '납입인정 횟수는 몇 회인가요?', help: '청약통장 순위확인서에 적힌 횟수예요.',
      why: '납입 횟수가 자격과 배점에 쓰여요.',
    });
    if (uses('recognizedDepositAmount') && supply === 'firstHome') add({
      id: 'recognizedDepositAmount', kind: 'money', section: '청약통장',
      title: '선납금을 포함한 저축액은 얼마인가요?', help: '원 단위로 입력해 주세요.',
      why: '생애최초는 저축액 기준을 함께 확인해요.',
    });
    if (uses('firstRank') && supply === 'firstHome') add({
      id: 'firstRank', kind: 'boolean', section: '청약통장', options: YES_NO,
      title: '청약통장 순위확인서에서 1순위인가요?',
      why: '생애최초 특별공급은 1순위만 신청할 수 있어요.',
    });
  }

  // ── 소득·자산
  if (uses('monthlyIncome') && supply === 'youth') add({
    id: 'monthlyIncome', kind: 'money', section: '소득', title: '본인 월평균소득은 얼마인가요?',
    help: '세전 금액을 원 단위로 입력해 주세요.', why: '공고의 소득 기준과 배점에 쓰여요.',
  });
  if (uses('householdIncome')) add({
    id: 'householdIncome', kind: 'money', section: '소득', title: '세대 월평균소득은 얼마인가요?',
    help: '세대구성원 소득을 합해 원 단위로 입력해 주세요.', why: '공고의 소득 기준과 배점에 쓰여요.',
  });
  if (uses('dualIncome')) add({
    id: 'dualIncome', kind: 'boolean', section: '소득', options: YES_NO,
    title: '맞벌이인가요?', why: '맞벌이 여부에 따라 소득 기준 금액이 달라져요.',
    prefill: marriageStatus === 'single' ? { value: 'no', source: '프로필의 혼인 여부(미혼)' } : undefined,
  });
  if (uses('workStartedAt') && supply === 'youth') add({
    id: 'workStartedAt', kind: 'date', section: '소득', title: '언제부터 일을 시작하셨나요?',
    why: '근로기간이 청년 특별공급 요건에 쓰여요.',
  });
  for (const [id, title] of [['totalAssets', '본인(또는 세대) 자산 총액은 얼마인가요?'], ['parentAssets', '부모님 자산 총액은 얼마인가요?'],
    ['realEstateAssets', '세대가 가진 부동산(건물+토지) 가액은 얼마인가요?'], ['vehicleValue', '세대 자동차 중 가장 비싼 차량가액은 얼마인가요?']] as const) {
    if (uses(id)) add({ id, kind: 'money', section: '자산', title, help: '원 단위로 입력해 주세요. 없으면 0.', why: '공고의 자산 기준과 비교해요.' });
  }

  // ── 공고에서 직접 확인한 경우에만
  for (const [id, title] of [['youthPriorityTarget', '공고의 청년 우선공급 대상 조건에 해당하나요?'], ['newlywedPriorityTarget', '공고의 신혼부부 우선공급 대상 조건에 해당하나요?']] as const) {
    if (uses(id)) add({ id, kind: 'boolean', section: '공고 확인', options: YES_NO, title, why: '공고 원문에서 확인한 경우에만 답해 주세요.' });
  }
  if (uses('exceptions')) add({
    id: 'exceptions', kind: 'boolean', section: '공고 확인', options: YES_NO,
    title: '출산·혼인 특례처럼 따로 확인할 사정이 있나요?',
    why: '특례가 있으면 결과에 추가 확인이 필요하다고 표시해요.',
  });
  return questions;
}

/** 프로필의 가입기간(개월)에서 가입일을 되돌린다. 정확한 날짜를 모르면 제안하지 않는다. */
function accountOpenedFromProfile(profile: ApplicantProfileV2, asOf: string | undefined): Question['prefill'] {
  const months = known(profile.subscriptionAccount.accountMonths);
  if (!Number.isInteger(months) || months! < 0 || !asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return undefined;
  const [year, month, day] = asOf.split('-').map(Number);
  const absolute = year * 12 + (month - 1) - months!;
  const openedYear = Math.floor(absolute / 12), openedMonth = (absolute % 12) + 1;
  const lastDay = new Date(Date.UTC(openedYear, openedMonth, 0)).getUTCDate();
  const value = `${openedYear}-${String(openedMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
  return { value, source: `프로필의 가입기간 ${months}개월로 계산한 날짜 (정확한 가입일로 고쳐 주세요)` };
}

/** 프로필에서 가져온 기본값을 답변에 채운다. 사용자가 이미 답한 값은 건드리지 않는다. */
export function applyPrefill(questions: Question[], answers: Answers): Answers {
  const next = { ...answers };
  for (const question of questions) {
    if (question.prefill && next[question.id] === undefined) next[question.id] = question.prefill.value;
  }
  return next;
}

/** 진행률은 질문 수가 아니라 "필요한 정보 중 확보된 정보" 비율로 센다. */
export function questionnaireProgress(questions: Question[], answers: Answers): { answered: number; total: number; ratio: number } {
  const total = questions.length;
  const done = questions.filter(question => answered(answers, question.id)).length;
  return { answered: done, total, ratio: total === 0 ? 1 : done / total };
}
