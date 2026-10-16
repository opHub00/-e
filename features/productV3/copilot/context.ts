import { NoticePlatform } from '../../noticePlatform/platform.ts';
import type { Assessment } from '../../noticePlatform/types.ts';
import type { CopilotMessage, CopilotPromptContext } from './types.ts';

const sanitize = (value: string) => value
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[이메일 제거]')
  .replace(/\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b/g, '[전화번호 제거]')
  .replace(/\b\d{6}[- ]?[1-4]\d{6}\b/g, '[주민번호 제거]')
  .replace(/\b(?:qr|token)[:=]\s*[A-Za-z0-9_-]{16,}\b/gi, '[토큰 제거]')
  .slice(0, 500);

/** Presentation-safe context only. It intentionally omits profile values and internal fact ids. */
export function buildCopilotPromptContext(platform: NoticePlatform, assessments: readonly Assessment[], conversation: readonly CopilotMessage[], query: string): CopilotPromptContext {
  const noticeIds = [...new Set(assessments.map(item => item.noticeId))];
  return {
    scope: 'NOTICE_PLATFORM',
    notices: noticeIds.map(id => { const notice = platform.getNoticePresentation(id); return { id, title: notice.title, managementNumber: notice.managementNumber }; }),
    assessments: assessments.map(result => { const recommended = result.recommendation.recommended; return {
      noticeId: result.noticeId, recommendedType: recommended?.supplyTypeLabel ?? null, eligibility: recommended?.eligibility ?? null,
      priorityStage: recommended?.priorityLabel ?? null, officialScore: recommended?.officialScore ?? { status: 'NOT_APPLICABLE' as const },
      unresolved: result.unresolvedFacts.slice(0, 16).map(fact => ({ label: fact.label, state: fact.state, question: fact.question, reason: fact.reason })),
    }; }),
    evidence: noticeIds.flatMap(noticeId => platform.retrieveNoticeEvidence(noticeId, query).map(chunk => ({ noticeId, section: chunk.section,
      textExcerpt: chunk.textExcerpt.slice(0, 1_200), locator: structuredClone(chunk.locator) }))),
    conversation: conversation.slice(-6).map(message => ({ role: message.role, text: sanitize(message.text) })),
  };
}

export function assertCopilotContextPrivacy(context: CopilotPromptContext): void {
  const serialized = JSON.stringify(context);
  for (const forbidden of ['birthDate', 'monthlyIncome', 'householdIncome', 'totalAssets', 'parentAssets', 'factId', 'qrToken', 'answerStates']) {
    if (serialized.includes(forbidden)) throw new Error(`COPILOT_CONTEXT_PRIVATE_FIELD:${forbidden}`);
  }
}
