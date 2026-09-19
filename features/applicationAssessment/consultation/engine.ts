import { assessApplication } from '../engine.ts';
import { buildConsultationResponse, unsupportedConsultationResponse } from './answerBuilder.ts';
import { decodeConsultationInterpretation, DeterministicConsultationInterpreter } from './interpreter.ts';
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

    if (!this.rules) return this.complete(withUser, unsupportedConsultationResponse(intent, 'NO_RULES'));
    const updated = applyConsultationUpdates(withUser, interpretation.updates, this.rules);
    updated.supplyType = interpretation.supplyType ?? updated.supplyType;
    if (!updated.supplyType) return this.complete(updated, unsupportedConsultationResponse(intent, 'NO_SUPPLY'));

    const results = assessApplication(this.rules, assessmentInputFromSession(updated), updated.listingId);
    const result = results.find(item => item.supplyType === updated.supplyType);
    if (!result) return this.complete(updated, unsupportedConsultationResponse(intent, 'NO_SUPPLY'));
    updated.lastAssessmentResult = structuredClone(result);
    updated.missingFields = [...result.missingInformation];
    const response = buildConsultationResponse({ intent, result, evidenceRequested: interpretation.evidenceRequested, userMessage: message });
    return this.complete(updated, response);
  }

  private complete(session: ConsultationSession, response: ConsultationResponse): ConsultationSendResult {
    const next = structuredClone(session);
    next.conversationTurns = appendTurn(next.conversationTurns, { role: 'ASSISTANT', message: response.message, intent: response.intent });
    return { session: next, response };
  }
}
