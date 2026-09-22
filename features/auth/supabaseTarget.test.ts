import assert from 'node:assert/strict';
import test from 'node:test';
import { checkSupabaseTarget } from './supabaseTarget.ts';

const STAGING = 'a'.repeat(20), PRODUCTION = 'b'.repeat(20);
const url = (ref: string) => `https://${ref}.supabase.co`;

test('a staging bundle talks only to its staging project', () => {
  assert.equal(checkSupabaseTarget({ environment: 'staging', supabaseUrl: url(STAGING), stagingProjectRef: STAGING, productionProjectRef: PRODUCTION }).ok, true);
  assert.deepEqual(checkSupabaseTarget({ environment: 'staging', supabaseUrl: url(PRODUCTION), stagingProjectRef: STAGING, productionProjectRef: PRODUCTION }), { ok: false, code: 'STAGING_PROJECT_REF_MISMATCH' });
  assert.deepEqual(checkSupabaseTarget({ environment: 'staging', supabaseUrl: url(PRODUCTION), stagingProjectRef: PRODUCTION, productionProjectRef: PRODUCTION }), { ok: false, code: 'PRODUCTION_PROJECT_FORBIDDEN' });
  assert.deepEqual(checkSupabaseTarget({ environment: 'staging', supabaseUrl: url(STAGING), stagingProjectRef: STAGING }), { ok: false, code: 'PRODUCTION_IDENTITY_REQUIRED' });
});

test('a production bundle talks only to its declared production project', () => {
  assert.equal(checkSupabaseTarget({ environment: 'production', supabaseUrl: url(PRODUCTION), productionProjectRef: PRODUCTION }).ok, true);
  assert.deepEqual(checkSupabaseTarget({ environment: 'production', supabaseUrl: url(STAGING), productionProjectRef: PRODUCTION }), { ok: false, code: 'PRODUCTION_PROJECT_REF_MISMATCH' });
  assert.deepEqual(checkSupabaseTarget({ environment: 'production', supabaseUrl: url(PRODUCTION) }), { ok: false, code: 'PRODUCTION_PROJECT_REF_MISMATCH' });
  assert.deepEqual(checkSupabaseTarget({ environment: 'production', supabaseUrl: url(STAGING), stagingProjectRef: STAGING, productionProjectRef: STAGING }), { ok: false, code: 'STAGING_PROJECT_FORBIDDEN' });
});

test('development and test bundles keep their existing behaviour', () => {
  assert.equal(checkSupabaseTarget({ environment: 'test', supabaseUrl: 'https://e2e-fixture.supabase.co' }).ok, true);
  assert.equal(checkSupabaseTarget({ environment: undefined, supabaseUrl: url(PRODUCTION) }).ok, true);
});
