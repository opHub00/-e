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

// URL 형태로 선언된 production 도 ref 형태와 똑같이 막아야 한다.
check(() => {
  assert.throws(() => guardImportTarget(productionUrl, 'staging', PRODUCTION, [productionUrl]), /Production target is forbidden/);
  assert.throws(() => guardImportTarget(stagingUrl, 'staging', STAGING, [stagingUrl]), /Production target is forbidden/);
  assert.equal(guardImportTarget(stagingUrl, 'staging', STAGING, [productionUrl]), stagingUrl);
});

console.log(`features/applicationAssessment/importTarget: ${checks}개 검증 통과`);

// ── production: its own guard, explicit identity, no inference.
import { assertProductionConfirmation, guardProductionImportTarget, productionConfirmation } from './importTarget.ts';
check(() => {
  assert.deepEqual(guardProductionImportTarget(productionUrl, PRODUCTION, STAGING, [PRODUCTION]), { origin: productionUrl, projectRef: PRODUCTION });
  assert.deepEqual(guardProductionImportTarget(productionUrl, PRODUCTION, STAGING, []).projectRef, PRODUCTION);
});
check(() => {
  assert.throws(() => guardProductionImportTarget(productionUrl, undefined, STAGING, [PRODUCTION]), /PRODUCTION_PROJECT_REF_REQUIRED/);
  assert.throws(() => guardProductionImportTarget(productionUrl, 'short', STAGING, [PRODUCTION]), /PRODUCTION_PROJECT_REF_REQUIRED/);
  assert.throws(() => guardProductionImportTarget(productionUrl, PRODUCTION, undefined, [PRODUCTION]), /STAGING_PROJECT_REF_REQUIRED_FOR_PRODUCTION/);
  assert.throws(() => guardProductionImportTarget(stagingUrl, STAGING, STAGING, []), /PRODUCTION_REF_EQUALS_STAGING/);
  assert.throws(() => guardProductionImportTarget(stagingUrl, PRODUCTION, STAGING, [PRODUCTION]), /PRODUCTION_URL_REF_MISMATCH/);
  assert.throws(() => guardProductionImportTarget(`http://${PRODUCTION}.supabase.co`, PRODUCTION, STAGING, []), /PRODUCTION_URL_REF_MISMATCH/);
  assert.throws(() => guardProductionImportTarget(`${productionUrl}/rest/v1`, PRODUCTION, STAGING, []), /bare Supabase origin/);
  assert.throws(() => guardProductionImportTarget(productionUrl, PRODUCTION, STAGING, [STAGING]), /STAGING_DECLARED_AS_PRODUCTION/);
  assert.throws(() => guardProductionImportTarget(productionUrl, PRODUCTION, STAGING, ['b'.repeat(20)]), /PRODUCTION_IDENTITY_CONFLICT/);
});
// the local/staging guard still refuses production.
check(() => {
  assert.throws(() => guardImportTarget(productionUrl, 'production', PRODUCTION, [PRODUCTION]), /Production target is forbidden/);
});
check(() => {
  const id = 'd96c7afc-e10c-43cd-815f-97e401fc318f';
  assert.doesNotThrow(() => assertProductionConfirmation('import', PRODUCTION, id, productionConfirmation('import', PRODUCTION, id)));
  assert.throws(() => assertProductionConfirmation('import', PRODUCTION, id, undefined), /PRODUCTION_CONFIRMATION_REQUIRED/);
  assert.throws(() => assertProductionConfirmation('import', PRODUCTION, id, productionConfirmation('activate', PRODUCTION, id)), /PRODUCTION_CONFIRMATION_REQUIRED/, 'a confirmation for one step does not cover another');
  assert.throws(() => assertProductionConfirmation('import', PRODUCTION, id, productionConfirmation('import', STAGING, id)), /PRODUCTION_CONFIRMATION_REQUIRED/);
  assert.throws(() => assertProductionConfirmation('import', PRODUCTION, id, productionConfirmation('import', PRODUCTION, 'bade0617-63c6-4f61-86bf-6cd5ae17a101')), /PRODUCTION_CONFIRMATION_REQUIRED/);
  for (const command of ['reset', 'reseed', 'delete', 'purge'])
    assert.throws(() => assertProductionConfirmation(command, PRODUCTION, id, productionConfirmation(command, PRODUCTION, id)), /DESTRUCTIVE_OPERATION_FORBIDDEN_IN_PRODUCTION/);
});
console.log(`features/applicationAssessment/importTarget (production): ${checks}개 검증 통과`);
