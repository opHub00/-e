import { buildFacts, validDate } from './facts.ts';
import type { AnnouncementRules, ApplicationAssessmentResult, AssessmentInput, ConditionResult, ConditionRule, Expression, Scalar, SupplyRule } from './types.ts';

type Evaluation = { value: boolean | null; inputs: Record<string, Scalar | null>; missing: string[] };
function evaluateExpression(expression: Expression, facts: Record<string, Scalar | undefined>, rules: AnnouncementRules): Evaluation {
  if ('all' in expression || 'any' in expression) {
    const all = 'all' in expression;
    const children = (all ? expression.all : expression.any).map(e => evaluateExpression(e, facts, rules));
    const decisive = children.filter(e => e.value === !all);
    const relevant = decisive.length ? decisive : children;
    return {
      value: decisive.length ? !all : children.some(e => e.value === null) ? null : all,
      inputs: Object.assign({}, ...relevant.map(e => e.inputs)),
      missing: decisive.length ? [] : relevant.flatMap(e => e.missing),
    };
  }
  const actual = facts[expression.fact];
  const parameter = typeof expression.value === 'object' ? expression.value.parameter : null;
  const expected = parameter ? rules.parameters[parameter] : expression.value as Scalar;
  const missing = [actual === undefined ? `input:${expression.fact}` : null,
    expected === undefined || expected === null ? `rule:${parameter}` : null].filter((v): v is string => v !== null);
  const inputs = { [expression.fact]: actual ?? null, ...(parameter ? { [`rule:${parameter}`]: expected as Scalar ?? null } : {}) };
  if (missing.length) return { value: null, missing, inputs };
  if (expression.op !== 'eq' && (typeof actual !== 'number' || typeof expected !== 'number')) return { value: null, inputs, missing: [`rule:${parameter ?? expression.fact}:type`] };
  const value = expression.op === 'eq' ? actual === expected : expression.op === 'gte' ? (actual as number) >= (expected as number) : (actual as number) <= (expected as number);
  return { value, inputs, missing: [] };
}

function condition(rule: ConditionRule, facts: Record<string, Scalar | undefined>, rules: AnnouncementRules): ConditionResult {
  const result = evaluateExpression(rule.expression, facts, rules);
  if (result.value === false && rule.onFailure === 'REVIEW') {
    result.value = null;
    result.missing.push(`review:${rule.id}`);
  }
  return { ruleId: rule.id, evidenceId: rule.evidence.id, label: rule.label, outcome: result.value === null ? 'UNKNOWN' : result.value ? 'PASS' : 'FAIL', inputs: result.inputs, missing: result.missing };
}

