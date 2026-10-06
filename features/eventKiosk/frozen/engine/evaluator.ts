import type {
  Confidence,
  Eligibility,
  EvaluationResult,
  OfficialScore,
  Priority,
  RuleTrace,
} from '../domain/evaluation.ts';
import type {
  ConditionRule,
  Listing,
  OfficialScoreRule,
  PriorityTier,
  RulePackage,
  SupplyRuleSet,
} from '../domain/rules.ts';
import { evaluateExpression, type ExpressionResult } from './expression.ts';
import type { FactMap } from './facts.ts';
import { calculateWanpanScore } from './wanpanScore.ts';

type CandidateEvaluation = ExpressionResult & { explicitlyExcluded: boolean };

export function assessRulePackage(input: {
  listing: Listing;
  rulePackage: RulePackage;
  facts: FactMap;
  evaluatedAt: string;
}): EvaluationResult[] {
  const { listing, rulePackage, facts, evaluatedAt } = input;
  if (rulePackage.listingId !== listing.id) throw new Error(`Rule package ${rulePackage.id} is bound to another listing`);
  if (rulePackage.announcementDate !== listing.announcementDate) throw new Error(`Announcement date mismatch for ${listing.id}`);
  const results: EvaluationResult[] = [];
  for (const supply of rulePackage.supplies) {
    const candidate = supply.candidateWhen
      ? evaluateExpression(supply.candidateWhen, facts, rulePackage.parameters)
      : { value: true, inputs: {}, missingFacts: [] };
    results.push(evaluateSupply({
      listing,
      rulePackage,
      supply,
      facts,
      evaluatedAt,
      candidate: { ...candidate, explicitlyExcluded: candidate.value === false },
    }));
  }
  return results;
}

function evaluateSupply(input: {
  listing: Listing;
  rulePackage: RulePackage;
  supply: SupplyRuleSet;
  facts: FactMap;
  evaluatedAt: string;
  candidate: CandidateEvaluation;
}): EvaluationResult {
  const { listing, rulePackage, supply, facts, evaluatedAt, candidate } = input;
  const eligibilityTraces = supply.eligibility.map(rule => evaluateCondition(rule, facts, rulePackage));
  let eligibility = summarizeEligibility(eligibilityTraces);
  if (candidate.explicitlyExcluded) eligibility = 'INELIGIBLE';
  if (candidate.value === null && eligibility === 'ELIGIBLE') eligibility = 'NEEDS_MORE_INFORMATION';

  const priorityEvaluation = evaluatePriority(eligibility, supply, facts, rulePackage);
  if (priorityEvaluation.exhausted && supply.priorityExhaustion === 'INELIGIBLE') eligibility = 'INELIGIBLE';
  const allTraces = [...eligibilityTraces, ...priorityEvaluation.traces];
  const officialScore = evaluateOfficialScore(
    eligibility,
    priorityEvaluation.selectedTier,
    facts,
    supply,
  );
  const missingInformation = collectMissingInformation(
    candidate,
    allTraces,
    officialScore,
    supply,
  );
  const warnings = buildWarnings(rulePackage, eligibility, candidate);
  const matchedRules = allTraces.filter(trace => trace.outcome === 'PASS');
  const failedRules = allTraces.filter(trace => trace.outcome === 'FAIL' || trace.outcome === 'REVIEW');
  const priority = priorityEvaluation.priority;
  const evidenceIds = [...new Set([
    ...allTraces.map(trace => trace.evidenceId),
    ...(officialScore.status === 'AVAILABLE' ? officialScore.breakdown.map(item => item.evidenceId) : []),
  ])];
  const resultWithoutScore = {
    evaluationId: `${listing.id}:${supply.supplyType}`,
    listingId: listing.id,
    listingTitle: listing.title,
    rulePackageId: rulePackage.id,
    rulePackageVersion: rulePackage.version,
    sourceStatus: rulePackage.sourceStatus,
    supplyType: supply.supplyType,
    supplyLabel: supply.label,
    selectionMethod: supply.selectionMethod,
    eligibility,
    priority,
    officialScore,
    missingInformation,
    matchedRules,
    failedRules,
    warnings,
    confidence: calculateConfidence(rulePackage, eligibility, missingInformation, candidate),
    evidenceIds,
    evaluatedAt,
  } satisfies Omit<EvaluationResult, 'wanpanScore'>;
  return {
    ...resultWithoutScore,
    wanpanScore: calculateWanpanScore({ eligibility, priority, officialScore, traces: allTraces }),
  };
}

