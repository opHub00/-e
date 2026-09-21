import assert from 'node:assert/strict';
import { guardImportTarget, projectRefFromSupabaseHost } from './importTarget.ts';

const STAGING = 'krkeiytshxpqojrlrmsx';
const PRODUCTION = 'ypdreeipoxcztbxtiklt';
const stagingUrl = `https://${STAGING}.supabase.co`;
const productionUrl = `https://${PRODUCTION}.supabase.co`;
let checks = 0;
const check = (fn: () => void) => { fn(); checks += 1; };

/*
  A linked CLI project says what is being worked on, not which project is
  production. These cases pin that separation: the guard only ever sees declared
  production refs, so linking the CLI to staging cannot block a staging import.
*/

// A. CLI linked to staging: staging import is allowed.
check(() => {
  assert.equal(guardImportTarget(stagingUrl, 'staging', STAGING, [PRODUCTION]), stagingUrl);
});

// B. Target resolves to the production project: refused.
check(() => {
  assert.throws(() => guardImportTarget(productionUrl, 'staging', PRODUCTION, [PRODUCTION]), /Production target is forbidden/);
});

// C. staging ref equals production ref: refused even though the URL matches.
check(() => {
  assert.throws(() => guardImportTarget(productionUrl, 'staging', PRODUCTION, [PRODUCTION]), /Production target is forbidden/);
  assert.throws(() => guardImportTarget(stagingUrl, 'staging', STAGING, [STAGING]), /Production target is forbidden/);
});

// D. Production identity undeclared: fail closed instead of assuming safety.
check(() => {
  assert.throws(() => guardImportTarget(stagingUrl, 'staging', STAGING, []), /Production identity must be declared/);
});

// staging ref must match the target host.
check(() => {
  assert.throws(() => guardImportTarget(stagingUrl, 'staging', 'someotherref', [PRODUCTION]), /explicit matching project reference/);
});

// local stays loopback-only and needs no declared production identity.
check(() => {
  assert.equal(guardImportTarget('http://127.0.0.1:54321/', 'local', undefined, []), 'http://127.0.0.1:54321');
  assert.throws(() => guardImportTarget(stagingUrl, 'local', STAGING, [PRODUCTION]), /loopback/);
});

// A bare origin is still required, and an unknown environment is refused.
check(() => {
  assert.throws(() => guardImportTarget(`${stagingUrl}/rest/v1`, 'staging', STAGING, [PRODUCTION]), /bare Supabase origin/);
  assert.throws(() => guardImportTarget(stagingUrl, 'production', STAGING, [PRODUCTION]), /must be local or staging/);
});

check(() => {
  assert.equal(projectRefFromSupabaseHost(`${STAGING}.supabase.co`), STAGING);
  assert.equal(projectRefFromSupabaseHost('example.com'), null);
});

console.log(`features/applicationAssessment/importTarget: ${checks}개 검증 통과`);
