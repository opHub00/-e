import type { Expression, FactValue, Scalar } from '../domain/rules.ts';
import type { FactMap } from './facts.ts';

export type ExpressionResult = {
  value: boolean | null;
  inputs: Record<string, FactValue | null>;
  missingFacts: string[];
};

export function evaluateExpression(
  expression: Expression,
  facts: FactMap,
  parameters: Record<string, Scalar | null>,
): ExpressionResult {
  if ('all' in expression) return combine(expression.all, facts, parameters, 'ALL');
  if ('any' in expression) return combine(expression.any, facts, parameters, 'ANY');
  if ('not' in expression) {
    const result = evaluateExpression(expression.not, facts, parameters);
    return { ...result, value: result.value === null ? null : !result.value };
  }

  const actual = facts[expression.fact];
  if (expression.op === 'EXISTS') {
    return { value: actual !== undefined, inputs: { [expression.fact]: actual ?? null }, missingFacts: [] };
  }
  const parameter = expression.value && !Array.isArray(expression.value) && typeof expression.value === 'object' && 'parameter' in expression.value
    ? expression.value.parameter
    : undefined;
  const expected = parameter ? parameters[parameter] : expression.value as FactValue | undefined;
  const missingFacts = [
    actual === undefined ? expression.fact : undefined,
    expected === undefined || expected === null ? `rule:${parameter ?? expression.fact}` : undefined,
  ].filter((value): value is string => value !== undefined);
  const inputs: Record<string, FactValue | null> = {
    [expression.fact]: actual ?? null,
    ...(parameter ? { [`rule:${parameter}`]: expected as FactValue ?? null } : {}),
  };
  if (missingFacts.length) return { value: null, inputs, missingFacts };
  const knownActual = actual as FactValue;
  const knownExpected = expected as FactValue;

  let value: boolean;
  switch (expression.op) {
    case 'EQ': value = knownActual === knownExpected; break;
    case 'NEQ': value = knownActual !== knownExpected; break;
    case 'GTE': value = comparable(knownActual, knownExpected, (left, right) => left >= right); break;
    case 'LTE': value = comparable(knownActual, knownExpected, (left, right) => left <= right); break;
    case 'IN': value = Array.isArray(knownExpected) && !Array.isArray(knownActual) && knownExpected.includes(knownActual); break;
    case 'CONTAINS': value = Array.isArray(knownActual) && !Array.isArray(knownExpected) && knownActual.includes(knownExpected); break;
    default: throw new Error(`Unsupported expression operator: ${String(expression.op)}`);
  }
  return { value, inputs, missingFacts: [] };
}

function combine(
  expressions: Expression[],
  facts: FactMap,
  parameters: Record<string, Scalar | null>,
  mode: 'ALL' | 'ANY',
): ExpressionResult {
  if (expressions.length === 0) return { value: mode === 'ALL', inputs: {}, missingFacts: [] };
  const results = expressions.map(expression => evaluateExpression(expression, facts, parameters));
  const hasDecisive = mode === 'ALL'
    ? results.some(result => result.value === false)
    : results.some(result => result.value === true);
  const value = hasDecisive
    ? mode === 'ANY'
    : results.some(result => result.value === null) ? null : mode === 'ALL';
  const relevant = hasDecisive
    ? results.filter(result => result.value === (mode === 'ANY'))
    : results;
  return {
    value,
    inputs: Object.assign({}, ...relevant.map(result => result.inputs)) as Record<string, FactValue | null>,
    missingFacts: hasDecisive ? [] : [...new Set(relevant.flatMap(result => result.missingFacts))],
  };
}

function comparable(actual: FactValue, expected: FactValue, operation: (left: number, right: number) => boolean): boolean {
  if (typeof actual !== 'number' || typeof expected !== 'number') {
    throw new Error('GTE/LTE require numeric facts and values');
  }
  return operation(actual, expected);
}
