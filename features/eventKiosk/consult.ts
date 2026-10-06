import {
  ApplicationAssessmentConsultationEngine,
  createConsultationSession,
  type ConsultationResponse,
  type ConsultationSession,
} from '../applicationAssessment/consultation/index.ts';
import { toAssessmentInput } from './engineInput.ts';
import type { KioskOutcome } from './evaluate.ts';
import type { LoadedEvent } from './eventConfig.ts';
import type { KioskAnswers } from './model.ts';

/**
 * 행사 화면의 AI 상담.
 *
 * 겉모습은 챗봇이지만 답은 결정론 상담 엔진이 만든다. 외부 언어 모델을 부르지 않는다.
 * 상담 엔진은 방문자가 입력한 정보, 지금 보고 있는 공고, 그 공고의 판정 결과를 그대로 이어받는다.
 * 대화 중 방문자가 말한 새 사실은 상담 세션 안에서만 쓰고, 입력 화면의 답을 고치지 않는다.
 */
export type KioskChatContext = {
  outcomeId: string | null;
  listingTitle: string | null;
  supplyLabel: string | null;
};

export type KioskChat = {
  context: KioskChatContext;
  /** 규칙이 있는 공고일 때만 있다. */
  session: ConsultationSession | null;
  messages: { role: 'user' | 'assistant'; text: string; detail?: string[] }[];
};

const engines = new WeakMap<LoadedEvent, Map<string, ApplicationAssessmentConsultationEngine>>();
function engineFor(event: LoadedEvent, listingId: string): ApplicationAssessmentConsultationEngine {
  let byListing = engines.get(event);
  if (!byListing) engines.set(event, (byListing = new Map()));
  let engine = byListing.get(listingId);
  if (!engine) {
    engine = new ApplicationAssessmentConsultationEngine({ rules: event.rulesByListing.get(listingId) ?? null });
    byListing.set(listingId, engine);
  }
  return engine;
}

/** 상담할 공고를 정하지 않았으면 가장 앞 순서의, 판정할 수 있는 공급으로 시작한다. */
export function defaultChatOutcome(outcomes: KioskOutcome[]): KioskOutcome | null {
  return outcomes.find(outcome => outcome.result && outcome.status !== 'INELIGIBLE') ?? outcomes.find(outcome => outcome.result) ?? outcomes[0] ?? null;
}

export function suggestedQuestions(outcome: KioskOutcome | null): string[] {
  if (!outcome || !outcome.result) return ['이 공고는 왜 판정이 안 되나요?', '어떤 공고를 먼저 보면 좋을까요?'];
  const questions: string[] = [];
  if (outcome.stageLabel) questions.push(`왜 저는 이 공고에서 ${outcome.stageLabel} 대상인가요?`);
  else questions.push('왜 이런 결과가 나왔나요?');
  questions.push('제가 준비해야 하는 조건이 무엇인가요?');
  if (outcome.officialScore) questions.push('공고 배점은 어떻게 계산됐나요?');
  questions.push('배우자 기준으로 신청하면 달라지나요?');
  questions.push('필요한 서류는 무엇인가요?');
  return questions.slice(0, 4);
}

export function startChat(event: LoadedEvent, answers: KioskAnswers, outcome: KioskOutcome | null, referenceDate = new Date()): KioskChat {
  const context: KioskChatContext = {
    outcomeId: outcome?.id ?? null,
    listingTitle: outcome?.listing.title ?? null,
    supplyLabel: outcome?.supplyLabel ?? null,
  };
  if (!outcome || !outcome.result) {
    return { context, session: null, messages: [{ role: 'assistant', text: greeting(outcome) }] };
  }
  const input = toAssessmentInput(answers, event.config.residenceRegion, referenceDate);
  const session = createConsultationSession({
    announcementId: outcome.listing.listingId,
    listingId: outcome.listing.listingId,
    userProfileSnapshot: input.profile,
    collectedAnswers: input.details,
    supplyType: outcome.supplyType,
  });
  session.lastAssessmentResult = structuredClone(outcome.result);
  session.missingFields = [...outcome.result.missingInformation];
  return { context, session, messages: [{ role: 'assistant', text: greeting(outcome) }] };
}

function greeting(outcome: KioskOutcome | null): string {
  if (!outcome) return '궁금한 점을 물어보세요. 분석을 마치면 내 결과와 공고를 기준으로 답해 드려요.';
  if (!outcome.result) {
    return `${outcome.listing.title}은 완판e가 아직 신청 조건을 확인하지 않은 공고예요. 이 공고는 자격을 판단해 드릴 수 없고, 청약홈 공고문을 함께 확인해 주세요.`;
  }
  return `${outcome.listing.title} · ${outcome.supplyLabel} 기준으로 답해 드릴게요. 입력하신 정보를 그대로 쓰고 있어요.`;
}

/** 엔진이 '배우자 기준'처럼 판정 밖의 질문을 받으면 정직하게 범위를 말한다. */
const SPOUSE_QUESTION = /배우자\s*(기준|명의|이름|로)/;

function detailOf(response: ConsultationResponse): string[] {
  const lines: string[] = [];
  if (response.reason && response.reason !== response.summary) lines.push(response.reason);
  if (response.nextStep) lines.push(response.nextStep);
  for (const question of response.suggestedQuestions.slice(0, 2)) lines.push(`확인할 것: ${question.prompt}`);
  return lines;
}

export async function sendChat(event: LoadedEvent, chat: KioskChat, message: string): Promise<KioskChat> {
  const text = message.trim();
  if (!text) return chat;
  const messages = [...chat.messages, { role: 'user' as const, text }];
  if (!chat.session && !chat.context.outcomeId) {
    return {
      ...chat,
      messages: [...messages, {
        role: 'assistant',
        text: '아직 분석 결과가 없어요. 정보를 입력하고 분석을 마치면 내 결과와 공고를 기준으로 답해 드릴게요.',
        detail: ['모르는 항목은 “잘 모르겠어요”를 골라도 돼요. 결과에서 무엇을 더 확인해야 하는지 알려 드려요.'],
      }],
    };
  }
  if (!chat.session) {
    return {
      ...chat,
      messages: [...messages, {
        role: 'assistant',
        text: '이 공고는 완판e가 신청 조건을 확인하기 전이라 자격이나 순위를 말씀드릴 수 없어요. 결과 화면에서 다른 공고를 고르면 그 공고 기준으로 답해 드려요.',
      }],
    };
  }
  if (SPOUSE_QUESTION.test(text)) {
    return {
      ...chat,
      messages: [...messages, {
        role: 'assistant',
        text: '지금 결과는 입력하신 본인을 신청자로 계산했어요. 배우자를 신청자로 하면 나이·소득세 납부기간·청약통장이 배우자 기준으로 바뀌어서 결과가 달라질 수 있어요.',
        detail: ['정확히 비교하려면 처음 화면에서 배우자 정보를 신청자 정보로 입력해 다시 확인해 주세요.', '세대 무주택·소득·자산 기준은 누가 신청해도 세대 전체로 봐요.'],
      }],
    };
  }
  const { session, response } = await engineFor(event, chat.session.listingId).sendMessage(chat.session, text);
  return {
    ...chat,
    session,
    messages: [...messages, { role: 'assistant', text: response.summary ?? response.message, detail: detailOf(response) }],
  };
}
