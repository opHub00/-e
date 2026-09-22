// CLI guard and dry-run tests. Every child process runs with fetch replaced by a thrower, so a
// passing dry-run proves nothing was contacted. No credential is used: the only keys below are fakes.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const STAGING = 'krkeiytshxpqojrlrmsx', PRODUCTION = 'ypdreeipoxcztbxtiklt';
const GODEOK = 'd96c7afc-e10c-43cd-815f-97e401fc318f', SAMDO = 'bade0617-63c6-4f61-86bf-6cd5ae17a101';
const GODEOK_PACKAGE = 'data/assessment-rules/lh-godeok-a65bl-2026000438.json';
const GODEOK_ANNOTATIONS = 'data/assessment-rules/lh-godeok-a65bl-2026000438.review-annotations.json';
const NO_NETWORK = "data:text/javascript,globalThis.fetch=()=>{throw new Error('NETWORK_BLOCKED_IN_TEST')}";
const fakeJwt = claims => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const production = {
  ASSESSMENT_IMPORT_ENV: 'production', ASSESSMENT_IMPORT_URL: `https://${PRODUCTION}.supabase.co`,
  ASSESSMENT_PRODUCTION_PROJECT_REF: PRODUCTION, ASSESSMENT_STAGING_PROJECT_REF: STAGING,
};
const confirm = (command, subject) => ['--confirm', `${command}:${PRODUCTION}:${subject}`];

