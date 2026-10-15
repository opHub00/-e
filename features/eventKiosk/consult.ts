import { createAssessmentContext, type AssessmentContext } from './frozen/consultation/context.ts';
import type { EvaluationResult } from './frozen/domain/evaluation.ts';
import type { Listing } from './frozen/domain/rules.ts';
import type { UserProfile } from './frozen/domain/profile.ts';
import type { KioskEvaluation, KioskOutcome } from './evaluate.ts';
import type { LoadedEvent } from './eventConfig.ts';
import { KIOSK_STATUS_LABELS, userFacingFactLabel, userFacingLabels } from './presentation.ts';
import { experienceAnswer, sanitizeReply } from './experience/chatAnswers.ts';
import { evidenceOnlyFacts } from './experience/explain.ts';
import type { SamdoPresentationItem, SamdoPresentationRecommendation } from './samdo/index.ts';
import { buildEventChatContext } from './chat/context.ts';
import { requestEventChat } from './chat/client.ts';
import { boundedEventChatHistory, redactEventChatText } from './chat/privacy.ts';
import type { EventChatMode, EventChatRequest } from './chat/contract.ts';
import { SAMDO_EVENT } from './samdoEventScope.ts';
import { answerSamdoDualDeterministically, buildSamdoDualChatContext } from './samdoDual/chat.ts';
import type { SamdoDualAssessment } from './samdoDual/types.ts';

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
  /** 삼도 전용 화면에서 들어온 경우의 presentation-safe 판정 context. URL이나 서버에 저장하지 않는다. */
  samdoRecommendation: SamdoPresentationRecommendation | null;
  /** V2 1·2지구 판정 스냅샷. 원본 프로필은 포함하지 않는다. */
  samdoDualAssessment: SamdoDualAssessment | null;
  messages: Array<{
    role: 'user' | 'assistant';
    text: string;
    detail?: string[];
    /** QA/운영 확인용. 화면에는 provider 이름을 강제로 노출하지 않는다. */
    response?: { mode: EventChatMode; provider?: string; model?: string; requestId?: string };
  }>;
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
      samdoRecommendation: null,
      samdoDualAssessment: null,
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
    samdoRecommendation: null,
    samdoDualAssessment: null,
    messages: [{ role: 'assistant', text: `${outcome.listing.title} · ${outcome.supplyLabel} 결과와 공고 원문 근거를 기준으로 답해 드릴게요.` }],
  };
}

const samdoFocus = (recommendation: SamdoPresentationRecommendation): SamdoPresentationItem | null =>
  recommendation.recommendedType ?? recommendation.alternatives[0] ?? recommendation.lowerPriorityTypes[0] ?? null;

/** 삼도 전용 결과를 기존 상담 화면에 연결한다. 판정을 다시 실행하거나 URL에 사용자 값을 넣지 않는다. */
export function startSamdoChat(event: LoadedEvent, recommendation: SamdoPresentationRecommendation): KioskChat {
  const focus = samdoFocus(recommendation);
  return {
    context: {
      outcomeId: null,
      listingTitle: SAMDO_EVENT.title,
      supplyLabel: focus?.supplyLabel ?? '공급유형 분석',
      datasetVersion: event.dataset.datasetVersion,
      datasetFingerprint: event.dataset.fingerprint,
    },
    assessmentContext: null,
    userProfile: null,
    listing: null,
    result: null,
    samdoRecommendation: recommendation,
    samdoDualAssessment: null,
    messages: [{
      role: 'assistant',
      text: focus
        ? `${focus.supplyLabel}을(를) 중심으로 삼도이동 1지구의 유형별 판정과 공고 근거를 설명해 드릴게요.`
        : '삼도이동 1지구의 유형별 판정과 신청이 어려운 이유를 설명해 드릴게요.',
    }],
  };
}

