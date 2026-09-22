import type { ConsultationFieldUpdate } from './types.ts';
import type { ConsultationUtteranceKind } from './interpreter.ts';

export type UtteranceCategory =
  | 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'QUESTION' | 'CONDITIONAL'
  | 'AMBIGUOUS' | 'DOUBLE_NEGATIVE' | 'NUMERIC' | 'UNIT' | 'COLLOQUIAL';

type Field = ConsultationFieldUpdate['field'];

export type UtteranceCase = {
  text: string;
  category: UtteranceCategory;
  /** classifyConsultationUtterance() of the whole utterance. */
  kind: ConsultationUtteranceKind;
  /** Facts that must be extracted with exactly this value. */
  extract: Partial<Record<Field, unknown>>;
  /** Fields that must not appear at all. */
  forbid: Field[];
};

const c = (text: string, category: UtteranceCategory, kind: ConsultationUtteranceKind, extract: UtteranceCase['extract'] = {}, forbid: Field[] = []): UtteranceCase =>
  ({ text, category, kind, extract, forbid });

/**
 * 한국어 상담 발화 회귀 데이터셋. 판정 결과가 아니라 "무엇을 사실로 읽고, 무엇을
 * 읽지 않아야 하는가"만 고정한다. 모호한 문장은 비워 두어 질문이 남게 한다.
 */
