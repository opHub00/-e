import type { ConsultationFieldUpdate } from './types.ts';
import type { ConsultationUtteranceKind } from './interpreter.ts';

export type NewlywedCategory =
  | 'MARRIAGE_DATE' | 'MARRIAGE_DURATION' | 'CHILD_COUNT' | 'CHILD_BIRTH' | 'HOUSEHOLD_SIZE'
  | 'ENGAGED' | 'SINGLE_PARENT' | 'DUAL_INCOME' | 'MARITAL' | 'AMBIGUOUS' | 'CONFLICT' | 'FUTURE' | 'QUESTION' | 'MIXED';

type Field = ConsultationFieldUpdate['field'];
export type NewlywedCase = {
  text: string;
  category: NewlywedCategory;
  /** classifyConsultationUtterance() of the whole utterance. */
  kind: ConsultationUtteranceKind;
  extract: Partial<Record<Field, unknown>>;
  forbid: Field[];
};
const c = (text: string, category: NewlywedCategory, kind: ConsultationUtteranceKind, extract: NewlywedCase['extract'] = {}, forbid: Field[] = []): NewlywedCase =>
  ({ text, category, kind, extract, forbid });

/**
 * 신혼부부 상담 발화. 날짜는 말한 정밀도 그대로 구간으로 남는다("2023년 5월" → 그 달 전체).
 * 공고일 기준 기간 계산은 세션이 공고일로 한다.
 */
