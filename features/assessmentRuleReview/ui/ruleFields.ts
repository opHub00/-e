import { koreanMoneyHint } from '../../applicationAssessment/form.ts';
import type { CriticalCategory, ReviewableRuleSnapshot } from '../server/types.ts';

/**
 * How a rule's stored value should be edited.
 *
 * The console never shows a JSON textarea: a reviewer correcting an income ceiling
 * should type a number in won and see "3억 6,200만원" back, not edit a literal. The
 * kind is derived from the rule category, and anything unrecognised stays read-only
 * rather than being guessed at.
 */
export type ValueKind = 'MONEY' | 'AGE_RANGE' | 'COUNT' | 'PERCENT' | 'DURATION_YEARS' | 'TEXT' | 'BOOLEAN' | 'UNSUPPORTED';

const KIND_BY_CATEGORY: Partial<Record<CriticalCategory, ValueKind>> = {
  INCOME: 'MONEY', ASSET: 'MONEY', SAVINGS: 'MONEY',
  AGE: 'AGE_RANGE', SUBSCRIPTION: 'COUNT', TAX: 'DURATION_YEARS',
  SCORE: 'COUNT', SCOPE: 'TEXT', HOUSING: 'BOOLEAN', EXCEPTION: 'BOOLEAN', STAGE: 'TEXT',
};

export type RangeClause = { fact: string; op: string; value: number };
const isRange = (value: unknown): value is RangeClause[] =>
  Array.isArray(value) && value.length > 0 && value.every(item => !!item && typeof item === 'object' && 'op' in item && 'value' in item);

export function valueKindOf(snapshot: ReviewableRuleSnapshot): ValueKind {
  if (isRange(snapshot.value)) return 'AGE_RANGE';
  const kind = KIND_BY_CATEGORY[snapshot.category];
  if (!kind) return 'UNSUPPORTED';
  if (kind === 'BOOLEAN' && typeof snapshot.value !== 'boolean') return 'UNSUPPORTED';
  if (kind === 'TEXT' && typeof snapshot.value !== 'string') return 'UNSUPPORTED';
  if ((kind === 'MONEY' || kind === 'COUNT' || kind === 'PERCENT' || kind === 'DURATION_YEARS') && typeof snapshot.value !== 'number') return 'UNSUPPORTED';
  return kind;
}

export const UNIT_SUFFIX: Record<ValueKind, string> = {
  MONEY: '원', AGE_RANGE: '세', COUNT: '회', PERCENT: '%', DURATION_YEARS: '년', TEXT: '', BOOLEAN: '', UNSUPPORTED: '',
};

export const OPERATOR_TEXT: Record<string, string> = { gte: '이상', lte: '이하', gt: '초과', lt: '미만', eq: '=' };
export const OPERATOR_CHOICES = ['gte', 'lte', 'gt', 'lt', 'eq'] as const;
export const SCOPE_CHOICES = ['APPLICANT', 'HOUSEHOLD', 'SPOUSE', 'PARENT'] as const;
export const STAGE_CHOICES = [null, 'PRIORITY', 'GENERAL', 'LOTTERY'] as const;
export const SCOPE_TEXT: Record<string, string> = { APPLICANT: '본인', HOUSEHOLD: '세대', SPOUSE: '배우자', PARENT: '부모' };
export const STAGE_TEXT: Record<string, string> = { PRIORITY: '우선공급', GENERAL: '일반공급', LOTTERY: '추첨공급' };

/** A number the reviewer typed, plus the human-readable echo shown under the field. */
export function numberHint(kind: ValueKind, raw: string): string | null {
  if (kind === 'MONEY') return koreanMoneyHint(raw);
  const parsed = Number(raw.replaceAll(',', ''));
  if (!raw.trim() || !Number.isFinite(parsed)) return null;
  return `${parsed.toLocaleString('ko-KR')}${UNIT_SUFFIX[kind]}`;
}

export const parseNumber = (raw: string): number | null => {
  const text = raw.trim();
  if (!/^\d+(,\d{3})*(\.\d+)?$/.test(text)) return null;
  const parsed = Number(text.replaceAll(',', ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

/** Reads a stored condition as a sentence, so a wrong bound is visible at a glance. */
export function conditionText(operator: string | null, value: unknown): string {
  const literal = (input: unknown) => input === null || input === undefined ? '—' : typeof input === 'object' ? JSON.stringify(input) : String(input);
  const clause = (op: unknown, raw: unknown) =>
    typeof op === 'string' && OPERATOR_TEXT[op] ? `${literal(raw)} ${OPERATOR_TEXT[op]}` : `${literal(op)} ${literal(raw)}`;
  if (isRange(value)) return value.map(item => clause(item.op, item.value)).join(' 그리고 ');
  if (operator && OPERATOR_TEXT[operator]) return clause(operator, value);
  return `${operator ? `${operator} ` : ''}${literal(value)}`;
}

export type FieldLabel = '조건' | '적용 대상' | '공급단계' | '배점';
/** Human wording for one changed path, used by the edit preview and the saved diff. */
export function describeChange(path: string, before: unknown, after: unknown): { label: string; before: string; after: string } {
  const show = (value: unknown) => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? '예' : '아니요';
    if (typeof value === 'object') return conditionText(null, value);
    const text = String(value);
    return SCOPE_TEXT[text] ?? STAGE_TEXT[text] ?? OPERATOR_TEXT[text] ?? text;
  };
  const label = path === 'value' ? '조건 값' : path === 'operator' ? '비교 방식'
    : path === 'scope' ? '적용 대상' : path === 'stage' ? '공급단계'
    : path === 'score' ? '배점' : path === 'maxScore' ? '배점 만점' : path;
  return { label, before: show(before), after: show(after) };
}