/** 1회 입력으로 계산된 1·2지구 결과를 같은 상담 endpoint에 안전하게 연결한다. */
export function startSamdoDualChat(event: LoadedEvent, assessment: SamdoDualAssessment): KioskChat {
  const preferred = assessment.comparison.preferredDistrictId
    ? assessment.districts.find(item => item.district.id === assessment.comparison.preferredDistrictId) ?? assessment.districts[0]
    : assessment.districts[0];
  const focus = preferred.recommendation.recommendedType ?? preferred.recommendation.evaluations[0] ?? null;
  return {
    context: {
      outcomeId: null,
      listingTitle: '삼도이동 1·2지구 토지임대부 분양주택',
      supplyLabel: focus?.supplyLabel ?? '공급유형 분석',
      datasetVersion: event.dataset.datasetVersion,
      datasetFingerprint: event.dataset.fingerprint,
    },
    assessmentContext: null,
    userProfile: null,
    listing: null,
    result: null,
    samdoRecommendation: null,
    samdoDualAssessment: assessment,
    messages: [{ role: 'assistant', text: '동일한 입력으로 계산한 삼도이동 1·2지구 판정과 최종1.8 공고문 근거를 기준으로 답해 드릴게요.' }],
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
    if (result.officialScore.status === 'NOT_APPLICABLE') return { text: '이 공급에는 적용되는 공식 배점표가 없어요.', detail: [userFacingFactLabel(result.officialScore.reason)] };
    if (result.officialScore.status === 'PENDING') return {
      text: '공식 배점을 0점으로 처리하지 않았어요. 필요한 정보를 확인하면 계산할 수 있어요.',
      detail: [userFacingFactLabel(result.officialScore.reason), ...userFacingLabels(result.officialScore.missingInformation)],
    };
    return {
      text: `공식 공고 배점은 ${result.officialScore.total} / ${result.officialScore.max}점이에요. 완판e 추천과는 별도예요.`,
      detail: result.officialScore.breakdown.map(item => `${userFacingFactLabel(item.label)}: ${item.points} / ${item.max}점`),
    };
  }
  if (/근거|공고문|원문|출처/.test(message)) {
    const evidence = chat.assessmentContext.evidence.filter(item => item.listingId === result.listingId && result.evidenceIds.includes(item.id));
    return {
      text: `${chat.listing.publisher} 공고의 검수된 근거 ${evidence.length}개를 연결했어요.`,
      detail: evidence.slice(0, 5).map(item => `${userFacingFactLabel(item.section)}${item.page ? ` · ${item.page}쪽` : ''} · ${userFacingFactLabel(item.label)}`),
    };
  }
  if (/확인|조건|준비|서류/.test(message)) {
    const details = userFacingLabels([...result.missingInformation, ...result.failedRules.map(rule => rule.label)]);
    return details.length
      ? { text: '다음 조건을 확인해 주세요. 모르는 값은 불리하다고 가정하지 않고 확인 필요로 남겼어요.', detail: details.slice(0, 6) }
      : { text: '현재 입력으로 자격 조건 판정은 완료됐어요.', detail: userFacingLabels(result.matchedRules.slice(0, 5).map(rule => rule.label)) };
  }
  const status = result.eligibility === 'ELIGIBLE'
    ? KIOSK_STATUS_LABELS.COMPLETE
    : result.eligibility === 'INELIGIBLE'
      ? KIOSK_STATUS_LABELS.INELIGIBLE
      : KIOSK_STATUS_LABELS.NEEDS_USER_INPUT;
  return {
    text: `현재 판정은 “${status}”예요. 공고 규칙을 새로 추측하지 않고 저장된 판정 결과만 설명하고 있어요.`,
    detail: result.eligibility === 'ELIGIBLE'
      ? userFacingLabels(result.matchedRules.slice(0, 5).map(rule => rule.label))
      : userFacingLabels([...result.failedRules.map(rule => rule.label), ...result.missingInformation]).slice(0, 6),
  };
}

