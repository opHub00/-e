import { NoticePlatform } from '../../noticePlatform/platform.ts';
import type { Assessment } from '../../noticePlatform/types.ts';
import type { NoticeComparisonViewModel } from './types.ts';

export function buildNoticeComparisonViewModel(platform: NoticePlatform, assessments: readonly Assessment[]): NoticeComparisonViewModel {
  const comparison = platform.compareAssessmentResults(assessments);
  return { notices: assessments.map(result => {
    const presentation = platform.getNoticePresentation(result.noticeId), recommended = result.recommendation.recommended;
    return { noticeId: result.noticeId, title: presentation.title, recommendedSupplyType: recommended?.supplyTypeLabel ?? null,
      eligibility: recommended?.eligibility ?? null, priorityStage: recommended?.priorityStage ?? null,
      officialScore: recommended?.officialScore ?? { status: 'NOT_APPLICABLE' as const }, unresolvedCount: result.unresolvedFacts.length };
  }), orderedNoticeIds: comparison.orderedNoticeIds, preferredNoticeId: comparison.preferredNoticeId,
    reason: comparison.reasons.join(' '), disclaimer: comparison.disclaimer };
}