export const NEWLYWED_UTTERANCES: NewlywedCase[] = [
  // ── 혼인일
  c('2023년 5월에 혼인신고했어요', 'MARRIAGE_DATE', 'ASSERTION', { marriageDate: '2023-05-01~2023-05-31', familyCategory: 'married', marriageStatus: 'married' }),
  c('2023년 5월 20일에 혼인신고했어요', 'MARRIAGE_DATE', 'ASSERTION', { marriageDate: '2023-05-20' }, ['birthDate']),
  c('혼인신고일은 2024.3.2이에요', 'MARRIAGE_DATE', 'ASSERTION', { marriageDate: '2024-03-02' }),
  c('2022년에 결혼했어요', 'MARRIAGE_DATE', 'ASSERTION', { marriageDate: '2022-01-01~2022-12-31', marriageStatus: 'married' }),
  c('결혼 전에 집을 샀어요', 'AMBIGUOUS', 'ASSERTION', {}, ['marriageDate', 'familyCategory', 'marriageDurationMonths']),
  c('혼인신고 날짜가 기억이 안 나요', 'AMBIGUOUS', 'UNKNOWN', {}, ['marriageDate', 'familyCategory']),
  c('2023년 5월에 혼인신고했고 2024년 1월에 아이를 낳았어요', 'MIXED', 'ASSERTION',
    { marriageDate: '2023-05-01~2023-05-31', childBirthDates: '2024-01-01~2024-01-31' }, ['birthDate']),

  // ── 혼인기간 (공고일 기준 개월수 구간)
  c('결혼한 지 3년 됐어요', 'MARRIAGE_DURATION', 'ASSERTION', { marriageDurationMonths: '36~47', familyCategory: 'married' }),
  c('결혼한 지 1년 6개월 됐어요', 'MARRIAGE_DURATION', 'ASSERTION', { marriageDurationMonths: '18~18' }),
  c('결혼한 지 3년 반 됐어요', 'MARRIAGE_DURATION', 'ASSERTION', { marriageDurationMonths: '42~42' }),
  c('혼인신고한 지 2년 됐어요', 'MARRIAGE_DURATION', 'ASSERTION', { marriageDurationMonths: '24~35' }),
  c('결혼 5년차예요', 'MARRIAGE_DURATION', 'ASSERTION', { marriageDurationMonths: '48~59' }),
  c('결혼한 지 한 3년쯤 됐어요', 'AMBIGUOUS', 'UNKNOWN', {}, ['marriageDurationMonths', 'marriageDate']),
  c('결혼한 지 3년 넘었어요', 'AMBIGUOUS', 'ASSERTION', {}, ['marriageDurationMonths', 'marriageDate']),
  c('결혼한 지 3년 됐나?', 'QUESTION', 'QUESTION', {}, ['marriageDurationMonths']),
  c('결혼한 지 3년 됐어요. 결혼한 지 5년 됐어요.', 'CONFLICT', 'ASSERTION', {}, ['marriageDurationMonths']),
  c('결혼한 지 3년 됐고 2024년 3월에 혼인신고했어요', 'CONFLICT', 'ASSERTION',
    // 두 말은 각각 추출된다. 공고일 기준으로 겹치지 않으면 세션이 둘 다 버린다(newlywedChat.test).
    { marriageDurationMonths: '36~47', marriageDate: '2024-03-01~2024-03-31' }),

  // ── 자녀 수
  c('아이가 한 명 있어요', 'CHILD_COUNT', 'ASSERTION', { childCount: 1 }, ['specialException', 'childbirthClear']),
  c('자녀는 2명이에요', 'CHILD_COUNT', 'ASSERTION', { childCount: 2 }, ['childBirthDates']),
  c('아이가 셋이에요', 'CHILD_COUNT', 'ASSERTION', { childCount: 3 }),
  c('아이는 없어요', 'CHILD_COUNT', 'ASSERTION', { childbirthClear: true, childCount: 0 }),
  c('아이가 둘인 것 같아요', 'AMBIGUOUS', 'UNKNOWN', {}, ['childCount', 'childBirthDates']),
  c('아이 어릴 때 이사했어요', 'AMBIGUOUS', 'ASSERTION', {}, ['childCount', 'childBirthDates', 'childbirthClear']),
  c('임신 중이에요', 'CHILD_COUNT', 'ASSERTION', { specialException: '자녀·태아·입양 자녀 상세정보 추가 확인' }, ['childCount', 'childbirthClear']),
  c('아이는 한 명인데 곧 둘째가 태어나요', 'FUTURE', 'UNKNOWN', { childCount: 1 }, ['childBirthDates']),

  // ── 자녀 생년월일
  c('아이가 한 명 있고 2024년 8월생이에요', 'CHILD_BIRTH', 'ASSERTION', { childCount: 1, childBirthDates: '2024-08-01~2024-08-31' }, ['birthDate']),
  c('아이 둘이고 각각 2021년, 2024년생이에요', 'CHILD_BIRTH', 'ASSERTION', { childCount: 2, childBirthDates: '2021-01-01~2021-12-31,2024-01-01~2024-12-31' }),
  c('첫째는 2020년 3월생, 둘째는 2023년 5월생이에요', 'CHILD_BIRTH', 'ASSERTION', { childBirthDates: '2020-03-01~2020-03-31,2023-05-01~2023-05-31' }),
  c('딸이 2022년 7월 7일에 태어났어요', 'CHILD_BIRTH', 'ASSERTION', { childBirthDates: '2022-07-07' }, ['birthDate']),
  c('2021년과 2024년에 아이를 낳았어요', 'CHILD_BIRTH', 'ASSERTION', { childBirthDates: '2021-01-01~2021-12-31,2024-01-01~2024-12-31' }),
  c('저는 1994년 3월 1일생이고 아이는 2022년 5월 1일생이에요', 'MIXED', 'ASSERTION', { birthDate: '1994-03-01', childBirthDates: '2022-05-01' }),
  c('2024년 8월 3일생이에요', 'AMBIGUOUS', 'ASSERTION', { birthDate: '2024-08-03' }, ['childBirthDates']),

  // ── 가구원수
  c('세 식구예요', 'HOUSEHOLD_SIZE', 'ASSERTION', { incomeHouseholdSize: 3 }),
  c('네 식구예요', 'HOUSEHOLD_SIZE', 'ASSERTION', { incomeHouseholdSize: 4 }),
  c('4인 가구예요', 'HOUSEHOLD_SIZE', 'ASSERTION', { incomeHouseholdSize: 4 }),
  c('가족은 모두 5명이에요', 'HOUSEHOLD_SIZE', 'ASSERTION', { incomeHouseholdSize: 5 }),
  c('저랑 배우자 둘만 살아요', 'HOUSEHOLD_SIZE', 'ASSERTION', { incomeHouseholdSize: 2, marriageStatus: 'married', familyCategory: 'married' }),
  c('저랑 남편이랑 아이 하나 세 식구예요', 'MIXED', 'ASSERTION', { incomeHouseholdSize: 3, childCount: 1, marriageStatus: 'married' }),
  c('가족은 대충 3명', 'AMBIGUOUS', 'UNKNOWN', {}, ['incomeHouseholdSize']),
  c('가족은 3~4명이에요', 'AMBIGUOUS', 'ASSERTION', {}, ['incomeHouseholdSize']),

  // ── 예비신혼부부
  c('아직 결혼 전이고 예비신혼부부예요', 'ENGAGED', 'ASSERTION', { familyCategory: 'engaged', marriageStatus: 'single' }, ['marriageDate']),
  c('예비신혼부부예요', 'ENGAGED', 'ASSERTION', { familyCategory: 'engaged' }),
  c('입주 전까지 혼인 사실을 증명할 수 있어요', 'ENGAGED', 'ASSERTION', { plannedMarriageWithinDeadline: true }),
  c('입주 전까지 혼인 증명은 어려워요', 'ENGAGED', 'ASSERTION', { plannedMarriageWithinDeadline: false }),
  c('곧 결혼해요', 'FUTURE', 'UNKNOWN', {}, ['familyCategory', 'marriageStatus', 'marriageDate']),
  c('내년에 혼인신고할 예정이에요', 'FUTURE', 'UNKNOWN', {}, ['marriageDate', 'familyCategory', 'plannedMarriageWithinDeadline']),
  c('예비신혼부부면 신청 가능해요?', 'QUESTION', 'CONDITIONAL_QUESTION', {}, ['familyCategory']),

  // ── 한부모
  c('한부모 가정입니다', 'SINGLE_PARENT', 'ASSERTION', { familyCategory: 'singleParent', singleParentQualified: true, marriageStatus: 'single' }),
  c('한부모이고 아이는 2021년생이에요', 'SINGLE_PARENT', 'ASSERTION', { familyCategory: 'singleParent', childBirthDates: '2021-01-01~2021-12-31' }),
  c('한부모는 아니에요', 'SINGLE_PARENT', 'ASSERTION', {}, ['familyCategory', 'singleParentQualified']),
  c('한부모 가정이면 우선공급인가요?', 'QUESTION', 'CONDITIONAL_QUESTION', {}, ['familyCategory']),

  // ── 맞벌이
  c('맞벌이예요', 'DUAL_INCOME', 'ASSERTION', { dualIncome: true }),
  c('외벌이입니다', 'DUAL_INCOME', 'ASSERTION', { dualIncome: false }),
  c('맞벌이 아니에요', 'DUAL_INCOME', 'ASSERTION', { dualIncome: false }),
  c('맞벌이면 소득 기준이 달라요?', 'QUESTION', 'CONDITIONAL_QUESTION', {}, ['dualIncome']),

  // ── 혼인 상태
  c('신혼부부예요', 'MARITAL', 'ASSERTION', { familyCategory: 'married', marriageStatus: 'married' }),
  c('결혼했어요', 'MARITAL', 'ASSERTION', { familyCategory: 'married', marriageStatus: 'married' }),
  c('배우자와 혼인 중입니다', 'MARITAL', 'ASSERTION', { marriageStatus: 'married', familyCategory: 'married' }),
  c('이혼했어요', 'AMBIGUOUS', 'ASSERTION', {}, ['familyCategory', 'marriageStatus']),
  c('특별공급 제한 대상 아니에요', 'MARITAL', 'ASSERTION', { specialSupplyRestriction: false }),

  // ── 한 번에 여러 사실
  c('2024년 9월 11일에 혼인신고했고 아이가 한 명 있고 2022년 5월생이에요. 세 식구예요', 'MIXED', 'ASSERTION',
    { marriageDate: '2024-09-11', childCount: 1, childBirthDates: '2022-05-01~2022-05-31', incomeHouseholdSize: 3 }, ['birthDate']),
  c('결혼 2년차 맞벌이고 아이는 없어요', 'MIXED', 'ASSERTION', { marriageDurationMonths: '12~23', dualIncome: true, childCount: 0 }),
  // 자녀 문맥은 같은 문장이나 바로 앞 문장의 "있다"에서만 온다. "없다"는 본인 생년월일을 자녀로 바꾸지 않는다.
  c('1996-03-01생입니다. 해외 체류 없습니다. 자녀는 없습니다.', 'MIXED', 'ASSERTION', { birthDate: '1996-03-01', childCount: 0 }, ['childBirthDates']),
  c('자녀는 없어요. 1994년 3월 1일생이에요.', 'MIXED', 'ASSERTION', { birthDate: '1994-03-01', childCount: 0 }, ['childBirthDates']),
  c('아이가 한 명 있어요. 2024년 8월생이에요.', 'CHILD_BIRTH', 'ASSERTION', { childCount: 1, childBirthDates: '2024-08-01~2024-08-31' }, ['birthDate']),
  c('1994년 3월 1일생이에요. 아이가 한 명 있어요.', 'MIXED', 'ASSERTION', { birthDate: '1994-03-01', childCount: 1 }, ['childBirthDates']),
];
