import type { KioskChat } from '../consult.ts';
import type { EvaluationResult } from '../frozen/domain/evaluation.ts';
import type { KioskOutcome } from '../evaluate.ts';
import { explainResult, type ListingExplanation } from './explain.ts';
import { humanize, humanizeAll } from './labels.ts';

/**
 * 상담에서 자주 나오는 질문을 지금 방문자의 판정 결과로 답한다.
 *
 * 일반론 대신 '당신의 결과'를 먼저 말한다. 판정은 다시 하지 않고, 상담 세션이 들고 있는
 * EvaluationResult·AssessmentContext·근거만 쓴다. 해당하지 않는 질문은 null 을 돌려
 * 기존 상담 엔진이 답하게 둔다.
 */
export type ChatReply = { text: string; detail?: string[] };

export const CHAT_INTENTS = {
  WHY_ELIGIBLE: /왜.*(신청할\s*수|가능|되나요|돼요|결과|어려)|신청.*이유|어떻게.*가능/,
  KEY_CONDITION: /가장\s*중요|핵심\s*조건|중요한\s*조건|제일\s*중요/,
  DOCUMENTS: /서류|증빙|준비물|제출/,
  COMPARE: /비교|다른\s*(공급|공고|유형)|어떤\s*게\s*나아|어디가\s*나아/,
} as const;

const ELIGIBILITY_TEXT: Record<EvaluationResult['eligibility'], string> = {
  ELIGIBLE: '신청 가능',
  INELIGIBLE: '신청 어려움',
  NEEDS_MORE_INFORMATION: '추가 확인 필요',
  REVIEW_REQUIRED: '서류 확인 필요',
};

/** 현재 공고 기준 추천 질문. 결과에 맞는 질문을 앞에 둔다. */
export function experienceSuggestedQuestions(outcome: KioskOutcome | null): string[] {
  if (!outcome?.result) return ['어떤 공고를 먼저 보면 좋을까요?', '왜 이 공고는 판정할 수 없나요?'];
  const eligible = outcome.result.eligibility === 'ELIGIBLE';
  return [
    eligible ? '왜 이 공고에 신청할 수 있나요?' : '왜 이런 결과가 나왔나요?',
    '가장 중요한 조건은 무엇인가요?',
    '제가 확인해야 할 서류는 무엇인가요?',
    '다른 공급유형과 비교하면 어떤가요?',
    '근거가 된 공고문 항목은 무엇인가요?',
  ];
}

function bullet(items: string[], limit = 5): string[] {
  return items.slice(0, limit);
}

function whyEligible(result: EvaluationResult, x: ListingExplanation): ChatReply {
  if (result.eligibility === 'ELIGIBLE') {
    return {
      text: `입력하신 정보로 ${result.supplyLabel}의 신청 자격을 모두 확인했어요.${x.priority.label ? ` ${x.priority.body}` : ''}`,
      detail: bullet(x.satisfied.map(item => `충족 · ${item}`)),
    };
  }
  if (result.eligibility === 'INELIGIBLE') {
    return {
      text: `지금 입력으로는 ${result.supplyLabel}에 신청하기 어려워요. 아래 조건을 충족하지 못했어요.`,
      detail: bullet([...x.unmet.map(item => `부족 · ${item}`), '다른 공급유형 비교는 “다른 공급유형과 비교하면 어떤가요?”로 물어보세요.']),
    };
  }
  return {
    text: `아직 ${result.supplyLabel} 결과를 확정하지 않았어요. 아래 항목을 확인하면 판정할 수 있어요.`,
    detail: bullet([...x.toConfirm.map(item => `확인 필요 · ${item}`), ...x.documents.map(item => `서류 확인 · ${item}`)]),
  };
}

