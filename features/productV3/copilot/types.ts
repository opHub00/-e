import type { Assessment, NoticeAssessmentInput, NoticeSupplyAssessment } from '../../noticePlatform/types.ts';

export type CopilotPlan =
  | 'ANSWER'
  | 'ASK_FOLLOWUP'
  | 'RUN_ASSESSMENT'
  | 'RUN_SIMULATION'
  | 'RETRIEVE_EVIDENCE'
  | 'COMPARE_NOTICES'
  | 'EXPLAIN_RESULT';

export type CopilotMessage = {
  role: 'user' | 'assistant';
  text: string;
  plan?: CopilotPlan;
  factId?: string;
  factDisposition?: 'ANSWERED' | 'DOES_NOT_KNOW' | 'SKIPPED';
  createdAt?: string;
};

export type NextBestQuestion = {
  factId: string;
  question: string;
  reason: string;
  affectedNoticeIds: string[];
  affectedSupplyTypes: string[];
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  /** Internal ranking value. Presentation adapters must not display it. */
  expectedInformationGain: number;
  evidenceNeeded: string;
};

export type NextBestQuestionInput = {
  profile: NoticeAssessmentInput;
  assessments: Assessment[];
  conversation: CopilotMessage[];
};

export type CopilotPlannerResult = {
  plan: CopilotPlan;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  noticeIds: string[];
  requiresPolicyApproval: boolean;
};

export type NoticeComparisonViewModel = {
  notices: Array<{
    noticeId: string;
    title: string;
    recommendedSupplyType: string | null;
    eligibility: NoticeSupplyAssessment['eligibility'] | null;
    priorityStage: string | null;
    officialScore: NoticeSupplyAssessment['officialScore'];
    unresolvedCount: number;
  }>;
  orderedNoticeIds: string[];
  preferredNoticeId: string | null;
  reason: string;
  disclaimer: string;
};

export type CopilotSimulationOverride = { path: string; value: string | number | boolean | null };
export type CopilotSimulationResult = {
  baseline: Assessment[];
  overrides: CopilotSimulationOverride[];
  simulatedResult: Assessment[];
  diffs: Array<{
    noticeId: string;
    recommendedTypeBefore: string | null;
    recommendedTypeAfter: string | null;
    newlyEligibleTypes: string[];
    noLongerEligibleTypes: string[];
    officialScoreChanged: boolean;
    unresolvedBefore: number;
    unresolvedAfter: number;
  }>;
};

export type CopilotPromptContext = {
  scope: 'NOTICE_PLATFORM';
  notices: Array<{ id: string; title: string; managementNumber: string }>;
  assessments: Array<{
    noticeId: string;
    recommendedType: string | null;
    eligibility: string | null;
    priorityStage: string | null;
    officialScore: NoticeSupplyAssessment['officialScore'];
    unresolved: Array<{ label: string; state: string; question: string; reason: string }>;
  }>;
  evidence: Array<{ noticeId: string; section: string; textExcerpt: string; locator: Record<string, unknown> }>;
  conversation: Array<{ role: 'user' | 'assistant'; text: string }>;
};

export type CopilotTurnResult = {
  plan: CopilotPlannerResult;
  assessments: Assessment[];
  nextQuestion: NextBestQuestion | null;
  comparison: NoticeComparisonViewModel | null;
  promptContext: CopilotPromptContext;
};