function evaluateCondition(rule: ConditionRule, facts: FactMap, rulePackage: RulePackage): RuleTrace {
  const result = evaluateExpression(rule.expression, facts, rulePackage.parameters);
  const outcome: RuleTrace['outcome'] = result.value === null
    ? 'UNKNOWN'
    : result.value ? 'PASS'
      : rule.onFailure === 'REVIEW_REQUIRED' ? 'REVIEW' : 'FAIL';
  return {
    ruleId: rule.id,
    label: rule.label,
    outcome,
    evidenceId: rule.evidenceId,
    inputs: result.inputs,
    missingFacts: result.missingFacts,
  };
}

function summarizeEligibility(traces: RuleTrace[]): Eligibility {
  if (traces.some(trace => trace.outcome === 'FAIL')) return 'INELIGIBLE';
  if (traces.some(trace => trace.outcome === 'REVIEW')) return 'REVIEW_REQUIRED';
  if (traces.some(trace => trace.outcome === 'UNKNOWN')) return 'NEEDS_MORE_INFORMATION';
  return 'ELIGIBLE';
}

function evaluatePriority(
  eligibility: Eligibility,
  supply: SupplyRuleSet,
  facts: FactMap,
  rulePackage: RulePackage,
): { priority: Priority; selectedTier?: PriorityTier; traces: RuleTrace[]; exhausted?: boolean } {
  if (eligibility !== 'ELIGIBLE') {
    return eligibility === 'INELIGIBLE'
      ? { priority: { status: 'NOT_APPLICABLE', reason: '기본 자격 미충족으로 공급 단계를 산정하지 않습니다.' }, traces: [] }
      : { priority: { status: 'PENDING', reason: '기본 자격 판정 완료 후 공급 단계를 산정합니다.' }, traces: [] };
  }
  if (supply.selectionMethod === 'LOTTERY' || supply.selectionMethod === 'QUALIFICATION_ONLY' || supply.priorityTiers.length === 0) {
    return { priority: { status: 'NOT_APPLICABLE', reason: supply.selectionMethod === 'LOTTERY' ? '이 공급은 추첨 방식입니다.' : '공식 순위제가 없는 공급입니다.' }, traces: [] };
  }
  const traces: RuleTrace[] = [];
  for (const tier of [...supply.priorityTiers].sort((left, right) => left.rank - right.rank)) {
    const tierTraces = tier.conditions.map(rule => evaluateCondition(rule, facts, rulePackage));
    traces.push(...tierTraces);
    if (tierTraces.some(trace => trace.outcome === 'UNKNOWN' || trace.outcome === 'REVIEW')) {
      return { priority: { status: 'PENDING', reason: `${tier.label} 판정 정보가 부족합니다.` }, traces };
    }
    if (tierTraces.some(trace => trace.outcome === 'FAIL')) continue;
    return { priority: { status: 'DETERMINED', rank: tier.rank, code: tier.code, label: tier.label }, selectedTier: tier, traces };
  }
  return { priority: { status: 'PENDING', reason: '적용할 공급 단계를 확정하지 못했습니다.' }, traces, exhausted: true };
}

function evaluateOfficialScore(
  eligibility: Eligibility,
  selectedTier: PriorityTier | undefined,
  facts: FactMap,
  supply: SupplyRuleSet,
): OfficialScore {
  const hasOfficialScore = supply.priorityTiers.some(tier => tier.officialScore !== null);
  if (!hasOfficialScore) {
    return { status: 'NOT_APPLICABLE', reason: '이 공급 단계에는 공식 배점표가 없습니다.' };
  }
  if (!selectedTier) {
    return { status: 'PENDING', reason: '공급 단계 확정 후 공식 점수를 계산합니다.', missingInformation: [] };
  }
  if (selectedTier.officialScore === null) return { status: 'NOT_APPLICABLE', reason: '선택된 공급 단계에는 공식 배점표가 없습니다.' };
  if (eligibility !== 'ELIGIBLE') {
    return { status: 'PENDING', reason: '자격 판정 완료 후 공식 점수를 계산합니다.', missingInformation: [] };
  }
  const breakdown: Extract<OfficialScore, { status: 'AVAILABLE' }>['breakdown'] = [];
  const missingInformation: string[] = [];
  for (const scoreRule of selectedTier.officialScore) {
    const item = scoreOfficialRule(scoreRule, facts);
    if (!item) missingInformation.push(scoreRule.fact);
    else breakdown.push(item);
  }
  if (missingInformation.length) {
    return { status: 'PENDING', reason: '공식 점수 계산에 필요한 정보가 부족합니다.', missingInformation };
  }
  return {
    status: 'AVAILABLE',
    total: breakdown.reduce((sum, item) => sum + item.points, 0),
    max: breakdown.reduce((sum, item) => sum + item.max, 0),
    breakdown,
  };
}

