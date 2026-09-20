import { REVIEW_STATUS_LABEL } from './reviewLabels.ts';
import type { ReviewSummaryDto } from '../server/dto.ts';
import type { RuleReviewStatus, RuleReviewWorkspace } from '../server/types.ts';

export type ReviewStatusPresentation = {
  currentLabel: string;
  tone: 'plain' | 'REVIEW_REQUIRED';
  previousLabel: string | null;
};

/**
 * An old decision remains in history after a document change, but it is never
 * presented as approval of the current document.
 */
export function reviewStatusPresentation(
  status: RuleReviewStatus,
  lifecycleStatus: RuleReviewWorkspace['lifecycleStatus'],
): ReviewStatusPresentation {
  if (lifecycleStatus !== 'REVALIDATION_REQUIRED') {
    return { currentLabel: REVIEW_STATUS_LABEL[status], tone: 'plain', previousLabel: null };
  }
  const decided = !['PENDING_REVIEW', 'IN_REVIEW'].includes(status);
  return {
    currentLabel: '재확인 필요',
    tone: 'REVIEW_REQUIRED',
    previousLabel: decided ? `이전 문서 기준 · ${REVIEW_STATUS_LABEL[status]}` : null,
  };
}

export type ReviewProgressPresentation = {
  heading: string;
  primaryLine: string;
  decisionLine: string;
  previousDecisionCount: number;
  currentCompletedCount: number;
};

/** Current-cycle progress excludes every decision made against the old document hash. */
export function reviewProgressPresentation(
  summary: Pick<ReviewSummaryDto, 'totalRules' | 'pending' | 'approved' | 'edited' | 'held' | 'rejected'>,
  lifecycleStatus: RuleReviewWorkspace['lifecycleStatus'],
  blockerCount: number,
  criticalCount: number,
): ReviewProgressPresentation {
  const previousDecisionCount = summary.approved + summary.edited + summary.held + summary.rejected;
  if (lifecycleStatus === 'REVALIDATION_REQUIRED') {
    return {
      heading: `재검수 완료 0 / ${summary.totalRules}`,
      primaryLine: `재확인 필요 ${summary.totalRules}건 · 활성화 blocker ${blockerCount}건`,
      decisionLine: `이전 문서 기준 검수 ${previousDecisionCount}건 · 현재 문서 승인 0건`,
      previousDecisionCount,
      currentCompletedCount: 0,
    };
  }
  return {
    heading: `검수 완료 ${previousDecisionCount} / ${summary.totalRules}`,
    primaryLine: `남은 검수 ${summary.pending}건 · 반드시 확인 ${criticalCount}건 · 활성화 blocker ${blockerCount}건`,
    decisionLine: `승인 ${summary.approved} · 수정 후 승인 ${summary.edited} · 보류 ${summary.held} · 제외 ${summary.rejected}`,
    previousDecisionCount: 0,
    currentCompletedCount: previousDecisionCount,
  };
}
