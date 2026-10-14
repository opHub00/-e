import type { SamdoPresentationItem, SamdoPresentationRecommendation } from '../samdo/index.ts';
import type { SamdoResultSummaryV3 } from '../summary.ts';
import { shortStage, type SamdoResultView } from './samdoResultModel.ts';
import { SAMDO_EVENT } from '../samdoEventScope.ts';

/**
 * 휴대폰 QR 결과. 개인정보 없이 삼도 공급유형·상태·단계·공식 점수·확인사항만 담는다.
 * 저장·token·TTL 보안 계약은 기존 결과 세션과 같다.
 */
function scoreOf(source: SamdoPresentationItem): NonNullable<SamdoResultSummaryV3['focus']>['officialScore'] {
  if (source.officialScore.status === 'AVAILABLE') {
    return { status: 'AVAILABLE', label: `공식 가점 ${source.officialScore.total}/${source.officialScore.max}점` };
  }
  if (source.officialScore.status === 'PENDING') return { status: 'PENDING', label: '공식 가점 계산 전' };
  return { status: 'NOT_APPLICABLE', label: '공식 점수 해당 없음' };
}

export function buildSamdoQrSummary(input: { eventId: string; date: string; recommendation: SamdoPresentationRecommendation; view: SamdoResultView }): SamdoResultSummaryV3 {
  const { recommendation: rec, view } = input;
  const focus = rec.recommendedType ?? rec.alternatives[0] ?? rec.lowerPriorityTypes[0] ?? null;
  return {
    v: 3,
    event: input.eventId,
    date: input.date,
    title: SAMDO_EVENT.title,
    focus: focus ? {
      kind: rec.recommendedType ? 'RECOMMENDED' : 'REVIEW',
      supply: focus.supplyLabel,
      eligibility: focus.eligibility,
      stage: shortStage(focus),
      officialScore: scoreOf(focus),
      reasons: view.why.slice(0, 5),
      checks: [...new Set([...focus.evidenceRequired, ...focus.cautions])].slice(0, 6),
      applicationDate: focus.applicationDate,
    } : null,
    cautions: [...view.documents.slice(0, 3).map(doc => `준비 서류: ${doc}`), ...view.notes].slice(0, 6),
  };
}