function scoreOfficialRule(
  rule: OfficialScoreRule,
  facts: FactMap,
): Extract<OfficialScore, { status: 'AVAILABLE' }>['breakdown'][number] | undefined {
  const actual = facts[rule.fact];
  if (typeof actual !== 'number') return undefined;
  const matching = rule.bands.filter(band => (band.min === undefined || actual >= band.min) && (band.max === undefined || actual <= band.max));
  if (matching.length !== 1) return undefined;
  const band = matching[0];
  if (!band) return undefined;
  return {
    ruleId: rule.id,
    label: rule.label,
    input: actual,
    points: band.points,
    max: Math.max(...rule.bands.map(item => item.points)),
    evidenceId: rule.evidenceId,
  };
}

function collectMissingInformation(
  candidate: CandidateEvaluation,
  traces: RuleTrace[],
  officialScore: OfficialScore,
  supply: SupplyRuleSet,
): string[] {
  const labels = new Map(supply.eligibility.flatMap(rule => [[rule.id, rule.missingInformationLabel] as const]));
  for (const tier of supply.priorityTiers) {
    for (const rule of tier.conditions) labels.set(rule.id, rule.missingInformationLabel);
  }
  return [...new Set([
    ...candidate.missingFacts,
    ...traces.filter(trace => trace.outcome === 'UNKNOWN').flatMap(trace => {
      const label = labels.get(trace.ruleId);
      return label ? [label] : trace.missingFacts;
    }),
    ...(officialScore.status === 'PENDING' ? officialScore.missingInformation : []),
  ])];
}

function buildWarnings(rulePackage: RulePackage, eligibility: Eligibility, candidate: CandidateEvaluation): string[] {
  const warnings: string[] = [];
  if (rulePackage.sourceStatus === 'DRAFT_SOURCE_VERIFIED') warnings.push('원문 출처는 확인했지만 공식 검수 완료 전인 규칙입니다.');
  if (rulePackage.reviewStatus !== 'APPROVED_FOR_EVENT') warnings.push('행사 승인 전 Rule Package이므로 기본 판정 대상으로 사용할 수 없습니다.');
  if (candidate.value === null) warnings.push('공급유형 후보를 확정하려면 가구 정보가 더 필요합니다.');
  if (eligibility === 'REVIEW_REQUIRED') warnings.push('자동 판정으로 확정할 수 없는 예외조건이 있어 원문 검토가 필요합니다.');
  return warnings;
}

function calculateConfidence(
  rulePackage: RulePackage,
  eligibility: Eligibility,
  missingInformation: string[],
  candidate: CandidateEvaluation,
): Confidence {
  let score = rulePackage.sourceStatus === 'OFFICIAL_VERIFIED' && rulePackage.reviewStatus === 'APPROVED_FOR_EVENT' ? 1 : 0.6;
  const reasons: string[] = [];
  if (rulePackage.sourceStatus !== 'OFFICIAL_VERIFIED' || rulePackage.reviewStatus !== 'APPROVED_FOR_EVENT') reasons.push('Rule Package가 행사 승인 완료 상태가 아닙니다.');
  if (missingInformation.length) {
    score -= Math.min(0.35, missingInformation.length * 0.08);
    reasons.push(`확인되지 않은 정보가 ${missingInformation.length}개 있습니다.`);
  }
  if (candidate.value === null) score -= 0.1;
  if (eligibility === 'REVIEW_REQUIRED') {
    score = Math.min(score, 0.45);
    reasons.push('예외조건의 수동 검토가 필요합니다.');
  }
  score = Math.max(0, Math.round(score * 100) / 100);
  return { level: score >= 0.85 ? 'HIGH' : score >= 0.6 ? 'MEDIUM' : 'LOW', score, reasons };
}
