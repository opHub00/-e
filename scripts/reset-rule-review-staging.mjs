// Staging-only rebuild of the review candidate layer. Never runs against production.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const environment = process.env.WANPANE_ENV?.trim().toLowerCase();
const url = process.env.SUPABASE_STAGING_URL?.trim();
const expected = process.env.SUPABASE_STAGING_PROJECT_REF?.trim().toLowerCase();
const production = process.env.SUPABASE_PRODUCTION_PROJECT_REF?.trim().toLowerCase();
const ref = (() => {
  try { return new URL(url).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1] ?? null; } catch { return null; }
})();

assert.equal(environment, 'staging', 'STAGING_ENV_REQUIRED');
assert.ok(expected && ref === expected, 'STAGING_PROJECT_REF_MISMATCH');
assert.ok(!production || ref !== production, 'PRODUCTION_PROJECT_FORBIDDEN');
assert.equal(process.env.RULE_REVIEW_STAGING_ALLOW_WRITE, 'true', 'STAGING_WRITE_OPT_IN_REQUIRED');
// Separate opt-in: this drops review decisions, so it must never ride along with a seed run.
assert.equal(process.env.RULE_REVIEW_STAGING_RESET, 'true', 'STAGING_RESET_OPT_IN_REQUIRED');

const key = process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY?.trim();
const ruleSetId = process.env.RULE_REVIEW_STAGING_RULE_SET_ID?.trim();
assert.ok(key && ruleSetId, 'STAGING_SERVICE_CREDENTIALS_REQUIRED');

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

/*
  The imported source stays untouched: announcement, document, rule set and the
  materialized rules are what the review layer is built from. The audit log is
  immutable by trigger and is deliberately kept, so previous review history
  survives the rebuild.
*/
const { data: reviews, error: readError } = await client
  .from('assessment_rule_reviews').select('id').eq('rule_set_id', ruleSetId);
if (readError) throw new Error(`STAGING_RESET_READ_FAILED:${readError.message}`);
const reviewIds = (reviews ?? []).map(row => row.id);

const removed = {};
if (reviewIds.length > 0) {
  const { error, count } = await client.from('assessment_rule_evidence_reviews')
    .delete({ count: 'exact' }).in('rule_review_id', reviewIds);
  if (error) throw new Error(`STAGING_RESET_FAILED:evidence:${error.message}`);
  removed.evidenceReviews = count ?? 0;
}
for (const table of ['assessment_rule_exception_reviews', 'assessment_rule_review_conflicts',
  'assessment_rule_review_unresolved', 'assessment_rule_reviews', 'assessment_rule_review_versions']) {
  const { error, count } = await client.from(table).delete({ count: 'exact' }).eq('rule_set_id', ruleSetId);
  if (error) throw new Error(`STAGING_RESET_FAILED:${table}:${error.message}`);
  removed[table] = count ?? 0;
}

const { count: sourceRules } = await client.from('assessment_rules')
  .select('id', { count: 'exact', head: true }).eq('rule_set_id', ruleSetId);
const { count: auditKept } = await client.from('assessment_rule_review_audit_log')
  .select('id', { count: 'exact', head: true }).eq('rule_set_id', ruleSetId);

console.log(JSON.stringify({
  ruleSetId,
  removed,
  sourceRulesKept: sourceRules ?? 0,
  auditEntriesKept: auditKept ?? 0,
  status: 'REVIEW_LAYER_CLEARED',
}));
