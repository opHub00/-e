import assert from 'node:assert/strict';

const environment = process.env.WANPANE_ENV?.trim().toLowerCase();
const url = process.env.SUPABASE_STAGING_URL?.trim();
const expected = process.env.SUPABASE_STAGING_PROJECT_REF?.trim().toLowerCase();
const production = process.env.SUPABASE_PRODUCTION_PROJECT_REF?.trim().toLowerCase();
const ref = (() => { try { return new URL(url).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1] ?? null; } catch { return null; } })();
assert.equal(environment, 'staging', 'STAGING_ENV_REQUIRED');
assert.ok(expected && ref === expected, 'STAGING_PROJECT_REF_MISMATCH');
assert.ok(!production || ref !== production, 'PRODUCTION_PROJECT_FORBIDDEN');

if (process.argv.includes('--preflight')) {
  console.log(`Rule Review staging target verified: ${ref} (no write performed)`);
  process.exit(0);
}

const anon = process.env.SUPABASE_STAGING_ANON_KEY?.trim();
const accessToken = process.env.RULE_REVIEW_STAGING_ACCESS_TOKEN?.trim();
const ruleSetId = process.env.RULE_REVIEW_STAGING_RULE_SET_ID?.trim();
assert.ok(anon && accessToken && ruleSetId, 'STAGING_INTEGRATION_CREDENTIALS_REQUIRED');
const headers = { apikey: anon, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
const call = async (name, body = {}) => {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) throw new Error(`STAGING_RPC_FAILED:${name}:${response.status}:${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
};
const access = await call('get_assessment_review_access');
assert.ok(access?.role === 'reviewer' || access?.role === 'admin', 'REVIEW_ROLE_REQUIRED');
const workspace = await call('load_assessment_rule_review_workspace', { p_rule_set_id: ruleSetId });
assert.equal(workspace.ruleVersionId, ruleSetId);
console.log(`Rule Review staging read contract passed: role=${access.role}, revision=${workspace.revision} (no write performed)`);
