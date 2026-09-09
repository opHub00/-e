import { NEWLYWED_CHECK_LABELS, NEWLYWED_DISCLAIMER, NEWLYWED_RULE_METADATA, NEWLYWED_STATUS_LABELS, type NewlywedEligibilityResult, type NewlywedCheck, type NewlywedEligibilityStatus } from './newlywed.ts';

export type NewlywedAiContext = {
  feature: 'newlywed_private_v1'; status: NewlywedEligibilityStatus;
  checks: Array<Pick<NewlywedCheck, 'key' | 'label' | 'status' | 'reason' | 'sourceRefs'>>;
  missingInfo: string[]; actions: string[];
  ruleMetadata: { ruleSetVersion: string; effectiveDate: string; reviewedAt: string };
};
/** Explicit allow-list projection: no spread of result/profile, no identity, amounts or user prose. */
export function buildNewlywedAiContext(result: NewlywedEligibilityResult): NewlywedAiContext {
  return {
    feature: 'newlywed_private_v1', status: result.status,
    checks: result.checks.map(({ key, label, status, reason, sourceRefs }) => ({ key, label, status, reason, sourceRefs: [...sourceRefs] })),
    missingInfo: result.checks.filter(c => c.status === 'needs_information').map(c => c.key),
    actions: result.actions.map(a => a.label),
    ruleMetadata: { ruleSetVersion: result.metadata.ruleSetVersion, effectiveDate: result.metadata.effectiveDate, reviewedAt: result.metadata.reviewedAt },
  };
}
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).length === allowed.length && Object.keys(v).every(k => allowed.includes(k));
const string = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const strings = (v: unknown, count: number, max: number): v is string[] => Array.isArray(v) && v.length <= count && v.every(s => string(s, max));
const CHECK_KEYS = ['supported_scope', 'rule_date', 'marriage_status', 'marriage_period', 'household_housing', 'subscription_period', 'subscription_deposit', 'special_supply_restriction', 'income', 'real_estate', 'children_priority', 'residence', 'newlywed_allocation'];
export function isNewlywedAiContext(v: unknown): v is NewlywedAiContext {
  if (!record(v) || !keys(v, ['feature', 'status', 'checks', 'missingInfo', 'actions', 'ruleMetadata'])) return false;
  if (v.feature !== 'newlywed_private_v1' || !Object.hasOwn(NEWLYWED_STATUS_LABELS, String(v.status))) return false;
  if (!record(v.ruleMetadata) || !keys(v.ruleMetadata, ['ruleSetVersion', 'effectiveDate', 'reviewedAt'])) return false;
  if (v.ruleMetadata.ruleSetVersion !== NEWLYWED_RULE_METADATA.ruleSetVersion || v.ruleMetadata.effectiveDate !== NEWLYWED_RULE_METADATA.effectiveDate || v.ruleMetadata.reviewedAt !== NEWLYWED_RULE_METADATA.reviewedAt) return false;
  if (!strings(v.actions, 8, 100) || !strings(v.missingInfo, 12, 80)) return false;
  if (!Array.isArray(v.checks) || !v.checks.length || v.checks.length > 12) return false;
  if (!v.checks.every(c => record(c) && keys(c, ['key', 'label', 'status', 'reason', 'sourceRefs']) && CHECK_KEYS.includes(String(c.key)) && string(c.label, 100) && string(c.reason, 400) && Object.hasOwn(NEWLYWED_CHECK_LABELS, String(c.status)) && strings(c.sourceRefs, 4, 40) && c.sourceRefs.length > 0 && c.sourceRefs.every(id => NEWLYWED_RULE_METADATA.sources.some(s => s.id === id)))) return false;
  const checks = v.checks as NewlywedAiContext['checks'];
  if (new Set(checks.map(c => c.key)).size !== checks.length) return false;
  const missing = checks.filter(c => c.status === 'needs_information').map(c => c.key);
  if (JSON.stringify(missing) !== JSON.stringify(v.missingInfo)) return false;
  const status = checks.some(c => c.status === 'unsupported') ? 'unsupported' : checks.some(c => c.status === 'not_met') ? 'not_eligible' : missing.length ? 'needs_information' : checks.some(c => c.status === 'needs_listing_confirmation') ? 'needs_listing_confirmation' : 'likely_eligible';
  return status === v.status;
}
export type NewlywedAiSelection = { checkKeys: string[] };
/** Gemini can select existing reasons only. Any generated prose/status/score/probability is rejected. */
export function parseNewlywedAiSelection(value: unknown, context: NewlywedAiContext): NewlywedAiSelection | null {
  if (!record(value) || !keys(value, ['checkKeys']) || !strings(value.checkKeys, 3, 80) || !value.checkKeys.length) return null;
  if (new Set(value.checkKeys).size !== value.checkKeys.length || !value.checkKeys.every(k => context.checks.some(c => c.key === k))) return null;
  return { checkKeys: [...value.checkKeys] };
}
export function buildNewlywedExplanation(context: NewlywedAiContext, selection?: NewlywedAiSelection | null): string {
  const safe = parseNewlywedAiSelection(selection, context);
  // Preserve an unresolved/failing item regardless of what the model selects.
  const required = ['not_met', 'unsupported', 'needs_information', 'needs_listing_confirmation'].flatMap(status => context.checks.find(c => c.status === status)?.key ?? []);
  const selected = [...new Set([...required, ...(safe?.checkKeys ?? context.checks.slice(0, 2).map(c => c.key))])].slice(0, 5);
  return [NEWLYWED_STATUS_LABELS[context.status], ...selected.map(key => {
    const c = context.checks.find(c => c.key === key)!;
    return `${c.label} · ${NEWLYWED_CHECK_LABELS[c.status]}: ${c.reason}`;
  }), context.actions[0] ? `다음에는 ${context.actions[0]}부터 확인해 보세요.` : '', NEWLYWED_DISCLAIMER].filter(Boolean).join('\n\n');
}
