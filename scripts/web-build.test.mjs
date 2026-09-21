import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  E2E_FIXTURE_KEY,
  E2E_FIXTURE_URL,
  assertWebBuildProfile,
  createE2EBuildEnvironment,
  createReleaseBuildEnvironment,
} from './web-build.mjs';

test('E2E environment is explicit and does not mutate its parent environment', () => {
  const parent = { KEEP: 'yes' };
  const env = createE2EBuildEnvironment(parent);
  assert.deepEqual(parent, { KEEP: 'yes' });
  assert.equal(env.EXPO_PUBLIC_WANPANE_ENV, 'test');
  assert.equal(env.EXPO_PUBLIC_SUPABASE_URL, E2E_FIXTURE_URL);
  assert.equal(env.EXPO_PUBLIC_SUPABASE_ANON_KEY, E2E_FIXTURE_KEY);
  assert.equal(env.WANPANE_METRO_CACHE_NAMESPACE, 'e2e');
});

test('production and staging builds use explicit isolated cache profiles', () => {
  const production = createReleaseBuildEnvironment('production', { KEEP: 'yes' });
  const staging = createReleaseBuildEnvironment('staging', { KEEP: 'yes' });
  assert.equal(production.EXPO_PUBLIC_WANPANE_ENV, 'production');
  assert.equal(production.WANPANE_METRO_CACHE_NAMESPACE, 'production');
  assert.equal(staging.EXPO_PUBLIC_WANPANE_ENV, 'staging');
  assert.equal(staging.WANPANE_METRO_CACHE_NAMESPACE, 'staging');
  assert.equal(production.KEEP, 'yes');
});

test('release wrappers reject inherited E2E environment and fixture credentials', () => {
  assert.throws(
    () => createReleaseBuildEnvironment('production', { EXPO_PUBLIC_WANPANE_ENV: 'test' }),
    /TEST_ENV_NOT_ALLOWED_IN_RELEASE_BUILD/,
  );
  assert.throws(
    () => createReleaseBuildEnvironment('staging', { EXPO_PUBLIC_SUPABASE_URL: E2E_FIXTURE_URL }),
    /TEST_ENV_NOT_ALLOWED_IN_RELEASE_BUILD/,
  );
  assert.throws(
    () => createReleaseBuildEnvironment('production', { EXPO_PUBLIC_SUPABASE_ANON_KEY: E2E_FIXTURE_KEY }),
    /TEST_ENV_NOT_ALLOWED_IN_RELEASE_BUILD/,
  );
});

test('bundle assertions distinguish test guards and reject fixture or service-role leaks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wanpane-web-build-'));
  try {
    const writeBundle = text => writeFile(join(root, 'entry.js'), text, 'utf8');
    await writeBundle('allowsLocalReviewSeed)("production") isRuleReviewTestEnvironment)("production")');
    assert.deepEqual(
      await assertWebBuildProfile({ outputDir: root, profile: 'production' }),
      { profile: 'production', fixtureHostCount: 0, fixtureKeyCount: 0, serviceRoleMarkerCount: 0 },
    );

    await writeBundle(`allowsLocalReviewSeed)("production") isRuleReviewTestEnvironment)("production") ${E2E_FIXTURE_URL}`);
    await assert.rejects(
      assertWebBuildProfile({ outputDir: root, profile: 'production' }),
      /E2E_FIXTURE_LEAKED_INTO_PRODUCTION_BUILD/,
    );

    await writeBundle('allowsLocalReviewSeed)("staging") isRuleReviewTestEnvironment)("staging") SUPABASE_SERVICE_ROLE');
    await assert.rejects(
      assertWebBuildProfile({ outputDir: root, profile: 'staging' }),
      /SERVICE_ROLE_MARKER_LEAKED_INTO_WEB_BUILD/,
    );

    await writeBundle(`allowsLocalReviewSeed)("test") isRuleReviewTestEnvironment)("test") ${E2E_FIXTURE_URL} ${E2E_FIXTURE_KEY}`);
    const e2e = await assertWebBuildProfile({ outputDir: root, profile: 'test' });
    assert.equal(e2e.fixtureHostCount, 1);
    assert.equal(e2e.fixtureKeyCount, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
