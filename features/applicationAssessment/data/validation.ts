import { validDate } from '../facts.ts';
import type { ConditionRule, Evidence, Expression, Scalar, ScoreRule, RuleSourceStatus } from '../types.ts';

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object');
  return value as Record<string, unknown>;
}
export function string(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 20000) throw new Error('string');
  return value;
}
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 1000) throw new Error('array');
  return value;
}
export function scalar(value: unknown): Scalar {
  if (typeof value === 'boolean' || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) return value;
  throw new Error('scalar');
}
export function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('integer');
  return value;
}
export function date(value: unknown): string {
  if (typeof value !== 'string' || !validDate(value)) throw new Error('date');
  return value;
}
export function sourceStatus(value: unknown): RuleSourceStatus {
  if (value !== 'REFERENCE' && value !== 'DRAFT_SOURCE_VERIFIED' && value !== 'OFFICIAL_VERIFIED') throw new Error('sourceStatus');
  return value;
}
export const uuid = (value: unknown): string => {
  const v = string(value);
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v)) throw new Error('uuid');
  return v;
};
const facts = new Set(('age maritalStatus familyCategory marriageMonths hasChildren minorChildren youngestChildMonths noHome neverOwned householdNoHome householdNeverOwned noSpecialRestriction noSpecialSupplyHistory noReWinningRestriction hasAccount accountMonths recognizedPaymentCount recognizedDepositAmount residence residenceMonths overseasClear noHomeMonths monthlyIncome householdIncome dualIncome totalAssets parentAssets workMonths incomeTaxPaymentYears workOrBusinessIncome youthPriorityTarget newlywedPriorityTarget workOrTaxMonths exceptionsClear').split(' '));
const fact = (value: unknown): string => { const key = string(value); if (!facts.has(key)) throw new Error('unsupported fact'); return key; };
function expression(value: unknown, parameters: Record<string, Scalar | null>, depth = 0): Expression {
  if (depth > 12) throw new Error('expression depth');
  const v = object(value);
  if ('all' in v || 'any' in v) {
    if (Object.keys(v).length !== 1) throw new Error('ambiguous expression');
    const key = 'all' in v ? 'all' : 'any';
    const children = array(v[key]);
    if (!children.length) throw new Error('empty expression');
    return { [key]: children.map(c => expression(c, parameters, depth + 1)) } as Expression;
  }
  if (Object.keys(v).sort().join() !== 'fact,op,value' || !['eq', 'gte', 'lte'].includes(String(v.op))) throw new Error('operator');
  let expected: Scalar | { parameter: string };
  if (typeof v.value === 'object' && v.value !== null) {
    const p = object(v.value); const key = string(p.parameter);
    if (Object.keys(p).length !== 1 || !Object.hasOwn(parameters, key)) throw new Error('parameter');
    expected = { parameter: key };
  } else expected = scalar(v.value);
  const resolved = typeof expected === 'object' ? parameters[expected.parameter] : expected;
  if (v.op !== 'eq' && resolved !== null && typeof resolved !== 'number') throw new Error('numeric operand');
  return { fact: fact(v.fact), op: v.op as 'eq' | 'gte' | 'lte', value: expected };
}
export function evidence(value: unknown, documentId: string | null): Evidence {
  const v = object(value);
  if (v.document_id !== documentId) throw new Error('evidence document mismatch');
  const page = v.page_number == null ? undefined : integer(v.page_number);
  if (page === 0) throw new Error('page');
  const url = v.source_url == null ? undefined : string(v.source_url);
  if (url && !/^https?:\/\//.test(url)) throw new Error('url');
  return { id: string(v.evidence_key), source: string(v.source), section: string(v.section), label: string(v.evidence_label),
    ...(documentId ? { documentId } : {}), ...(page ? { page } : {}), ...(url ? { url } : {}),
    ...(v.table_label == null ? {} : { tableLabel: string(v.table_label) }),
    ...(v.text_excerpt == null ? {} : { textExcerpt: string(v.text_excerpt) }),
    ...(v.locator == null || Object.keys(object(v.locator)).length === 0 ? {} : { locator: object(v.locator) }) };
}
export function condition(key: string, config: unknown, ev: Evidence, params: Record<string, Scalar | null>): ConditionRule {
  const c = object(config);
  if (Object.keys(c).some(k => !['label', 'expression', 'documents', 'onFailure'].includes(k))) throw new Error('unknown condition config');
  if (c.onFailure !== undefined && c.onFailure !== 'REVIEW') throw new Error('onFailure');
  return { id: key, label: string(c.label), expression: expression(c.expression, params), documents: array(c.documents).map(string), evidence: ev,
    ...(c.onFailure === 'REVIEW' ? { onFailure: 'REVIEW' as const } : {}) };
}
export function score(key: string, config: unknown, ev: Evidence): ScoreRule {
  const c = object(config);
  if (Object.keys(c).some(k => !['label', 'fact', 'bands'].includes(k))) throw new Error('unknown score config');
  const bands = c.bands === null ? null : array(c.bands).map(raw => {
    const b = object(raw);
    if (Object.keys(b).some(k => !['min', 'max', 'points'].includes(k))) throw new Error('unknown band config');
    const min = b.min === undefined ? undefined : scalar(b.min);
    const max = b.max === undefined ? undefined : scalar(b.max);
    if ((min !== undefined && typeof min !== 'number') || (max !== undefined && typeof max !== 'number')) throw new Error('band bounds');
    if (min !== undefined && max !== undefined && min > max) throw new Error('band order');
    return { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }), points: integer(b.points) };
  });
  if (bands && (!bands.length || bands.some((b, i) => bands.some((other, j) => i < j && (b.min ?? -Infinity) <= (other.max ?? Infinity) && (other.min ?? -Infinity) <= (b.max ?? Infinity))))) throw new Error('empty or overlapping bands');
  return { id: key, label: string(c.label), fact: fact(c.fact), bands, evidence: ev };
}
