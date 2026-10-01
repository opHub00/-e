import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { isApplicantProfileV2Payload } from '../features/auth/syncDomain.ts';
import { migrateApplicantProfileV2ToV3 } from '../features/profile/v3.ts';

const MIGRATION_VERSION = 'applicant-profile-v3-2026-10-01';
const apply = process.argv.includes('--apply');
const environment = process.env.WANPANE_ENV?.trim().toLowerCase();
const url = process.env.SUPABASE_STAGING_URL?.trim();
const expectedRef = process.env.SUPABASE_STAGING_PROJECT_REF?.trim().toLowerCase();
const productionRef = process.env.SUPABASE_PRODUCTION_PROJECT_REF?.trim().toLowerCase();
const serviceRoleKey = process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY?.trim();
const allowWrite = process.env.PROFILE_V3_BACKFILL_ALLOW_WRITE === 'true';
const confirmedIds = new Set(
  (process.env.PROFILE_V3_BACKFILL_USER_IDS ?? '')
    .split(',').map(value => value.trim()).filter(Boolean),
);
const actualRef = (() => {
  try { return new URL(url).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1] ?? null; }
  catch { return null; }
})();

assert.equal(environment, 'staging', 'STAGING_ENV_REQUIRED');
assert.ok(expectedRef && actualRef === expectedRef, 'STAGING_PROJECT_REF_MISMATCH');
assert.ok(productionRef && actualRef !== productionRef, 'PRODUCTION_PROJECT_FORBIDDEN');
assert.ok(serviceRoleKey, 'STAGING_SERVICE_ROLE_REQUIRED');
if (apply) assert.ok(allowWrite, 'PROFILE_V3_BACKFILL_WRITE_NOT_APPROVED');

const client = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const { data: sourceRows, error: sourceError } = await client
  .from('user_profiles')
  .select('user_id,schema_version,profile_json,updated_at')
  .eq('schema_version', 2)
  .order('user_id');
if (sourceError) throw sourceError;

const { data: targetRows, error: targetError } = await client
  .from('applicant_profiles_v3')
  .select('user_id,revision,provenance')
  .order('user_id');
if (targetError) throw targetError;

const targetIds = new Set((targetRows ?? []).map(row => row.user_id));
const rows = sourceRows ?? [];
const invalid = rows.filter(row => !isApplicantProfileV2Payload(row.profile_json));
const pending = rows.filter(row => !targetIds.has(row.user_id));
const unconfirmed = pending.filter(row => !confirmedIds.has(row.user_id));

console.log(JSON.stringify({
  mode: apply ? 'APPLY' : 'DRY_RUN',
  projectRef: actualRef,
  v2Rows: rows.length,
  existingV3Rows: targetIds.size,
  pendingRows: pending.length,
  invalidRows: invalid.length,
  confirmedPendingRows: pending.length - unconfirmed.length,
  unconfirmedRows: unconfirmed.length,
}, null, 2));

if (apply) {
  assert.equal(invalid.length, 0, 'PROFILE_V3_BACKFILL_INVALID_V2_ROWS');
  assert.equal(unconfirmed.length, 0, 'PROFILE_V3_BACKFILL_EXPLICIT_USER_ALLOWLIST_REQUIRED');

  let migrated = 0;
  let noChange = 0;
  for (const row of pending) {
    const fingerprint = createHash('sha256').update(canonical(row.profile_json), 'utf8').digest('hex');
    const profile = migrateApplicantProfileV2ToV3(row.profile_json, {
      source: 'PERSISTED_USER', observedAt: row.updated_at,
    });
    const { data, error } = await client.rpc('backfill_applicant_profile_v3', {
      p_user_id: row.user_id,
      p_profile: profile,
      p_source_updated_at: row.updated_at,
      p_source_fingerprint: fingerprint,
      p_migration_version: MIGRATION_VERSION,
    });
    if (error) throw error;
    if (data?.status === 'MIGRATED') migrated += 1;
    else if (data?.status === 'NO_CHANGE') noChange += 1;
    else throw new Error('PROFILE_V3_BACKFILL_UNEXPECTED_RESULT');
  }

  const { count: finalCount, error: countError } = await client
    .from('applicant_profiles_v3')
    .select('user_id', { count: 'exact', head: true });
  if (countError) throw countError;
  console.log(JSON.stringify({ status: 'COMPLETE', migrated, noChange, finalV3Rows: finalCount }, null, 2));
}
