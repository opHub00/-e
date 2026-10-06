import { createAssessmentContext, type AssessmentContext } from './frozen/consultation/context.ts';
import type { EvaluationResult } from './frozen/domain/evaluation.ts';
import type { Listing } from './frozen/domain/rules.ts';
import type { UserProfile } from './frozen/domain/profile.ts';
import type { KioskEvaluation, KioskOutcome } from './evaluate.ts';
import type { LoadedEvent } from './eventConfig.ts';

export type KioskChatContext = {
  outcomeId: string | null;
  listingTitle: string | null;
  supplyLabel: string | null;
  datasetVersion: string;
  datasetFingerprint: string;
};

export type KioskChat = {
  context: KioskChatContext;
  assessmentContext: AssessmentContext | null;
  userProfile: UserProfile | null;
  listing: Listing | null;
  result: EvaluationResult | null;
  messages: { role: 'user' | 'assistant'; text: string; detail?: string[] }[];
};

export function defaultChatOutcome(outcomes: KioskOutcome[]): KioskOutcome | null {
  return outcomes.find(outcome => outcome.result && outcome.status !== 'INELIGIBLE') ?? outcomes.find(outcome => outcome.result) ?? outcomes[0] ?? null;
}

export function suggestedQuestions(outcome: KioskOutcome | null): string[] {
  if (!outcome?.result) return ['왜 판정할 수 없나요?', '어떤 공고를 먼저 보면 좋을까요?'];
  const questions = [
    outcome.stageLabel ? `왜 저는 ${outcome.stageLabel} 대상인가요?` : '왜 이런 결과가 나왔나요?',
    '제가 더 확인해야 하는 조건은 무엇인가요?',
    outcome.officialScoreState.status === 'AVAILABLE' ? '공식 배점은 어떻게 계산됐나요?' : '이 공급에는 공식 배점이 있나요?',
    '근거가 된 공고문 항목은 무엇인가요?',
  ];
  return questions.slice(0, 4);
}

export function startChat(event: LoadedEvent, evaluation: KioskEvaluation | null, outcome: KioskOutcome | null): KioskChat {
  const context: KioskChatContext = {
    outcomeId: outcome?.id ?? null,
    listingTitle: outcome?.listing.title ?? null,
    supplyLabel: outcome?.supplyLabel ?? null,
    datasetVersion: event.dataset.datasetVersion,
    datasetFingerprint: event.dataset.fingerprint,
  };
  if (!evaluation || !outcome?.result) {
    return {
      context,
      assessmentContext: null,
      userProfile: evaluation?.profile ?? null,
      listing: null,
      result: null,
      messages: [{ role: 'assistant', text: '분석을 마치면 입력하신 정보와 검수된 공고 근거를 기준으로 답해 드려요.' }],
    };
  }
  const listing = event.dataset.listings.find(item => item.id === outcome.listing.listingId) ?? null;
  return {
    context,
    assessmentContext: createAssessmentContext(evaluation.profile, event.dataset, evaluation.assessment),
    userProfile: evaluation.profile,
    listing,
    result: outcome.result,
    messages: [{ role: 'assistant', text: `${outcome.listing.title} · ${outcome.supplyLabel} 결과와 공고 원문 근거를 기준으로 답해 드릴게요.` }],
  };
}

const SPOUSE_QUESTION = /배우자\s*(기준|명의|이름|로)/;

function answer(chat: KioskChat, message: string): { text: string; detail?: string[] } {
  const result = chat.result;
  if (!result || !chat.listing || !chat.assessmentContext) {
    return { text: '아직 연결된 분석 결과가 없어요. 정보를 입력하고 분석을 먼저 마쳐 주세요.' };
  }
  if (SPOUSE_QUESTION.test(message)) {
    return {
      text: '현재 결과는 입력 화면에서 지정한 본인을 신청자로 계산했어요.',
      detail: ['배우자를 신청자로 바꾸면 배우자의 생년월일·소득·청약통장 정보가 필요해요.', '지금 입력하지 않은 배우자 개인값은 추측하지 않았어요.'],
    };
  }
  if (/공식\s*(배점|점수)|배점/.test(message)) {
    if (result.officialScore.status === 'NOT_APPLICABLE') return { text: '이 공급에는 적용되는 공식 배점표가 없어요.', detail: [result.officialScore.reason] };
    if (result.officialScore.status === 'PENDING') return { text: '공식 배점을 0점으로 처리하지 않았어요. 필요한 정보를 확인하면 계산할 수 있어요.', detail: [result.officialScore.reason, ...result.officialScore.missingInformation] };
    return {
      text: `공식 공고 배점은 ${result.officialScore.total} / ${result.officialScore.max}점이에요. 완판e 추천과는 별도예요.`,
      detail: result.officialScore.breakdown.map(item => `${item.label}: ${item.points} / ${item.max}점`),
    };
  }
  if (/근거|공고문|원문|출처/.test(message)) {
    const evidence = chat.assessmentContext.evidence.filter(item => item.listingId === result.listingId && result.evidenceIds.includes(item.id));
    return {
      text: `${chat.listing.publisher} 공고의 검수된 근거 ${evidence.length}개를 연결했어요.`,
      detail: evidence.slice(0, 5).map(item => `${item.section}${item.page ? ` · ${item.page}쪽` : ''} · ${item.label}`),
    };
  }
  if (/확인|조건|준비|서류/.test(message)) {
    const details = [...result.missingInformation, ...result.failedRules.map(rule => rule.label)];
    return details.length
      ? { text: '다음 조건을 확인해 주세요. 모르는 값은 불리하다고 가정하지 않고 확인 필요로 남겼어요.', detail: details.slice(0, 6) }
      : { text: '현재 입력으로 자격 조건 판정은 완료됐어요.', detail: result.matchedRules.slice(0, 5).map(rule => rule.label) };
  }
  const status = result.eligibility === 'ELIGIBLE' ? '신청 가능' : result.eligibility === 'INELIGIBLE' ? '신청 어려움' : '추가 확인 필요';
  return {
    text: `현재 판정은 “${status}”예요. 공고 규칙을 새로 추측하지 않고 저장된 판정 결과만 설명하고 있어요.`,
    detail: result.eligibility === 'ELIGIBLE'
      ? result.matchedRules.slice(0, 5).map(rule => rule.label)
      : [...result.failedRules.map(rule => rule.label), ...result.missingInformation].slice(0, 6),
  };
}

export async function sendChat(_event: LoadedEvent, chat: KioskChat, message: string): Promise<KioskChat> {
  const text = message.trim();
  if (!text) return chat;
  const response = answer(chat, text);
  return {
    ...chat,
    messages: [...chat.messages, { role: 'user', text }, { role: 'assistant', ...response }],
  };
}