export const CONSULTATION_UTTERANCES: UtteranceCase[] = [
  // ── 주택 소유 이력 ──
  c('주택 소유한 적 없습니다', 'NEGATIVE', 'ASSERTION', { previousHousingOwnership: false, currentHousingOwnership: 'no-home' }),
  c('집을 소유한 적이 한 번도 없어요', 'NEGATIVE', 'ASSERTION', { previousHousingOwnership: false, currentHousingOwnership: 'no-home' }),
  c('집 가져본 적 없어', 'COLLOQUIAL', 'ASSERTION', { previousHousingOwnership: false }),
  c('집 산 적 없어요', 'COLLOQUIAL', 'ASSERTION', { previousHousingOwnership: false }),
  c('현재 무주택입니다', 'NEGATIVE', 'ASSERTION', { currentHousingOwnership: 'no-home' }, ['previousHousingOwnership']),
  c('집 없어요', 'NEGATIVE', 'ASSERTION', { currentHousingOwnership: 'no-home' }, ['previousHousingOwnership']),
  c('주택 소유하고 있지 않아요', 'NEGATIVE', 'ASSERTION', { currentHousingOwnership: 'no-home' }),
  c('지금 아파트 한 채 보유 중이에요', 'POSITIVE', 'ASSERTION', { currentHousingOwnership: 'owns-home' }, ['previousHousingOwnership']),
  c('예전에 집이 있었습니다', 'POSITIVE', 'ASSERTION', { previousHousingOwnership: true }, ['currentHousingOwnership']),
  c('세대 전원 무주택이에요', 'NEGATIVE', 'ASSERTION', { householdHasHome: false, currentHousingOwnership: 'no-home' }),
  c('주택 소유한 적 없지 않습니다', 'DOUBLE_NEGATIVE', 'UNKNOWN', {}, ['previousHousingOwnership', 'currentHousingOwnership']),
  c('주택 소유한 적 없는데 지금은 집을 보유 중입니다', 'MIXED', 'ASSERTION', {}, ['previousHousingOwnership', 'currentHousingOwnership']),
  c('부모님 집에 살아요', 'AMBIGUOUS', 'UNKNOWN', {}, ['currentHousingOwnership', 'previousHousingOwnership', 'householdHasHome']),
  c('친구는 집이 있어요', 'AMBIGUOUS', 'UNKNOWN', {}, ['currentHousingOwnership']),
  c('집 없으면 유리해요?', 'CONDITIONAL', 'CONDITIONAL_QUESTION', {}, ['currentHousingOwnership']),
  c('주택청약종합저축 있어요', 'POSITIVE', 'ASSERTION', { hasSubscriptionAccount: true, accountKindEligible: true }, ['currentHousingOwnership', 'previousHousingOwnership']),

  // ── 특별공급 당첨 이력 · 재당첨 ──
  c('특별공급 당첨된 적 없습니다', 'NEGATIVE', 'ASSERTION', { specialSupplyHistory: false }),
  c('특공 당첨 이력 한 번도 없어요', 'COLLOQUIAL', 'ASSERTION', { specialSupplyHistory: false }),
  c('특별공급 당첨 해당 안 됩니다', 'NEGATIVE', 'ASSERTION', { specialSupplyHistory: false }),
  c('특별공급에 당첨된 적 있었습니다', 'POSITIVE', 'ASSERTION', { specialSupplyHistory: true }),
  c('특별공급 당첨된 적 없지 않습니다', 'DOUBLE_NEGATIVE', 'UNKNOWN', {}, ['specialSupplyHistory']),
  c('특별공급 당첨 이력과 재당첨 제한 없고 특례 해당 없습니다', 'MIXED', 'ASSERTION', { specialSupplyHistory: false, reWinningRestriction: false, specialExceptionsClear: true }),
  c('재당첨 제한 없습니다', 'NEGATIVE', 'ASSERTION', { reWinningRestriction: false }, ['specialSupplyHistory']),
  c('재당첨 제한 걸려 있어요', 'POSITIVE', 'ASSERTION', { reWinningRestriction: true }, ['specialSupplyHistory']),

  // ── 혼인 · 자녀 ──
  c('미혼입니다', 'POSITIVE', 'ASSERTION', { marriageStatus: 'single' }),
  c('결혼 안 했어요', 'NEGATIVE', 'ASSERTION', { marriageStatus: 'single' }),
  c('배우자와 혼인 중입니다', 'POSITIVE', 'ASSERTION', { marriageStatus: 'married' }),
  c('배우자 없어요', 'NEGATIVE', 'ASSERTION', { marriageStatus: 'single' }),
  c('내년에 결혼할 예정이에요', 'AMBIGUOUS', 'UNKNOWN', {}, ['marriageStatus']),
  c('결혼하면 신혼부부로 넣을 수 있나요?', 'CONDITIONAL', 'CONDITIONAL_QUESTION', {}, ['marriageStatus']),
  c('이혼했어요', 'AMBIGUOUS', 'ASSERTION', {}, ['marriageStatus']),
  c('자녀는 없습니다', 'NEGATIVE', 'ASSERTION', { childbirthClear: true }),
  c('아이 하나도 없어요', 'COLLOQUIAL', 'ASSERTION', { childbirthClear: true }, ['specialException']),
  c('아이가 한 명 있어요', 'POSITIVE', 'ASSERTION', { childCount: 1 }, ['childbirthClear', 'specialException']),
  c('자녀는 없고 태아는 있어요', 'MIXED', 'ASSERTION', { specialException: '자녀·태아·입양 자녀 상세정보 추가 확인' }, ['childbirthClear']),
  c('아이가 3살이에요', 'NUMERIC', 'ASSERTION', {}, ['declaredAgeYears', 'childbirthClear']),

  // ── 해외체류 ──
  c('해외체류 이력 없습니다', 'NEGATIVE', 'ASSERTION', { overseasClear: true }, ['specialException']),
  c('해외 나가서 산 적 없어요', 'COLLOQUIAL', 'ASSERTION', { overseasClear: true }, ['currentResidence']),
  c('해외체류 해당 안 됩니다', 'NEGATIVE', 'ASSERTION', { overseasClear: true }),
  c('해외에 6개월 있었어', 'POSITIVE', 'ASSERTION', { specialException: '해외체류 6개월 (정확한 체류일 확인 필요)' }, ['overseasClear']),
  c('유학으로 반년 외국에 있었습니다', 'UNIT', 'ASSERTION', { specialException: '해외체류 6개월 (정확한 체류일 확인 필요)' }, ['overseasClear']),
  c('해외체류 이력 없습니다. 작년에 해외에 4개월 있었어요.', 'MIXED', 'ASSERTION', {}, ['overseasClear']),
  c('해외여행은 다녀왔어요', 'AMBIGUOUS', 'ASSERTION', {}, ['overseasClear', 'specialException']),
  c('해외에 좀 있었던 것 같아요', 'AMBIGUOUS', 'UNKNOWN', {}, ['overseasClear', 'specialException']),

  // ── 거주기간 ──
  c('제주에 거주한 지 36개월입니다', 'NUMERIC', 'ASSERTION', { currentResidence: '제주특별자치도', residenceDurationMonths: 36 }),
  c('제주 산 지 3년 됐어요', 'COLLOQUIAL', 'ASSERTION', { currentResidence: '제주특별자치도', residenceDurationMonths: 36 }),
  c('제주도에서 2년 반 살았어요', 'UNIT', 'ASSERTION', { currentResidence: '제주특별자치도', residenceDurationMonths: 30 }),
  c('서울에 1년 6개월 거주했어요', 'UNIT', 'ASSERTION', { currentResidence: '서울특별시', residenceDurationMonths: 18 }),
  c('예전에 부산에 2년 살았어요', 'AMBIGUOUS', 'ASSERTION', {}, ['currentResidence', 'residenceDurationMonths']),
  c('서울에서 5년 살다가 제주 온 지 1년이에요', 'AMBIGUOUS', 'ASSERTION', {}, ['currentResidence', 'residenceDurationMonths']),
  c('제주 3년쯤 살았어요', 'AMBIGUOUS', 'UNKNOWN', {}, ['residenceDurationMonths']),
  c('제주에 3년 살면 되나요?', 'CONDITIONAL', 'CONDITIONAL_QUESTION', {}, ['residenceDurationMonths', 'currentResidence']),
  c('제주특별자치도', 'COLLOQUIAL', 'ASSERTION', { currentResidence: '제주특별자치도' }, ['residenceDurationMonths']),

  // ── 청약통장 · 납입횟수 ──
  c('통장 가입 30개월입니다', 'NUMERIC', 'ASSERTION', { hasSubscriptionAccount: true, subscriptionDurationMonths: 30 }),
  c('청약통장 만든 지 반년 됐어요', 'UNIT', 'ASSERTION', { subscriptionDurationMonths: 6 }),
  c('통장 6 개월 됐어요', 'UNIT', 'ASSERTION', { subscriptionDurationMonths: 6 }),
  c('청약통장 없어요', 'NEGATIVE', 'ASSERTION', { hasSubscriptionAccount: false }, ['subscriptionDurationMonths']),
  c('36회 납입했습니다', 'NUMERIC', 'ASSERTION', { recognizedPaymentCount: 36 }),
  c('열두 번 넣었어요', 'UNIT', 'ASSERTION', { recognizedPaymentCount: 12 }),
  c('스물네 번 납입했어요', 'UNIT', 'ASSERTION', { recognizedPaymentCount: 24 }),
  c('삼십육 회 납입했습니다', 'UNIT', 'ASSERTION', { recognizedPaymentCount: 36 }),
  c('24회 이상이면 몇 점이야?', 'CONDITIONAL', 'CONDITIONAL_QUESTION', {}, ['recognizedPaymentCount']),
  c('통장 6개월 넘으면 되나요?', 'CONDITIONAL', 'CONDITIONAL_QUESTION', {}, ['subscriptionDurationMonths']),
  c('납입 횟수가 몇 회 필요해요?', 'QUESTION', 'QUESTION', {}, ['recognizedPaymentCount']),
  c('대충 20번 넣었어요', 'AMBIGUOUS', 'UNKNOWN', {}, ['recognizedPaymentCount']),
  c('당첨 1번 됐어요', 'AMBIGUOUS', 'ASSERTION', {}, ['recognizedPaymentCount']),

  // ── 소득 · 자산 ──
  c('본인 월평균소득은 2500000원입니다', 'NUMERIC', 'ASSERTION', { monthlyIncome: 2500000 }),
  c('월급 250만원 받아요', 'UNIT', 'ASSERTION', { monthlyIncome: 2500000 }),
  c('월소득 2,669,354원이에요', 'NUMERIC', 'ASSERTION', { monthlyIncome: 2669354 }),
  c('세대 월평균소득 300만 원이에요', 'UNIT', 'ASSERTION', { householdIncome: 3000000 }, ['monthlyIncome']),
  c('총자산은 2억 5천만원입니다', 'UNIT', 'ASSERTION', { totalAssets: 250000000 }),
  c('부모님 자산은 5억이에요', 'UNIT', 'ASSERTION', { parentAssets: 500000000 }, ['totalAssets']),
  c('자산은 5천만원 정도예요', 'AMBIGUOUS', 'UNKNOWN', {}, ['totalAssets']),
  c('연봉 3천만원이에요', 'AMBIGUOUS', 'ASSERTION', {}, ['monthlyIncome', 'householdIncome']),
  c('친구보다 소득이 250만원 많아요', 'AMBIGUOUS', 'UNKNOWN', {}, ['monthlyIncome']),

  // ── 근로 · 소득세 기간 ──
  c('소득세 7년 납부했습니다', 'NUMERIC', 'ASSERTION', { incomeTaxPaymentYears: 7 }),
  c('5년 동안 소득세 냈어요', 'NUMERIC', 'ASSERTION', { incomeTaxPaymentYears: 5 }),
  c('소득세 3년 반 냈어요', 'AMBIGUOUS', 'ASSERTION', {}, ['incomeTaxPaymentYears']),
  c('근로소득이 있어요', 'POSITIVE', 'ASSERTION', { workOrBusinessIncomeEligible: true }),
  c('직장 다녀요', 'COLLOQUIAL', 'ASSERTION', { workOrBusinessIncomeEligible: true }),
  c('근로소득 없어요', 'NEGATIVE', 'ASSERTION', { workOrBusinessIncomeEligible: false }),
  c('알바만 해요', 'AMBIGUOUS', 'ASSERTION', {}, ['workOrBusinessIncomeEligible']),

  // ── 나이 · 생년월일 ──
  c('저 35살이에요', 'NUMERIC', 'ASSERTION', { declaredAgeYears: 35 }),
  c('만 30세입니다', 'NUMERIC', 'ASSERTION', { declaredAgeYears: 30 }),
  c('스물아홉 살이에요', 'UNIT', 'ASSERTION', { declaredAgeYears: 29 }),
  c('1996-03-01생입니다', 'NUMERIC', 'ASSERTION', { birthDate: '1996-03-01' }),
  c('35살 이하여야 하나요?', 'CONDITIONAL', 'CONDITIONAL_QUESTION', {}, ['declaredAgeYears']),
  c('아마 31살일 거예요', 'AMBIGUOUS', 'UNKNOWN', {}, ['declaredAgeYears']),
  c('30대 초반이에요', 'AMBIGUOUS', 'ASSERTION', {}, ['declaredAgeYears']),

  // ── 여러 사실이 섞인 문장 ──
  c('31살이고 제주에 4년 살았고 집은 가져본 적 없어', 'MIXED', 'ASSERTION',
    { declaredAgeYears: 31, currentResidence: '제주특별자치도', residenceDurationMonths: 48, previousHousingOwnership: false, currentHousingOwnership: 'no-home' }),
  c('나는 31살인데 39살까지 가능한가요?', 'MIXED', 'QUESTION', { declaredAgeYears: 31 }),
  c('미혼이고 통장 반년, 열두 번 넣었고 해외체류는 없어요', 'MIXED', 'ASSERTION',
    { marriageStatus: 'single', subscriptionDurationMonths: 6, recognizedPaymentCount: 12, overseasClear: true }),
  c('집 없어요 통장 있어요', 'MIXED', 'ASSERTION', { currentHousingOwnership: 'no-home', hasSubscriptionAccount: true }),
  c('32살이고 아마 제주에 3년 살았을 거예요', 'MIXED', 'UNKNOWN', { declaredAgeYears: 32 }, ['residenceDurationMonths', 'currentResidence']),
  c('월급 250만원이고 결혼하면 신혼부부 가능해요?', 'MIXED', 'CONDITIONAL_QUESTION', { monthlyIncome: 2500000 }, ['marriageStatus']),
  c('근로소득이 있고 소득세 7년 납부했습니다', 'MIXED', 'ASSERTION', { workOrBusinessIncomeEligible: true, incomeTaxPaymentYears: 7 }),

  // ── 질문 · 모름 ──
  c('내가 지금 저장한 정보 보여줘', 'QUESTION', 'QUESTION', {}, ['marriageStatus', 'currentHousingOwnership']),
  c('청년 특공 소득 기준이 뭐예요?', 'QUESTION', 'QUESTION', {}, ['monthlyIncome']),
  c('잘 모르겠어요', 'AMBIGUOUS', 'UNKNOWN', {}, []),
  c('그런 것 같아요', 'AMBIGUOUS', 'UNKNOWN', {}, []),
];
