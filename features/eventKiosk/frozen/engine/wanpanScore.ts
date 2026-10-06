import type { EvaluationResult, OfficialScore, Priority, RuleTrace, WanpanScore } from '../domain/evaluation.ts';

type WanpanInputs = Pick<EvaluationResult, 'eligibility'> & {
  priority: Priority;
  officialScore: OfficialScore;
  traces: RuleTrace[];
};

export function calculateWanpanScore(input: WanpanInputs): WanpanScore {
  const eligibilityPoints = input.eligibility === 'ELIGIBLE' ? 45
    : input.eligibility === 'NEEDS_MORE_INFORMATION' ? 22
      : input.eligibility === 'REVIEW_REQUIRED' ? 15 : 0;
  const priorityPoints = input.eligibility === 'INELIGIBLE' ? 0
    : input.priority.status === 'DETERMINED'
    ? Math.max(8, 24 - input.priority.rank * 4)
    : input.priority.status === 'NOT_APPLICABLE' ? 12 : 7;
  const knownTraceCount = input.traces.filter(trace => trace.outcome !== 'UNKNOWN').length;
  const informationPoints = input.traces.length === 0 ? 20 : Math.round(20 * knownTraceCount / input.traces.length);
  const competitivenessPoints = input.eligibility === 'INELIGIBLE' ? 0
    : input.officialScore.status === 'AVAILABLE'
    ? Math.round(15 * input.officialScore.total / Math.max(1, input.officialScore.max))
    : input.officialScore.status === 'NOT_APPLICABLE' ? 9 : 5;
  const breakdown: WanpanScore['breakdown'] = [
    { key: 'ELIGIBILITY', label: '신청 가능성', points: eligibilityPoints, max: 45, explanation: '공고 자격규칙 충족 상태를 반영합니다.' },
    { key: 'PRIORITY', label: '공급 단계', points: priorityPoints, max: 20, explanation: '공고의 우선순위 단계만 반영하며 공식 순위가 아닙니다.' },
    { key: 'INFORMATION_READINESS', label: '정보 준비도', points: informationPoints, max: 20, explanation: '판정에 필요한 입력의 확인 정도입니다.' },
    { key: 'OFFICIAL_COMPETITIVENESS', label: '공식 배점 참고', points: competitivenessPoints, max: 15, explanation: input.officialScore.status === 'NOT_APPLICABLE' ? '공식 배점이 없어 중립값을 사용합니다.' : '공식 배점이 확인된 경우에만 비율을 참고합니다.' },
  ];
  return {
    score: Math.min(100, breakdown.reduce((sum, item) => sum + item.points, 0)),
    max: 100,
    methodVersion: 'WANPAN_FIT_2026_10_V1',
    disclaimer: '완판e 적합도는 공고 간 비교를 위한 내부 지표이며 공식 청약 점수·당첨확률이 아닙니다.',
    breakdown,
  };
}
