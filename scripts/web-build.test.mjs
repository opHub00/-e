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
  createProductionBuildEnvironment,
  createReleaseBuildEnvironment,
  createStagingBuildEnvironment,
  parseStagingIdentity,
  readProductionIdentity,
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
      { profile: 'production', fixtureHostCount: 0, fixtureKeyCount: 0, serviceRoleMarkerCount: 0, productionHostCount: 0, stagingHostCount: 0, stagingRefCount: 0 },
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

const STAGING = 'a'.repeat(20), PRODUCTION = 'b'.repeat(20);
const jwt = role => `h.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.s`;
const identity = (overrides = {}) => ({
  SUPABASE_STAGING_URL: `https://${STAGING}.supabase.co`,
  SUPABASE_STAGING_PROJECT_REF: STAGING,
  SUPABASE_STAGING_ANON_KEY: jwt('anon'),
  SUPABASE_PRODUCTION_PROJECT_REF: PRODUCTION,
  ...overrides,
});

test('staging build maps only public staging values and strips server-only keys', () => {
  const source = {
    KEEP: 'yes',
    EXPO_PUBLIC_SUPABASE_URL: `https://${PRODUCTION}.supabase.co`,
    SUPABASE_STAGING_SERVICE_ROLE_KEY: jwt('service_role'),
    SUPABASE_SERVICE_ROLE_KEY: 'x',
    RULE_REVIEW_STAGING_ALLOW_WRITE: 'true',
    RULE_REVIEW_STAGING_ACCESS_TOKEN: 'x',
  };
  const env = createStagingBuildEnvironment(source, identity({ RULE_REVIEW_STAGING_RULE_SET_ID: '00000000-0000-4000-8000-000000000000' }));
  assert.equal(env.EXPO_PUBLIC_WANPANE_ENV, 'staging');
  assert.equal(env.WANPANE_METRO_CACHE_NAMESPACE, 'staging');
  assert.equal(env.EXPO_PUBLIC_SUPABASE_URL, `https://${STAGING}.supabase.co`, 'an inherited production URL is replaced');
  assert.equal(env.EXPO_PUBLIC_SUPABASE_STAGING_PROJECT_REF, STAGING);
  assert.equal(env.EXPO_PUBLIC_SUPABASE_PRODUCTION_PROJECT_REF, PRODUCTION);
  assert.equal(env.EXPO_PUBLIC_RULE_REVIEW_RULE_SET_ID, '00000000-0000-4000-8000-000000000000');
  assert.equal(env.KEEP, 'yes');
  assert.deepEqual(Object.keys(env).filter(key => /SERVICE_ROLE|ALLOW_WRITE|ACCESS_TOKEN|^SUPABASE_|^RULE_REVIEW_STAGING_/.test(key)), []);
  assert.equal(source.SUPABASE_SERVICE_ROLE_KEY, 'x', 'parent environment is not mutated');
});

test('staging build refuses incomplete, mismatched, production or secret identities', () => {
  assert.throws(() => createStagingBuildEnvironment({}, {}), /STAGING_IDENTITY_INCOMPLETE/);
  assert.throws(() => createStagingBuildEnvironment({}, identity({ SUPABASE_PRODUCTION_PROJECT_REF: STAGING })), /STAGING_REF_EQUALS_PRODUCTION/);
  assert.throws(() => createStagingBuildEnvironment({}, identity({ SUPABASE_STAGING_URL: `https://${PRODUCTION}.supabase.co` })), /STAGING_URL_REF_MISMATCH/);
  assert.throws(() => createStagingBuildEnvironment({}, identity({ SUPABASE_STAGING_ANON_KEY: jwt('service_role') })), /STAGING_KEY_IS_NOT_PUBLIC/);
  assert.throws(() => createStagingBuildEnvironment({}, identity({ SUPABASE_STAGING_ANON_KEY: 'sb_secret_x' })), /STAGING_KEY_IS_NOT_PUBLIC/);
  assert.throws(() => createStagingBuildEnvironment({}, identity({ RULE_REVIEW_STAGING_RULE_SET_ID: 'nope' })), /STAGING_RULE_SET_ID_INVALID/);
  assert.equal(createStagingBuildEnvironment({}, identity({ SUPABASE_STAGING_ANON_KEY: 'sb_publishable_x' })).EXPO_PUBLIC_SUPABASE_ANON_KEY, 'sb_publishable_x');
});

test('staging identity file keeps only allow-listed keys', () => {
  const parsed = parseStagingIdentity(`SUPABASE_STAGING_URL=https://${STAGING}.supabase.co\r\nSUPABASE_STAGING_SERVICE_ROLE_KEY=secret\nRULE_REVIEW_STAGING_ALLOW_WRITE=true\nSUPABASE_PRODUCTION_PROJECT_REF="${PRODUCTION}"`);
  assert.deepEqual(parsed, { SUPABASE_STAGING_URL: `https://${STAGING}.supabase.co`, SUPABASE_PRODUCTION_PROJECT_REF: PRODUCTION });
});

