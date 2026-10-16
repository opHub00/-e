import { NoticePlatform } from '../../noticePlatform/platform.ts';
import type { NoticeAssessmentInput } from '../../noticePlatform/types.ts';
import { assertCopilotContextPrivacy, buildCopilotPromptContext } from './context.ts';
import { getNextBestQuestion } from './nextQuestion.ts';
import { authorizeCopilotPlan, planCopilotAction } from './planner.ts';
import { buildNoticeComparisonViewModel } from './presentation.ts';
import type { CopilotMessage, CopilotTurnResult } from './types.ts';

export type CopilotTurnInput = { profile: NoticeAssessmentInput; noticeIds: string[]; conversation: CopilotMessage[]; question: string };

/** Read-only policy executor. The LLM receives the result but cannot choose or execute mutations. */
export function runCopilotTurn(platform: NoticePlatform, input: CopilotTurnInput): CopilotTurnResult {
  const plan = planCopilotAction(input.question, input.conversation, input.noticeIds);
  if (!authorizeCopilotPlan(plan)) throw new Error('COPILOT_PLAN_REJECTED');
  const assessments = platform.assessNotices(input.profile, input.noticeIds);
  const nextQuestion = ['RUN_ASSESSMENT', 'ASK_FOLLOWUP'].includes(plan.plan)
    ? getNextBestQuestion({ profile: input.profile, assessments, conversation: input.conversation })
    : null;
  const comparison = plan.plan === 'COMPARE_NOTICES' ? buildNoticeComparisonViewModel(platform, assessments) : null;
  const promptContext = buildCopilotPromptContext(platform, assessments, input.conversation, input.question);
  assertCopilotContextPrivacy(promptContext);
  return { plan, assessments, nextQuestion, comparison, promptContext };
}