function answerSamdo(recommendation: SamdoPresentationRecommendation, message: string): { text: string; detail?: string[] } {
  const focus = samdoFocus(recommendation);
  if (!focus) {
    const rejected = recommendation.rejectedTypes.slice(0, 5).map(item => `${item.supplyLabel}: ${item.failedReasons[0] ?? '신청 조건을 충족하지 못했어요.'}`);
    return { text: '현재 입력으로 자동 추천할 수 있는 공급유형이 없어요.', detail: rejected };
  }
  const schedule = SAMDO_EVENT.schedule;
  if (/당첨자?\s*발표|발표\s*(?:일|날짜|언제)/.test(message)) {
    return { text: `당첨자 발표일은 ${schedule.winnerAnnouncement.replaceAll('-', '.')}입니다.` };
  }
  if (/서류\s*(?:접수|제출).*(?:언제|일|날짜)|(?:언제|일|날짜).*서류\s*(?:접수|제출)/.test(message)) {
    return { text: `당첨자 서류접수는 ${schedule.documentSubmission.start.replaceAll('-', '.')}~${schedule.documentSubmission.end.replaceAll('-', '.')}입니다.` };
  }
  if (/계약\s*(?:체결)?.*(?:언제|일|날짜)|(?:언제|일|날짜).*계약/.test(message)) {
    return { text: `계약체결 기간은 ${schedule.contract.start.replaceAll('-', '.')}~${schedule.contract.end.replaceAll('-', '.')}입니다.` };
  }
  if (/특별\s*공급.*(?:접수|신청|언제|날짜)|(?:접수|신청|언제|날짜).*특별\s*공급/.test(message)) {
    return { text: `특별공급 접수일은 ${schedule.special.replaceAll('-', '.')}입니다.` };
  }
  if (/일반\s*공급.*1\s*순위|1\s*순위.*(?:접수|신청|언제|날짜)/.test(message)) {
    return { text: `일반공급 1순위 접수일은 ${schedule.generalFirst.replaceAll('-', '.')}입니다.` };
  }
  if (/일반\s*공급.*2\s*순위|2\s*순위.*(?:접수|신청|언제|날짜)/.test(message)) {
    return { text: `일반공급 2순위 접수일은 ${schedule.generalSecond.replaceAll('-', '.')}입니다.` };
  }
  if (/(?:신청|청약|접수).*(?:언제|언제부터|날짜|일정)|(?:언제|언제부터).*(?:신청|청약|접수)/.test(message)) {
    return {
      text: `삼도이동 1지구 청약은 특별공급 ${schedule.special.replaceAll('-', '.')}, 일반공급 1순위 ${schedule.generalFirst.replaceAll('-', '.')}, 2순위 ${schedule.generalSecond.replaceAll('-', '.')}에 접수합니다.`,
      detail: [`당첨자 발표 ${schedule.winnerAnnouncement.replaceAll('-', '.')}`, `서류접수 ${schedule.documentSubmission.start.replaceAll('-', '.')}~${schedule.documentSubmission.end.replaceAll('-', '.')}`, `계약체결 ${schedule.contract.start.replaceAll('-', '.')}~${schedule.contract.end.replaceAll('-', '.')}`],
    };
  }
  if (/서류|증빙|준비물|제출/.test(message)) {
    return focus.evidenceRequired.length
      ? { text: `${focus.supplyLabel}에서 서류로 확인해야 할 항목이에요.`, detail: focus.evidenceRequired.slice(0, 6) }
      : { text: `${focus.supplyLabel} 판정에 남은 별도 증빙 항목은 없어요. 실제 접수 기본서류는 공고문에서 다시 확인해 주세요.` };
  }
  if (/비교|다른\s*(공급|유형)|어떤\s*게\s*나아/.test(message)) {
    return {
      text: `유형별 판정 순서는 저장된 추천 결과를 그대로 보여 드려요. 공급 세대수로 당첨 가능성을 추정하지 않았어요.`,
      detail: recommendation.evaluations.slice(0, 6).map(item => `${item.rank}순위 · ${item.supplyLabel} · ${item.stageLabel}`),
    };
  }
  if (/근거|공고문|원문|출처/.test(message)) {
    return {
      text: `${focus.supplyLabel} 판정에 연결된 공고문 근거예요.`,
      detail: focus.evidence.slice(0, 5).map(item => `${item.section}${item.page ? ` · ${item.page}쪽` : ''} · ${item.label}`),
    };
  }
  if (/공식\s*(?:점수|가점)|점수|가점/.test(message)) {
    if (focus.officialScore.status === 'AVAILABLE') return { text: `${focus.supplyLabel}의 공식 가점은 ${focus.officialScore.total}/${focus.officialScore.max}점입니다. 완판e 추천순위와는 별도입니다.`, detail: focus.officialScore.breakdown.map(item => `${item.label}: ${item.points}/${item.max}점`).slice(0, 5) };
    if (focus.officialScore.status === 'PENDING') return { text: `${focus.supplyLabel}의 공식 가점은 필요한 정보를 확인한 뒤 계산할 수 있습니다.` };
    return { text: `${focus.supplyLabel}에는 공식 가점제가 적용되지 않습니다. 완판e 추천순위와는 별도입니다.` };
  }
  if (/소득/.test(message)) return { text: `${focus.supplyLabel}의 소득 판정은 입력 금액을 전송하지 않고 확정된 판정 결과만 설명합니다.`, detail: [...focus.matchedAdvantages, ...focus.cautions].filter(item => item.includes('소득')).slice(0, 5) };
  if (/자산/.test(message)) return { text: `${focus.supplyLabel}의 자산 판정은 공고 기준과 확인된 판정 상태를 따릅니다. 모르는 값은 충족으로 추정하지 않습니다.`, detail: [...focus.matchedAdvantages, ...focus.cautions, ...focus.evidenceRequired].filter(item => item.includes('자산')).slice(0, 5) };
  if (/청약\s*통장|입주자저축|납입|저축액/.test(message)) return { text: `${focus.supplyLabel}의 입주자저축 기준은 저장된 판정 결과를 따릅니다.`, detail: [...focus.matchedAdvantages, ...focus.cautions, ...focus.evidenceRequired].filter(item => /통장|납입|저축/.test(item)).slice(0, 5) };
  if (/확인|조건|중요|핵심/.test(message)) {
    const checks = [...focus.cautions, ...focus.evidenceRequired];
    return checks.length
      ? { text: `${focus.supplyLabel}에서 먼저 확인할 조건이에요.`, detail: checks.slice(0, 6) }
      : { text: `${focus.supplyLabel}의 입력 조건은 모두 확인됐어요.`, detail: focus.matchedAdvantages.slice(0, 5) };
  }
  return { text: '질문을 정확히 이해하지 못했어요. 신청 일정, 자격조건, 소득·자산 기준, 청약통장, 공식 점수, 준비서류 중 무엇이 궁금하신가요?' };
}