function evaluateSupply(rules: AnnouncementRules, input: AssessmentInput, supply: SupplyRule, listingId: string): ApplicationAssessmentResult {
  const facts = buildFacts(input, rules.announcementDate, rules.parameters['youth.workPeriodBasis'], rules.parameters);
  const base = supply.eligibility.map(r => condition(r, facts, rules));
  const allRules = [...supply.eligibility, ...supply.stages.flatMap(s => s.conditions)];
  const missing = base.flatMap(c => c.missing);
  if (!base.length) missing.push('rule:eligibility');
  const warnings: string[] = [];
  const bound = rules.listingId === listingId;
  // Legacy engineering fixtures keep their behavior without inventing official provenance.
  const sourceStatus = rules.sourceStatus ?? (rules.verification === 'REFERENCE_ONLY' ? 'REFERENCE' : undefined);
  const reviewed = sourceStatus ? sourceStatus !== 'REFERENCE' : rules.verification === 'VERIFIED';
  const verified = reviewed && validDate(rules.announcementDate ?? undefined) && bound;
  if (!verified) missing.push('rule:verifiedAnnouncement');
  if (!bound) warnings.push('선택한 공고와 판정 규칙이 일치하지 않아요. 다른 공고의 규칙을 적용할 수 없어요.');
  if (sourceStatus === 'REFERENCE') warnings.push('공고 원문과 기준표를 확인하기 전이에요. 실제 신청 가능 여부·단계·점수는 아직 확정할 수 없어요.');
  if (sourceStatus === 'DRAFT_SOURCE_VERIFIED') warnings.push('제공된 모집공고 검토본을 기준으로 계산한 예상 결과입니다. 최종 공고 게시 후 기준이 달라질 수 있습니다.');
  if (facts.overseasClear !== true) warnings.push('해외 체류 이력이 있거나 확인 전이면 연속거주기간을 별도로 확인해야 해요.');
  if (facts.exceptionsClear !== true) warnings.push('특례 적용 여부는 증빙과 공고 조항을 함께 확인해야 해요.');
  if (rules.parameters['exceptions.childbirthAfter'] && facts.childbirthClear !== true) warnings.push('출산가구 소득·자산 완화 및 태아·입양 인정은 추가 검수가 필요해요. 기본 기준만으로 탈락을 확정하지 않아요.');
  const regionalThreshold = rules.parameters['region.localMonths'];
  const regionalPriority: ApplicationAssessmentResult['regionalPriority'] = typeof regionalThreshold !== 'number' ? undefined
    : rules.parameters['region.underReview'] === true || typeof facts.residenceMonths !== 'number'
      ? { status:'NEEDS_REVIEW', label:'지역우선 배정은 검토본의 표2 수정 메모와 해외체류 기준 확인이 필요해요.' }
      : facts.residenceMonths >= regionalThreshold ? { status:'LOCAL', label:'해당지역 우선배정 대상' }
        : { status:'REMAINDER_ONLY', label:'기타지역: 해당지역 미달 물량이 있을 때 공급 대상' };
  if (regionalPriority) warnings.push(regionalPriority.label);
  for (const key of Object.keys(rules.parameters).filter(k => k.startsWith('warning.'))) {
    if (typeof rules.parameters[key] === 'string') warnings.push(rules.parameters[key] as string);
  }
  if (!rules.parameters['dates.calculatedNoHome'] && input.details.housingDisposalDates?.some(date => !validDate(date) || (input.details.noHomeSince && date > input.details.noHomeSince))) {
    missing.push('input:noHomeMonths');
    warnings.push('주택 처분일과 무주택 시작일을 다시 확인해 주세요.');
  }
  let status: ApplicationAssessmentResult['status'] = base.some(c => c.outcome === 'FAIL') ? 'INELIGIBLE' : base.some(c => c.outcome === 'UNKNOWN') ? 'NEEDS_MORE_INFORMATION' : 'ELIGIBLE';
  let selected: SupplyRule['stages'][number] | undefined;
  const stageConditions: ConditionResult[] = [];
  if (status === 'ELIGIBLE') {
    for (const stage of supply.stages) {
      const checks = stage.conditions.map(r => condition(r, facts, rules));
      stageConditions.push(...checks);
      if (checks.some(c => c.outcome === 'FAIL')) continue;
      if (checks.some(c => c.outcome === 'UNKNOWN')) { missing.push(...checks.flatMap(c => c.missing)); break; }
      selected = stage;
      break;
    }
    if (!selected) { status = 'NEEDS_MORE_INFORMATION'; missing.push('rule:stage'); }
  }
  let score: ApplicationAssessmentResult['score'];
  const noScoring = selected ? selected.scores === null : supply.stages.every(s => s.scores === null);
  let scoring: ApplicationAssessmentResult['scoring'] = noScoring ? 'NOT_APPLICABLE' : 'PENDING';
  if (selected?.scores) {
    if (!selected.scores.length) missing.push('rule:score:empty');
    const breakdown: NonNullable<ApplicationAssessmentResult['score']>['breakdown'] = [];
    for (const rule of selected.scores) {
      const actual = facts[rule.fact];
      const bands = rule.bands;
      const matches = typeof actual === 'number' ? bands?.filter(b => (b.min === undefined || actual >= b.min) && (b.max === undefined || actual <= b.max)) : [];
      if (typeof actual !== 'number') missing.push(`input:${rule.fact}`);
      if (!bands?.length || bands.some(b => !Number.isFinite(b.points) || b.points < 0) || (typeof actual === 'number' && matches?.length !== 1)) missing.push(`rule:score:${rule.id}`);
      if (typeof actual === 'number' && bands?.length && matches?.length === 1) breakdown.push({ ruleId: rule.id, evidenceId: rule.evidence.id, label: rule.label, input: actual, points: matches[0].points, max: Math.max(...bands.map(b => b.points)), appliedBand: { min: matches[0].min, max: matches[0].max } });
    }
    if (breakdown.length === selected.scores.length && !missing.some(m => m.startsWith('rule:score:'))) {
      score = { total: breakdown.reduce((sum, b) => sum + b.points, 0), max: breakdown.reduce((sum, b) => sum + b.max, 0), breakdown };
      scoring = 'AVAILABLE';
    }
  }
  if (!verified || missing.some(m => m.startsWith('review:')) || (status === 'ELIGIBLE' && missing.length)) status = 'NEEDS_MORE_INFORMATION';
  if (!verified || missing.includes('input:noHomeMonths')) { score = undefined; scoring = noScoring ? 'NOT_APPLICABLE' : 'PENDING'; }
  return {
    rulesId: rules.id, rulesVersion: rules.version, sourceStatus, provenance: rules.provenance, listingId, supplyType: supply.type, status,
    eligible: status === 'NEEDS_MORE_INFORMATION' ? null : status === 'ELIGIBLE',
    stage: verified ? selected?.stage ?? null : null, score, scoring, regionalPriority,
    stageExplanation: !verified ? '공고 기준이 확인되면 신청 가능한 공급단계를 구분할 수 있어요.'
      : !selected ? '기본 자격 또는 앞선 공급단계의 조건을 더 확인해야 해요.'
      : selected.stage === 'PRIORITY' ? '기본 자격과 우선공급 대상 조건을 충족했어요.'
      : selected.stage === 'GENERAL' ? '기본 자격은 충족하지만 우선공급 대상 조건에 해당하지 않아 일반공급 단계로 분류했어요.'
      : '기본 자격은 충족하지만 앞선 두 단계의 기준에 해당하지 않아 추첨공급 단계로 분류했어요.',
    inputDates: Object.fromEntries(Object.entries(input.details).filter(([key, value]) => typeof value === 'string' && (key.endsWith('Date') || key.endsWith('At') || key.endsWith('Since')))) as Record<string, string>,
    satisfiedConditions: base.filter(c => c.outcome === 'PASS'), failedConditions: base.filter(c => c.outcome === 'FAIL'), stageConditions,
    unknownConditions: base.filter(c => c.outcome === 'UNKNOWN'),
    warnings, requiredDocuments: [...new Set(allRules.flatMap(r => r.documents))],
    evidence: [...new Map([...allRules.map(r => r.evidence), ...supply.stages.flatMap(s => s.scores?.map(r => r.evidence) ?? [])].map(e => [e.id, e])).values()],
    missingInformation: [...new Set(missing)],
  };
}

/** Rules are trusted reviewed application data, never unvalidated AI output. */
export function assessApplication(rules: AnnouncementRules, input: AssessmentInput, listingId = rules.listingId): ApplicationAssessmentResult[] {
  return rules.supplies.map(supply => evaluateSupply(rules, input, supply, listingId));
}
