/**
 * Preview-only consultation script.
 *
 * The real engine is being built on another branch. This mock exists so the
 * presentation layer can be designed and browser-tested against the contract before
 * that lands. It is deterministic, contains no model call, and is only reachable
 * behind the preview flag — production never renders a mocked consultation answer.
 */
import type {
  ConsultationAssessment, ConsultationEngine, ConsultationQuestion, ConsultationSession, ConsultationTurn,
} from './contract.ts';
import type { Evidence } from '../applicationAssessment/types.ts';

export const MOCK_LISTING_ID = 'announcement:bade0617-63c6-4f61-86bf-6cd5ae17b101';
const TITLE = '삼도이동 1지구 토지임대부 공공분양주택';

const evidence = (id: string, label: string, section: string, excerpt: string, tableLabel?: string): Evidence => ({
  id, label, section, tableLabel, source: '삼도이동 토지임대부 모집공고 VER1.7 검토본', textExcerpt: excerpt,
});

const AGE_EVIDENCE = evidence('samdo.v17.youth.age', '만 19~39세', 'Ⅴ. 신청자격 및 당첨자 선정방법',
  '청년 특별공급은 입주자모집공고일 현재 만 19세 이상 만 39세 이하인 분으로서 혼인 중이 아닌 무주택자여야 합니다.');
const INCOME_EVIDENCE = evidence('samdo.v17.youth.income', '본인 소득 140% 이하', 'Ⅴ. 신청자격 및 당첨자 선정방법',
  '본인의 월평균소득이 전년도 도시근로자 가구원수별 가구당 월평균소득의 140% 이하여야 합니다. (1인 가구 기준 5,338,708원)', '<표3> 소득기준');
const SCORE_EVIDENCE = evidence('samdo.v17.youth.GENERAL.paymentScore', '청약 납입인정횟수 배점', 'Ⅴ. 신청자격 및 당첨자 선정방법',
  '납입인정횟수 24회 이상 3점, 12회 이상 24회 미만 2점, 6회 이상 12회 미만 1점', '<표8> 청년 가점기준');

const QUESTIONS: Record<string, ConsultationQuestion> = {
  age: {
    key: 'age', prompt: '공고일 기준 나이가 어떻게 되세요?', source: 'ANSWER',
    options: [{ label: '만 19~39세', value: '19-39' }, { label: '만 40세 이상', value: '40+' }, { label: '만 19세 미만', value: 'under19' }],
  },
  income: {
    key: 'income', prompt: '본인 월평균소득이 약 534만원(140%) 이하인가요?', source: 'ANSWER',
    options: [{ label: '이하예요', value: 'under' }, { label: '넘어요', value: 'over' }, { label: '잘 모르겠어요', value: 'unknown' }],
  },
  payments: {
    key: 'payments', prompt: '청약통장 납입인정횟수는 몇 회인가요?', source: 'ANSWER',
    options: [{ label: '24회 이상', value: '24+' }, { label: '12~23회', value: '12-23' }, { label: '6~11회', value: '6-11' }],
  },
};

const ELIGIBLE_YOUTH: ConsultationAssessment = {
  status: 'ELIGIBLE', supplyType: 'youth', stage: 'PRIORITY', scoring: 'AVAILABLE',
  score: { total: 9, max: 9 }, blocking: [], pending: [],
};
const INELIGIBLE_YOUTH: ConsultationAssessment = {
  status: 'INELIGIBLE', supplyType: 'youth', stage: null, scoring: 'PENDING', score: null,
  blocking: ['만 19~39세'], pending: [],
};
const PENDING_YOUTH: ConsultationAssessment = {
  status: 'NEEDS_MORE_INFORMATION', supplyType: 'youth', stage: null, scoring: 'PENDING', score: null,
  blocking: [], pending: ['생년월일', '본인 월평균소득', '청약 납입인정횟수'],
};
const FIRST_HOME: ConsultationAssessment = {
  status: 'ELIGIBLE', supplyType: 'firstHome', stage: 'PRIORITY', scoring: 'NOT_APPLICABLE',
  score: null, blocking: [], pending: [],
};