function cli(args, env = {}) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ASSESSMENT_|SUPABASE_)/.test(k)));
  const run = spawnSync(process.execPath, ['--import', NO_NETWORK, '--experimental-strip-types', '--no-warnings', 'scripts/assessment-rules.mjs', ...args],
    { env: { ...clean, ...env }, encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}
const dryRun = (args, env = production) => {
  const run = cli([...args, '--dry-run'], env);
  assert.equal(run.code, 0, run.err);
  const plan = JSON.parse(run.out);
  assert.equal(plan.contacted, false);
  return plan;
};
const refused = (args, env, pattern) => {
  const run = cli(args, env);
  assert.notEqual(run.code, 0);
  assert.match(run.err, pattern);
  assert.doesNotMatch(run.err, /NETWORK_BLOCKED_IN_TEST/, 'refused before any network call');
};

test('production dry-run covers every step with its own confirmation and contacts nothing', () => {
  const imported = dryRun(['import', GODEOK_PACKAGE, ...confirm('import', GODEOK)]);
  assert.equal(imported.projectRef, PRODUCTION);
  assert.equal(imported.confirmation, 'VALID');
  assert.equal(imported.sourceStatus, 'OFFICIAL_VERIFIED');
  assert.match(imported.serviceCredential, /ABSENT/);
  const opened = dryRun(['open-review', GODEOK, '--package', GODEOK_PACKAGE, '--annotations', GODEOK_ANNOTATIONS, ...confirm('open-review', GODEOK)]);
  assert.match(opened.plannedCalls[0], /seed_assessment_rule_review \(\d+ rules; fails if a review already exists\)/);
  dryRun(['review', GODEOK, '--out', 'unused.json', ...confirm('review', GODEOK)]);
  dryRun(['approve', GODEOK, '--fingerprint', 'a'.repeat(32), '--reviewer', 'operator', ...confirm('approve', GODEOK)]);
  const activated = dryRun(['activate', GODEOK, '--expected-active', 'none', ...confirm('activate', GODEOK)]);
  assert.match(activated.plannedCalls[0], /review gate/);
  const bootstrap = dryRun(['bootstrap-admin', 'ops@example.test', '--reason', 'first production admin', ...confirm('bootstrap-admin', 'ops@example.test')]);
  assert.match(bootstrap.plannedCalls[0], /fails if an enabled admin exists/);
});

test('production refuses a missing, reused or mistyped confirmation', () => {
  refused(['import', GODEOK_PACKAGE, '--dry-run'], production, /PRODUCTION_CONFIRMATION_REQUIRED/);
  refused(['import', GODEOK_PACKAGE, '--dry-run', ...confirm('activate', GODEOK)], production, /PRODUCTION_CONFIRMATION_REQUIRED/);
  refused(['import', GODEOK_PACKAGE, '--dry-run', ...confirm('import', SAMDO)], production, /PRODUCTION_CONFIRMATION_REQUIRED/);
  refused(['import', GODEOK_PACKAGE, '--dry-run', '--confirm', `import:${STAGING}:${GODEOK}`], production, /PRODUCTION_CONFIRMATION_REQUIRED/);
  refused(['activate', GODEOK, '--expected-active', 'none'], production, /PRODUCTION_CONFIRMATION_REQUIRED/);
});

test('production identity is explicit and separate from staging', () => {
  const importArgs = ['import', GODEOK_PACKAGE, '--dry-run', ...confirm('import', GODEOK)];
  refused(importArgs, { ...production, ASSESSMENT_PRODUCTION_PROJECT_REF: '' }, /PRODUCTION_PROJECT_REF_REQUIRED/);
  refused(importArgs, { ...production, ASSESSMENT_STAGING_PROJECT_REF: '' }, /STAGING_PROJECT_REF_REQUIRED_FOR_PRODUCTION/);
  refused(importArgs, { ...production, ASSESSMENT_STAGING_PROJECT_REF: PRODUCTION }, /PRODUCTION_REF_EQUALS_STAGING/);
  refused(importArgs, { ...production, ASSESSMENT_IMPORT_URL: `https://${STAGING}.supabase.co` }, /PRODUCTION_URL_REF_MISMATCH/);
  refused(importArgs, { ...production, SUPABASE_PRODUCTION_PROJECT_REF: STAGING }, /STAGING_DECLARED_AS_PRODUCTION/);
  refused(importArgs, { ...production, SUPABASE_PRODUCTION_PROJECT_REF: 'b'.repeat(20) }, /PRODUCTION_IDENTITY_CONFLICT/);
});

test('a credential for another project or role is refused before any call', () => {
  const importArgs = ['import', GODEOK_PACKAGE, ...confirm('import', GODEOK)];
  refused(importArgs, { ...production, ASSESSMENT_SERVICE_ROLE_KEY: fakeJwt({ role: 'service_role', ref: STAGING }) }, /CREDENTIAL_PROJECT_MISMATCH/);
  refused(importArgs, { ...production, ASSESSMENT_SERVICE_ROLE_KEY: fakeJwt({ role: 'anon', ref: PRODUCTION }) }, /SERVICE_ROLE_CREDENTIAL_REQUIRED/);
  const run = cli(importArgs, { ...production, ASSESSMENT_SERVICE_ROLE_KEY: fakeJwt({ role: 'service_role', ref: STAGING }) });
  assert.doesNotMatch(run.err + run.out, /eyJ|h\.[A-Za-z0-9_-]{10,}\.s/, 'credential never printed');
});

test('destructive commands do not exist, and local/staging still refuse production', () => {
  for (const command of ['reset', 'reseed', 'delete', 'purge']) refused([command, GODEOK, '--dry-run'], production, /DESTRUCTIVE_OPERATION_FORBIDDEN/);
  const staging = { ASSESSMENT_IMPORT_ENV: 'staging', ASSESSMENT_IMPORT_URL: `https://${PRODUCTION}.supabase.co`, ASSESSMENT_STAGING_PROJECT_REF: PRODUCTION, SUPABASE_PRODUCTION_PROJECT_REF: PRODUCTION };
  refused(['import', GODEOK_PACKAGE, '--dry-run'], staging, /Production target is forbidden/);
  const stagingOk = { ...staging, ASSESSMENT_IMPORT_URL: `https://${STAGING}.supabase.co`, ASSESSMENT_STAGING_PROJECT_REF: STAGING };
  refused(['import', GODEOK_PACKAGE, '--dry-run', ...confirm('import', GODEOK)], stagingOk, /--confirm and --allow-draft-source are only used for production/);
  const stagingPlan = dryRun(['import', GODEOK_PACKAGE], stagingOk);
  assert.equal(stagingPlan.confirmation, 'NOT_REQUIRED');
});

test('local inputs are checked before the target', () => {
  refused(['upload', GODEOK_PACKAGE, '--document', GODEOK_ANNOTATIONS, '--dry-run', ...confirm('upload', GODEOK)], production, /SHA-256 does not match/);
  refused(['open-review', SAMDO, '--package', GODEOK_PACKAGE, '--annotations', GODEOK_ANNOTATIONS, '--dry-run', ...confirm('open-review', SAMDO)], production, /REVIEW_PACKAGE_RULE_SET_MISMATCH/);
  refused(['approve', GODEOK, '--fingerprint', 'short', '--reviewer', 'x', '--dry-run', ...confirm('approve', GODEOK)], production, /fingerprint/);
  refused(['bootstrap-admin', 'not-an-email', '--reason', 'first admin', '--dry-run'], production, /e-mail/);
});

test('staging seed and reset scripts refuse production, even with their write opt-ins', () => {
  const run = (script, env) => spawnSync(process.execPath, ['--import', NO_NETWORK, '--experimental-strip-types', '--no-warnings', script,
    '--package', GODEOK_PACKAGE, '--annotations', GODEOK_ANNOTATIONS], {
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, RULE_REVIEW_STAGING_ALLOW_WRITE: 'true', RULE_REVIEW_STAGING_RESET: 'true', ...env }, encoding: 'utf8' });
  const productionEnv = { WANPANE_ENV: 'production', SUPABASE_STAGING_URL: `https://${PRODUCTION}.supabase.co`, SUPABASE_STAGING_PROJECT_REF: PRODUCTION, SUPABASE_PRODUCTION_PROJECT_REF: PRODUCTION };
  const disguised = { ...productionEnv, WANPANE_ENV: 'staging' };
  for (const script of ['scripts/seed-rule-review-staging.mjs', 'scripts/reset-rule-review-staging.mjs']) {
    const asProduction = run(script, productionEnv);
    assert.notEqual(asProduction.status, 0); assert.match(asProduction.stderr, /STAGING_ENV_REQUIRED/);
    const asStaging = run(script, disguised);
    assert.notEqual(asStaging.status, 0); assert.match(asStaging.stderr, /PRODUCTION_PROJECT_FORBIDDEN/);
    assert.doesNotMatch(asProduction.stderr + asStaging.stderr, /NETWORK_BLOCKED_IN_TEST/);
  }
});

test('a draft-based package needs a separate decision before production import', () => {
  const SAMDO_PACKAGE = 'data/assessment-rules/samdo-2026-v1.7.json';
  refused(['import', SAMDO_PACKAGE, '--dry-run', ...confirm('import', SAMDO)], production, /PRODUCTION_SOURCE_NOT_OFFICIAL:DRAFT_SOURCE_VERIFIED/);
  refused(['import', SAMDO_PACKAGE, '--dry-run', ...confirm('import', SAMDO), '--allow-draft-source', GODEOK], production, /PRODUCTION_SOURCE_NOT_OFFICIAL/);
  const decided = dryRun(['import', SAMDO_PACKAGE, ...confirm('import', SAMDO), '--allow-draft-source', SAMDO]);
  assert.equal(decided.sourceStatus, 'DRAFT_SOURCE_VERIFIED', 'the status itself is never promoted');
  assert.equal(decided.draftSourceDecision, 'EXPLICIT_ALLOW');
  assert.equal(dryRun(['import', GODEOK_PACKAGE, ...confirm('import', GODEOK)]).sourceStatus, 'OFFICIAL_VERIFIED');
});
