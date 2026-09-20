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