let counter = 0;
const turn = (t: Omit<ConsultationTurn, 'id' | 'role'> & { role?: ConsultationTurn['role'] }): ConsultationTurn =>
  ({ id: `mock-${++counter}`, role: t.role ?? 'assistant', ...t });

export const resetMockIds = () => { counter = 0; };

const has = (text: string, ...needles: string[]) => needles.some(n => text.includes(n));

/** One scripted reply per recognisable intent. Unknown input falls through to the unresolved shape. */
function reply(message: string, answering?: { questionKey: string; value: string }): ConsultationTurn {
  if (answering?.questionKey === 'age' && answering.value === '40+') {
    return turn({
      message: '만 40세 이상이면 청년 특별공급의 나이 요건에 해당하지 않아요. 다만 신혼부부·생애최초 유형은 나이 상한이 달라서 따로 확인해 볼 수 있어요.',
      assessment: INELIGIBLE_YOUTH, evidenceRefs: [AGE_EVIDENCE],
      suggestedQuestions: [{ key: 'other', prompt: '생애최초로 보면 어떤가요?', source: 'ANSWER' }],
      actions: [{ kind: 'OPEN_ASSESSMENT', label: '맞춤판정에서 다른 유형 보기' }],
    });
  }
  if (answering?.questionKey === 'income' && answering.value === 'unknown') {
    return turn({
      message: '괜찮아요. 소득은 건강보험 납부확인서나 급여명세서로 확인할 수 있어요. 지금은 이 항목을 확인 필요로 두고 나머지를 먼저 볼게요.',
      assessment: PENDING_YOUTH, unresolved: ['본인 월평균소득 확인'],
      suggestedQuestions: [QUESTIONS.payments],
    });
  }
  if (answering) {
    return turn({
      message: '답변 고마워요. 지금까지 확인된 조건으로는 청년 특별공급 1단계 우선공급 대상이고, 예상 가점은 9점 만점에 9점이에요.',
      assessment: ELIGIBLE_YOUTH, evidenceRefs: [AGE_EVIDENCE, INCOME_EVIDENCE],
      actions: [{ kind: 'OPEN_ASSESSMENT', label: '맞춤판정 자세히 보기' }, { kind: 'OPEN_PREPARATION', label: '준비 단계로 이어가기' }],
      suggestedQuestions: [{ key: 'why', prompt: '왜 9점이야?', source: 'ANSWER' }, { key: 'docs', prompt: '필요한 서류는?', source: 'ANSWER' }],
    });
  }
  if (has(message, '왜', '이유')) {
    return turn({
      message: '가점 9점은 세 항목이 모두 상단 구간에 들어가서예요. 소득 구간 3점, 제주 연속거주 3점, 납입인정횟수 3점이고 각 항목의 만점이 3점이라 합계가 9점 만점에 9점이 됩니다.',
      assessment: ELIGIBLE_YOUTH, evidenceRefs: [SCORE_EVIDENCE, INCOME_EVIDENCE],
      actions: [{ kind: 'OPEN_ASSESSMENT', label: '항목별 배점 자세히 보기' }],
    });
  }
  if (has(message, '서류', '준비물')) {
    return turn({
      message: '청년 특별공급은 주민등록표등본, 가족관계증명서, 청약통장 순위확인서, 소득·자산 증빙이 기본이에요. 해외 체류 이력이 있으면 출입국사실증명서가 추가로 필요해요.',
      actions: [{ kind: 'OPEN_ASSESSMENT', label: '서류 목록 전체 보기' }, { kind: 'OPEN_PREPARATION', label: '준비 단계로 이어가기' }],
    });
  }
  if (has(message, '예외', '특례', '해외')) {
    return turn({
      message: '이 부분은 제가 단정해서 답하기 어려워요. 공고 검토본에 예외 문구가 있지만 적용 범위가 확정되지 않아 관리자 확인이 필요한 항목으로 남겨 뒀어요.',
      unresolved: ['배우자 혼인 전 주택소유 예외의 적용 범위', '해외체류 90일·183일 기준과 생업 목적 예외'],
      suggestedQuestions: [{ key: 'docs', prompt: '필요한 서류는?', source: 'ANSWER' }],
    });
  }
  if (has(message, '생애최초')) {
    return turn({
      message: '생애최초 특별공급 기준으로는 1단계 우선공급 대상이에요. 이 유형은 가점을 매기지 않고 공급단계와 추첨으로 선정해서 점수가 나오지 않는 것이 정상이에요.',
      assessment: FIRST_HOME, actions: [{ kind: 'OPEN_ASSESSMENT', label: '생애최초 판정 자세히 보기' }],
    });
  }
  if (has(message, '길게', '자세히 설명')) {
    return turn({
      message: '청년 특별공급은 입주자모집공고일 현재 제주특별자치도에 거주하면서 만 19세 이상 만 39세 이하이고 혼인 중이 아닌 무주택자를 대상으로 합니다. '
        + '여기에 청약통장 가입 6개월 경과와 납입인정 6회 이상이라는 통장 요건이 더해지고, 본인 월평균소득이 도시근로자 가구원수별 월평균소득의 140% 이하여야 하며, '
        + '본인 자산 276백만원 이하와 부모 자산 1,034백만원 이하라는 자산 요건도 함께 봅니다. 1단계 우선공급은 근로·자영업 경력과 소득세 납부기간 5년 이상을 추가로 보고, '
        + '여기에 해당하지 않으면 2단계 일반공급으로 넘어가며 두 단계 모두 가점으로 순위를 정합니다.',
      assessment: ELIGIBLE_YOUTH, evidenceRefs: [AGE_EVIDENCE, INCOME_EVIDENCE, SCORE_EVIDENCE],
    });
  }
  if (has(message, '신청 가능', '가능해', '될까', '되나')) {
    return turn({
      message: '확인해 볼게요. 프로필에서 거주지와 무주택 여부는 이미 확인했어요. 세 가지만 더 알려주시면 청년 특별공급 기준으로 판정할 수 있어요.',
      assessment: PENDING_YOUTH,
      reusedProfileFacts: ['공고 기준일 거주지(제주특별자치도)', '현재 주택소유 여부(무주택)'],
      suggestedQuestions: [QUESTIONS.age, QUESTIONS.income, QUESTIONS.payments],
      actions: [{ kind: 'OPEN_PROFILE', label: '프로필 정보 수정' }],
    });
  }
  return turn({
    message: '이 질문은 공고 기준만으로 답하기 어려워요. 아래 질문부터 시작하면 신청 가능 여부를 함께 확인할 수 있어요.',
    unresolved: ['질문에 해당하는 공고 조항 확인'],
    suggestedQuestions: [{ key: 'can', prompt: '내가 신청 가능해?', source: 'ANSWER' }, { key: 'docs', prompt: '필요한 서류는?', source: 'ANSWER' }],
  });
}