function keyCondition(result: EvaluationResult, x: ListingExplanation): ChatReply {
  if (x.unmet.length) {
    return { text: `지금 결과를 가장 크게 좌우하는 조건은 “${x.unmet[0]}”이에요. 이 조건을 충족하지 못해 신청이 어려워요.`, detail: bullet(x.unmet.slice(1).map(item => `함께 부족 · ${item}`), 3) };
  }
  if (x.toConfirm.length || x.documents.length) {
    const first = x.toConfirm[0] ?? x.documents[0];
    return {
      text: `가장 먼저 확인할 것은 “${first}”이에요. 이 값에 따라 ${result.supplyLabel} 결과가 정해져요.`,
      detail: bullet([...x.toConfirm.slice(x.toConfirm[0] === first ? 1 : 0).map(item => `확인 필요 · ${item}`), ...x.documents.filter(item => item !== first).map(item => `서류 확인 · ${item}`)], 4),
    };
  }
  return {
    text: x.priority.label
      ? `자격은 모두 충족했어요. 이제 중요한 건 순위예요. ${x.priority.body}`
      : '자격 조건은 모두 충족했어요. 접수 일정과 제출 서류를 놓치지 않는 것이 가장 중요해요.',
    detail: bullet(x.satisfied.map(item => `충족 · ${item}`), 3),
  };
}

function documents(result: EvaluationResult, x: ListingExplanation): ChatReply {
  const docs = x.documents;
  const scoreNeeds = x.score.status === 'PENDING' ? x.score.needs.filter(item => !docs.includes(item)) : [];
  if (!docs.length && !scoreNeeds.length) {
    return {
      text: `${result.supplyLabel} 판정에서 따로 서류로 확인할 항목은 남아 있지 않아요.`,
      detail: ['실제 접수 때는 모집공고가 정한 기본 서류(주민등록등본, 가족관계증명서 등)를 함께 준비해 주세요.'],
    };
  }
  return {
    text: '말로 답할 수 없어서 서류로 확인해야 하는 항목이에요.',
    detail: bullet([...docs.map(item => `서류 확인 · ${item}`), ...scoreNeeds.map(item => `공식 배점 계산용 · ${item}`)], 6),
  };
}

function compare(chat: KioskChat, result: EvaluationResult): ChatReply {
  const assessments = chat.assessmentContext?.assessments ?? [];
  if (assessments.length <= 1) return { text: '비교할 다른 공급 결과가 없어요.' };
  const order: Record<string, number> = { ELIGIBLE: 0, REVIEW_REQUIRED: 1, NEEDS_MORE_INFORMATION: 1, INELIGIBLE: 2 };
  const lines = [...assessments]
    .sort((a, b) => (order[a.eligibility] - order[b.eligibility]) || (a.listingId === result.listingId ? -1 : 0))
    .map(item => {
      const current = item.listingId === result.listingId && item.supplyType === result.supplyType;
      const priority = item.priority.status === 'DETERMINED' ? ` · ${humanize(item.priority.label)}` : '';
      return `${current ? '지금 보는 공급 → ' : ''}${item.listingTitle} ${item.supplyLabel}: ${ELIGIBILITY_TEXT[item.eligibility]}${priority}`;
    });
  const eligibleCount = assessments.filter(item => item.eligibility === 'ELIGIBLE').length;
  return {
    text: `전체 ${assessments.length}개 공급 중 ${eligibleCount}개가 신청 가능으로 나왔어요. 지금 보는 ${result.supplyLabel}은 “${ELIGIBILITY_TEXT[result.eligibility]}”이에요.`,
    detail: bullet(lines, 6),
  };
}

export function experienceAnswer(chat: KioskChat, message: string, evidenceOnly: Set<string>): ChatReply | null {
  const result = chat.result;
  if (!result) return null;
  const x = explainResult(result, evidenceOnly);
  if (CHAT_INTENTS.COMPARE.test(message)) return compare(chat, result);
  if (CHAT_INTENTS.KEY_CONDITION.test(message)) return keyCondition(result, x);
  if (CHAT_INTENTS.DOCUMENTS.test(message)) return documents(result, x);
  if (CHAT_INTENTS.WHY_ELIGIBLE.test(message)) return whyEligible(result, x);
  return null;
}

/** 어떤 경로로 만든 답이든 화면에 나가기 전에 기계용 키를 지운다. */
export function sanitizeReply(reply: ChatReply): ChatReply {
  return { text: humanize(reply.text), ...(reply.detail ? { detail: humanizeAll(reply.detail) } : {}) };
}
