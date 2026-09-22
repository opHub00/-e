import { assessApplication } from '../engine.ts';
import { buildConsultationResponse, selectMissingQuestions, unsupportedConsultationResponse } from './answerBuilder.ts';
import { buildProfileSummaryResponse } from './profileSummary.ts';
import { decodeConsultationInterpretation, DeterministicConsultationInterpreter, isUnknownConsultationAnswer } from './interpreter.ts';
import { appendTurn, applyConsultationUpdates, assessmentInputFromSession } from './session.ts';
import type {
  ConsultationEngineOptions,
  ConsultationIntent,
  ConsultationResponse,
  ConsultationSendResult,
  ConsultationSession,
} from './types.ts';

/**
 * Conversation orchestration only. The imported assessApplication function is
 * the sole authority for eligibility, stages, scores and condition outcomes.
 */
export class ApplicationAssessmentConsultationEngine {
  private readonly provider;
  private readonly rules;

  constructor(options: ConsultationEngineOptions) {
    this.rules = options.rules;
    this.provider = options.provider ?? new DeterministicConsultationInterpreter();
  }

  async sendMessage(session: ConsultationSession, message: string): Promise<ConsultationSendResult> {
    const withUser = { ...structuredClone(session), conversationTurns: appendTurn(session.conversationTurns, { role: 'USER', message }) };
    let intent: ConsultationIntent = 'UNKNOWN';
    let interpretation;
    try {
      interpretation = decodeConsultationInterpretation(await this.provider.interpret({
        message,
        announcementId: session.announcementId,
        listingId: session.listingId,
        supplyType: session.supplyType,
      }));
      intent = interpretation.intent;
    } catch {
      const response = unsupportedConsultationResponse(intent, 'INTERPRETATION_FAILED');
      return this.complete(withUser, response);
    }

    // 내 정보 보기는 판정을 다시 하지 않고 세션에 있는 값만 보여준다.
    if (intent === 'SHOW_PROFILE') return this.complete(withUser, buildProfileSummaryResponse(withUser));
    if (!this.rules) return this.complete(withUser, unsupportedConsultationResponse(intent, 'NO_RULES'));
    const updated = applyConsultationUpdates(withUser, interpretation.updates, this.rules);
    if (isUnknownConsultationAnswer(message) && interpretation.updates.length === 0) {
      const currentMissing = updated.lastAssessmentResult?.missingInformation ?? updated.missingFields;
      const currentQuestion = selectMissingQuestions(currentMissing, updated.deferredFields)[0];
      if (currentQuestion) updated.deferredFields = [...new Set([...updated.deferredFields, currentQuestion.key])];
    }
    const previousSupply = updated.supplyType;
    updated.supplyType = interpretation.supplyType ?? updated.supplyType;
    if (!updated.supplyType) return this.complete(updated, unsupportedConsultationResponse(intent, 'NO_SUPPLY'));

    const results = assessApplication(this.rules, assessmentInputFromSession(updated), updated.listingId);
    const result = results.find(item => item.supplyType === updated.supplyType);
    if (!result) return this.complete(updated, unsupportedConsultationResponse(intent, 'NO_SUPPLY'));
    updated.lastAssessmentResult = structuredClone(result);
    updated.missingFields = [...result.missingInformation];
    const transition = interpretation.supplyType && interpretation.supplyType !== previousSupply
      ? `${interpretation.supplyType === 'youth' ? '청년' : interpretation.supplyType === 'newlywed' ? '신혼부부' : '생애최초'} 특별공급 기준으로 볼게요.`
      : undefined;
    const response = buildConsultationResponse({
      intent, result, evidenceRequested: interpretation.evidenceRequested, userMessage: message,
      deferredFields: updated.deferredFields, contextTransition: transition,
    });
    return this.complete(updated, response);
  }

  private complete(session: ConsultationSession, response: ConsultationResponse): ConsultationSendResult {
    const next = structuredClone(session);
    next.conversationTurns = appendTurn(next.conversationTurns, { role: 'ASSISTANT', message: response.message, intent: response.intent });
    return { session: next, response };
  }
}