test('production build never targets or names the staging project', () => {
  assert.throws(() => createProductionBuildEnvironment({ EXPO_PUBLIC_SUPABASE_URL: `https://${STAGING}.supabase.co` }, identity()), /STAGING_TARGET_IN_PRODUCTION_BUILD/);
  const env = createProductionBuildEnvironment({ EXPO_PUBLIC_SUPABASE_STAGING_PROJECT_REF: STAGING, EXPO_PUBLIC_RULE_REVIEW_RULE_SET_ID: 'x', SUPABASE_STAGING_SERVICE_ROLE_KEY: 'x' }, identity());
  assert.equal(env.EXPO_PUBLIC_WANPANE_ENV, 'production');
  assert.equal(env.EXPO_PUBLIC_SUPABASE_STAGING_PROJECT_REF, undefined);
  assert.equal(env.EXPO_PUBLIC_RULE_REVIEW_RULE_SET_ID, undefined);
  assert.equal(env.SUPABASE_STAGING_SERVICE_ROLE_KEY, undefined);
});

test('bundle assertions reject the other project as a target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wanpane-web-target-'));
  try {
    const writeBundle = text => writeFile(join(root, 'entry.js'), text, 'utf8');
    const guard = profile => `allowsLocalReviewSeed)("${profile}") isRuleReviewTestEnvironment)("${profile}")`;
    await writeBundle(`${guard('staging')} https://${STAGING}.supabase.co productionProjectRef:"${PRODUCTION}"`);
    const ok = await assertWebBuildProfile({ outputDir: root, profile: 'staging', stagingProjectRef: STAGING, productionProjectRef: PRODUCTION });
    assert.equal(ok.productionHostCount, 0);
    await writeBundle(`${guard('staging')} https://${STAGING}.supabase.co https://${PRODUCTION}.supabase.co`);
    await assert.rejects(assertWebBuildProfile({ outputDir: root, profile: 'staging', stagingProjectRef: STAGING, productionProjectRef: PRODUCTION }), /PRODUCTION_TARGET_IN_STAGING_BUILD/);
    await writeBundle(`${guard('staging')}`);
    await assert.rejects(assertWebBuildProfile({ outputDir: root, profile: 'staging', stagingProjectRef: STAGING, productionProjectRef: PRODUCTION }), /STAGING_TARGET_NOT_INLINED/);
    await assert.rejects(assertWebBuildProfile({ outputDir: root, profile: 'staging' }), /STAGING_BUILD_IDENTITY_REQUIRED/);
    await writeBundle(`${guard('production')} ${STAGING}`);
    await assert.rejects(assertWebBuildProfile({ outputDir: root, profile: 'production', stagingProjectRef: STAGING }), /STAGING_TARGET_IN_PRODUCTION_BUILD/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('production build declares and inlines its own project, or refuses', () => {
  const url = `https://${PRODUCTION}.supabase.co`;
  const env = createProductionBuildEnvironment({ EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt('anon'), SUPABASE_PRODUCTION_PROJECT_REF: PRODUCTION }, identity(), { production: {} });
  assert.equal(env.EXPO_PUBLIC_SUPABASE_PRODUCTION_PROJECT_REF, PRODUCTION);
  assert.equal(env.EXPO_NO_DOTENV, '1', 'Expo .env loading is off for release builds');
  assert.equal(env.SUPABASE_PRODUCTION_PROJECT_REF, undefined, 'unprefixed input is not forwarded');
  assert.throws(() => createProductionBuildEnvironment({ EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt('anon') }, {}, { production: {} }), /PRODUCTION_PROJECT_REF_REQUIRED/);
  assert.throws(() => createProductionBuildEnvironment({ EXPO_PUBLIC_SUPABASE_URL: `https://${'c'.repeat(20)}.supabase.co`, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt('anon') }, identity(), { production: {} }), /PRODUCTION_URL_REF_MISMATCH/);
  assert.throws(() => createProductionBuildEnvironment({ EXPO_PUBLIC_SUPABASE_URL: url }, identity(), { production: {} }), /PRODUCTION_PUBLIC_KEY_REQUIRED/);
  assert.throws(() => createProductionBuildEnvironment({ EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt('service_role') }, identity(), { production: {} }), /PRODUCTION_KEY_IS_NOT_PUBLIC/);
  assert.throws(() => createProductionBuildEnvironment({}, identity(), { requireTarget: true, production: {} }), /PRODUCTION_TARGET_REQUIRED/);
  assert.equal(createProductionBuildEnvironment({}, identity(), { production: {} }).EXPO_PUBLIC_SUPABASE_URL, undefined, 'plain build:web may stay unconfigured');
});

test('production identity file is explicit and allow-listed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wanpane-prod-env-'));
  try {
    const file = join(root, '.env');
    await writeFile(file, `EXPO_PUBLIC_SUPABASE_URL=https://${PRODUCTION}.supabase.co\nGEMINI_API_KEY=secret\nSUPABASE_SERVICE_ROLE_KEY=secret\nEXPO_PUBLIC_SUPABASE_ANON_KEY=${jwt('anon')}\n`);
    assert.deepEqual(Object.keys(readProductionIdentity({ WANPANE_PRODUCTION_ENV_FILE: file })).sort(), ['EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_URL']);
    assert.deepEqual(readProductionIdentity({}), {}, 'no default file');
    assert.throws(() => readProductionIdentity({ WANPANE_PRODUCTION_ENV_FILE: join(root, 'missing') }), /PRODUCTION_ENV_FILE_NOT_FOUND/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('release bundle must inline its production target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wanpane-web-release-'));
  try {
    await writeFile(join(root, 'entry.js'), 'allowsLocalReviewSeed)("production") isRuleReviewTestEnvironment)("production")', 'utf8');
    await assert.rejects(assertWebBuildProfile({ outputDir: root, profile: 'production', productionProjectRef: PRODUCTION, requireTarget: true }), /PRODUCTION_TARGET_NOT_INLINED/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
