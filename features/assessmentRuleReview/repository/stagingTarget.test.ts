import assert from 'node:assert/strict';
import test from 'node:test';
import { allowsLocalReviewSeed, assertRuleReviewStagingTarget, projectRefFromSupabaseUrl } from './stagingTarget.ts';

test('extracts exact Supabase project ref', () => assert.equal(projectRefFromSupabaseUrl('https://stage123.supabase.co'), 'stage123'));
test('staging identity requires environment, URL and exact ref', () => {
  assert.deepEqual(assertRuleReviewStagingTarget({ environment: 'staging', supabaseUrl: 'https://stage123.supabase.co', stagingProjectRef: 'stage123', productionProjectRef: 'prod123' }).projectRef, 'stage123');
  assert.throws(() => assertRuleReviewStagingTarget({ environment: 'production', supabaseUrl: 'https://stage123.supabase.co', stagingProjectRef: 'stage123' }), /STAGING_ENV_REQUIRED/);
  assert.throws(() => assertRuleReviewStagingTarget({ environment: 'staging', supabaseUrl: 'https://prod123.supabase.co', stagingProjectRef: 'prod123', productionProjectRef: 'prod123' }), /PRODUCTION_PROJECT_FORBIDDEN/);
  assert.throws(() => assertRuleReviewStagingTarget({ environment: 'staging', supabaseUrl: 'https://other.supabase.co', stagingProjectRef: 'stage123' }), /STAGING_PROJECT_REF_MISMATCH/);
});
test('local fixtures cannot bypass staging or production targets', () => {
  assert.equal(allowsLocalReviewSeed('staging'), false);
  assert.equal(allowsLocalReviewSeed(' production '), false);
  assert.equal(allowsLocalReviewSeed('development'), true);
  assert.equal(allowsLocalReviewSeed('local'), true);
  assert.equal(allowsLocalReviewSeed('test'), true);
  assert.equal(allowsLocalReviewSeed(undefined), false);
  assert.equal(allowsLocalReviewSeed('unknown'), false);
});

test('production review target needs the declared production project and never staging', async () => {
  const { assertRuleReviewTarget } = await import('./stagingTarget.ts');
  const STAGING = 'a'.repeat(20), PRODUCTION = 'b'.repeat(20);
  const prod = { environment: 'production', supabaseUrl: `https://${PRODUCTION}.supabase.co`, productionProjectRef: PRODUCTION };
  assert.deepEqual(assertRuleReviewTarget(prod), { projectRef: PRODUCTION, url: `https://${PRODUCTION}.supabase.co`, environment: 'production' });
  assert.throws(() => assertRuleReviewTarget({ ...prod, productionProjectRef: null }), /PRODUCTION_PROJECT_REF_MISMATCH/);
  assert.throws(() => assertRuleReviewTarget({ ...prod, supabaseUrl: `https://${STAGING}.supabase.co` }), /PRODUCTION_PROJECT_REF_MISMATCH/);
  assert.throws(() => assertRuleReviewTarget({ ...prod, stagingProjectRef: PRODUCTION }), /STAGING_PROJECT_FORBIDDEN/);
  assert.equal(assertRuleReviewTarget({ environment: 'staging', supabaseUrl: `https://${STAGING}.supabase.co`, stagingProjectRef: STAGING, productionProjectRef: PRODUCTION }).environment, 'staging');
  assert.throws(() => assertRuleReviewTarget({ environment: 'staging', supabaseUrl: `https://${PRODUCTION}.supabase.co`, stagingProjectRef: PRODUCTION, productionProjectRef: PRODUCTION }), /PRODUCTION_PROJECT_FORBIDDEN/);
  for (const environment of [undefined, '', 'test', 'development', 'local', 'unknown'])
    assert.throws(() => assertRuleReviewTarget({ ...prod, environment }), /REVIEW_ENV_REQUIRED/, `${environment}: no remote review target`);
});
