import type { CopilotMessage, CopilotPlannerResult } from './types.ts';

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, '');

/** Policy-owned planner. An LLM proposal can be logged separately but cannot execute actions. */
export function planCopilotAction(question: string, conversation: readonly CopilotMessage[] = [], activeNoticeIds: readonly string[] = []): CopilotPlannerResult {
  const value = normalize(question), prior = [...conversation].reverse().find(item => item.role === 'assistant')?.plan;
  if (/(바뀌면|된다면|되면|가정|시뮬레이션|내년결혼)/.test(value)) return { plan: 'RUN_SIMULATION', confidence: 'HIGH', noticeIds: [...activeNoticeIds], requiresPolicyApproval: true };
  if (/(다른공고|공고.*비교|차이|둘중|어디가)/.test(value)) return { plan: 'COMPARE_NOTICES', confidence: 'HIGH', noticeIds: [...activeNoticeIds], requiresPolicyApproval: false };
  if (/(맞는청약|신청가능|평가해|판정해)/.test(value)) return { plan: 'RUN_ASSESSMENT', confidence: 'HIGH', noticeIds: [...activeNoticeIds], requiresPolicyApproval: true };
  if (/(안알려준|뭘더|무엇을더|먼저.*확인|가장먼저.*해야|모르는것|준비해야)/.test(value)) return { plan: 'ASK_FOLLOWUP', confidence: 'HIGH', noticeIds: [...activeNoticeIds], requiresPolicyApproval: false };
  if (/왜(그걸|그게|그런|\?|$)|왜.*(먼저|이걸|이질문).*물어|추천.*왜|결과.*이유/.test(value) || (value === '왜?' && prior)) return { plan: 'EXPLAIN_RESULT', confidence: 'HIGH', noticeIds: [...activeNoticeIds], requiresPolicyApproval: false };
  if (/(공고문|근거|서류|제한|특례|토지임대부)/.test(value)) return { plan: 'RETRIEVE_EVIDENCE', confidence: 'HIGH', noticeIds: [...activeNoticeIds], requiresPolicyApproval: false };
  return { plan: 'ANSWER', confidence: 'MEDIUM', noticeIds: [...activeNoticeIds], requiresPolicyApproval: false };
}

export function authorizeCopilotPlan(plan: CopilotPlannerResult): boolean {
  // Read-only assessment/simulation are allowed; no plan can mutate a profile or database.
  return ['ANSWER', 'ASK_FOLLOWUP', 'RUN_ASSESSMENT', 'RUN_SIMULATION', 'RETRIEVE_EVIDENCE', 'COMPARE_NOTICES', 'EXPLAIN_RESULT'].includes(plan.plan);
}