export type EventChatTransport = {
  fetcher?: typeof fetch;
  endpoint?: string;
  /** Node 단위 테스트는 기본적으로 네트워크를 쓰지 않는다. 주입 테스트에서만 true로 켠다. */
  allowNetwork?: boolean;
};

export async function sendChat(event: LoadedEvent, chat: KioskChat, message: string, transport: EventChatTransport = {}): Promise<KioskChat> {
  const text = message.trim();
  if (!text) return chat;
  // 기존 deterministic 답은 항상 먼저 만든다. LLM은 이 답을 대체 계산하지 않고 설명만 풍부하게 한다.
  const deterministic = sanitizeReply(chat.samdoDualAssessment
    ? answerSamdoDualDeterministically(chat.samdoDualAssessment, text)
    : chat.samdoRecommendation
      ? answerSamdo(chat.samdoRecommendation, text)
      : experienceAnswer(chat, text, evidenceOnlyFacts(event.dataset)) ?? answer(chat, text));
  const context = chat.samdoDualAssessment
    ? buildSamdoDualChatContext(chat.samdoDualAssessment, text)
    : buildEventChatContext(chat);
  const canUseEndpoint = Boolean(context) && (transport.allowNetwork === true || typeof window !== 'undefined');
  let response = deterministic;
  let metadata: NonNullable<KioskChat['messages'][number]['response']> = { mode: 'deterministic' };

  if (context && canUseEndpoint) {
    const request: EventChatRequest = {
      question: redactEventChatText(text),
      history: boundedEventChatHistory(chat.messages.map(item => ({ role: item.role, text: item.text }))),
      context,
      fallback: deterministic,
    };
    const remote = await requestEventChat(request, transport.fetcher ?? fetch, transport.endpoint ?? '/event-api/chat');
    if (remote) {
      response = sanitizeReply({ text: remote.text, ...(remote.detail ? { detail: remote.detail } : {}) });
      metadata = { mode: remote.mode, ...(remote.provider ? { provider: remote.provider } : {}), ...(remote.model ? { model: remote.model } : {}), ...(remote.requestId ? { requestId: remote.requestId } : {}) };
    } else {
      metadata = { mode: 'fallback' };
    }
  }
  return {
    ...chat,
    messages: [...chat.messages, { role: 'user', text }, { role: 'assistant', ...response, response: metadata }],
  };
}