export const mockConsultationEngine: ConsultationEngine = {
  async start({ seededFrom }) {
    resetMockIds();
    return {
      announcementTitle: TITLE, listingId: MOCK_LISTING_ID, sourceStatus: 'DRAFT_SOURCE_VERIFIED',
      turns: [turn({
        message: seededFrom === 'ASSESSMENT_RESULT'
          ? '방금 본 판정 결과를 기준으로 이어서 설명해 드릴게요. 궁금한 부분을 물어보세요.'
          : '이 공고에 대해 물어보세요. 신청 가능 여부, 공급단계, 가점, 필요한 서류까지 함께 확인할 수 있어요.',
        assessment: seededFrom === 'ASSESSMENT_RESULT' ? ELIGIBLE_YOUTH : undefined,
        suggestedQuestions: seededFrom === 'ASSESSMENT_RESULT'
          ? [{ key: 'why', prompt: '왜 9점이야?', source: 'ANSWER' }, { key: 'docs', prompt: '필요한 서류는?', source: 'ANSWER' }, { key: 'exception', prompt: '예외조건 알려줘', source: 'ANSWER' }]
          : [{ key: 'can', prompt: '내가 신청 가능해?', source: 'ANSWER' }, { key: 'docs', prompt: '필요한 서류는?', source: 'ANSWER' }, { key: 'exception', prompt: '예외조건 알려줘', source: 'ANSWER' }],
      })],
    };
  },
  async ask({ message, answering }) { return reply(message, answering); },
};
