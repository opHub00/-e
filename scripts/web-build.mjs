import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

export const E2E_OUTPUT_DIR = '.e2e/dist';
export const STAGING_OUTPUT_DIR = '.staging/dist';
export const RELEASE_OUTPUT_DIR = 'dist';
export const E2E_FIXTURE_URL = 'https://e2e-fixture.supabase.co';
export const E2E_FIXTURE_KEY = 'public-anon-e2e-placeholder';

const require = createRequire(import.meta.url);
const expoCli = require.resolve('expo/bin/cli');

/**
 * Server/CLI-only values never reach Metro: the service-role key, access tokens, write switches
 * and the unprefixed SUPABASE_* / RULE_REVIEW_STAGING_* inputs the staging mapping reads.
 */
const SERVER_ONLY_KEY = /SERVICE_ROLE|SECRET|PASSWORD|ACCESS_TOKEN|PRIVATE_KEY|OIDC_TOKEN|ALLOW_WRITE|^SUPABASE_|^RULE_REVIEW_STAGING_/i;
const baseEnvironment = source => Object.fromEntries(Object.entries(source).filter(([key]) => !SERVER_ONLY_KEY.test(key)));

export const STAGING_ENV_FILE = '.env.staging.local';
const STAGING_IDENTITY_KEYS = [
  'SUPABASE_STAGING_URL', 'SUPABASE_STAGING_PROJECT_REF', 'SUPABASE_STAGING_ANON_KEY',
  'SUPABASE_PRODUCTION_PROJECT_REF', 'RULE_REVIEW_STAGING_RULE_SET_ID',
];
const PROJECT_REF = /^[a-z0-9]{20}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const projectRefOf = url => {
  try { return new URL(url).hostname.toLowerCase().match(/^([a-z0-9]+)\.supabase\.co$/)?.[1] ?? null; } catch { return null; }
};

/** A publishable/anon key only. A secret or service-role key is refused without echoing it. */
function assertPublicKey(key, label = 'STAGING') {
  if (key.startsWith('sb_secret_')) throw new Error(`${label}_KEY_IS_NOT_PUBLIC`);
  const [, payload] = key.split('.');
  if (payload) {
    let role = null;
    try { role = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).role; } catch {}
    if (role !== 'anon') throw new Error(`${label}_KEY_IS_NOT_PUBLIC`);
  } else if (!key.startsWith('sb_publishable_')) throw new Error(`${label}_KEY_IS_NOT_PUBLIC`);
}

/** KEY=value lines; only the allow-listed staging identity keys are kept. */
export function parseStagingIdentity(text) {
  const identity = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match && STAGING_IDENTITY_KEYS.includes(match[1])) identity[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return identity;
}

/** Staging identity from the local env file, overridden by the same keys in the process environment. */
export function readStagingIdentity(source = process.env) {
  const file = source.WANPANE_STAGING_ENV_FILE?.trim() || STAGING_ENV_FILE;
  const fromFile = existsSync(file) ? parseStagingIdentity(readFileSync(file, 'utf8')) : {};
  const fromEnv = Object.fromEntries(STAGING_IDENTITY_KEYS.filter(key => source[key]?.trim()).map(key => [key, source[key].trim()]));
  return { ...fromFile, ...fromEnv };
}

/** The staging web build: public staging values only, checked against the production identity. */
export function createStagingBuildEnvironment(source = process.env, identity = readStagingIdentity(source)) {
  const url = identity.SUPABASE_STAGING_URL, ref = identity.SUPABASE_STAGING_PROJECT_REF?.toLowerCase();
  const key = identity.SUPABASE_STAGING_ANON_KEY, production = identity.SUPABASE_PRODUCTION_PROJECT_REF?.toLowerCase();
  if (!url || !ref || !key || !production) throw new Error('STAGING_IDENTITY_INCOMPLETE');
  if (!PROJECT_REF.test(ref) || !PROJECT_REF.test(production)) throw new Error('STAGING_PROJECT_REF_INVALID');
  if (ref === production) throw new Error('STAGING_REF_EQUALS_PRODUCTION');
  if (projectRefOf(url) !== ref) throw new Error('STAGING_URL_REF_MISMATCH');
  assertPublicKey(key);
  const ruleSetId = identity.RULE_REVIEW_STAGING_RULE_SET_ID;
  if (ruleSetId && !UUID.test(ruleSetId)) throw new Error('STAGING_RULE_SET_ID_INVALID');
  const env = createReleaseBuildEnvironment('staging', source);
  for (const name of Object.keys(env)) if (/^EXPO_PUBLIC_(?:SUPABASE_|RULE_REVIEW_)/.test(name)) delete env[name];
  return {
    ...env,
    EXPO_PUBLIC_SUPABASE_URL: url,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: key,
    EXPO_PUBLIC_SUPABASE_STAGING_PROJECT_REF: ref,
    EXPO_PUBLIC_SUPABASE_PRODUCTION_PROJECT_REF: production,
    ...(ruleSetId ? { EXPO_PUBLIC_RULE_REVIEW_RULE_SET_ID: ruleSetId } : {}),
  };
}

const PRODUCTION_PUBLIC_KEYS = [
  'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY',
  'EXPO_PUBLIC_SUPABASE_PRODUCTION_PROJECT_REF', 'SUPABASE_PRODUCTION_PROJECT_REF',
];

/**
 * Production public values from an explicitly named file (WANPANE_PRODUCTION_ENV_FILE). There is no
 * default: Vercel supplies them as environment variables, and a local preflight names its file.
 * Only the allow-listed public keys are read.
 */
export function readProductionIdentity(source = process.env) {
  const file = source.WANPANE_PRODUCTION_ENV_FILE?.trim();
  if (!file) return {};
  if (!existsSync(file)) throw new Error('PRODUCTION_ENV_FILE_NOT_FOUND');
  const identity = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match && PRODUCTION_PUBLIC_KEYS.includes(match[1])) identity[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return identity;
}

/**
 * The production web build targets only its declared production project and never names staging.
 * With a Supabase URL the production ref must be declared and match it; the ref is inlined so the
 * runtime guard can check it again. `requireTarget` (release/preflight) refuses an unconfigured bundle.
 */
export function createProductionBuildEnvironment(source = process.env, identity = readStagingIdentity(source),
  { requireTarget = false, production: productionIdentity = readProductionIdentity(source) } = {}) {
  const values = { ...productionIdentity, ...Object.fromEntries(PRODUCTION_PUBLIC_KEYS.filter(key => source[key]?.trim()).map(key => [key, source[key].trim()])) };
  const env = createReleaseBuildEnvironment('production', { ...source, ...values });
  delete env.EXPO_PUBLIC_SUPABASE_STAGING_PROJECT_REF;
  delete env.EXPO_PUBLIC_RULE_REVIEW_RULE_SET_ID;
  const staging = identity.SUPABASE_STAGING_PROJECT_REF?.toLowerCase();
  const production = (values.EXPO_PUBLIC_SUPABASE_PRODUCTION_PROJECT_REF || values.SUPABASE_PRODUCTION_PROJECT_REF
    || identity.SUPABASE_PRODUCTION_PROJECT_REF)?.toLowerCase();
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  if (!url) {
    if (requireTarget) throw new Error('PRODUCTION_TARGET_REQUIRED');
    delete env.EXPO_PUBLIC_SUPABASE_PRODUCTION_PROJECT_REF;
    return env;
  }
  if (staging && projectRefOf(url) === staging) throw new Error('STAGING_TARGET_IN_PRODUCTION_BUILD');
  if (!production || !PROJECT_REF.test(production)) throw new Error('PRODUCTION_PROJECT_REF_REQUIRED');
  if (staging && staging === production) throw new Error('STAGING_REF_EQUALS_PRODUCTION');
  if (projectRefOf(url) !== production) throw new Error('PRODUCTION_URL_REF_MISMATCH');
  if (!env.EXPO_PUBLIC_SUPABASE_ANON_KEY) throw new Error('PRODUCTION_PUBLIC_KEY_REQUIRED');
  assertPublicKey(env.EXPO_PUBLIC_SUPABASE_ANON_KEY, 'PRODUCTION');
  env.EXPO_PUBLIC_SUPABASE_PRODUCTION_PROJECT_REF = production;
  return env;
}

export function createE2EBuildEnvironment(source = process.env) {
  return {
    ...baseEnvironment(source),
    EXPO_PUBLIC_WANPANE_ENV: 'test',
    EXPO_PUBLIC_SUPABASE_URL: E2E_FIXTURE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: E2E_FIXTURE_KEY,
    WANPANE_METRO_CACHE_NAMESPACE: 'e2e',
  };
}

export function createReleaseBuildEnvironment(target, source = process.env) {
  if (target !== 'production' && target !== 'staging') throw new Error('INVALID_WEB_BUILD_TARGET');
  if (
    source.EXPO_PUBLIC_WANPANE_ENV?.trim().toLowerCase() === 'test'
    || source.EXPO_PUBLIC_SUPABASE_URL?.trim() === E2E_FIXTURE_URL
    || source.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() === E2E_FIXTURE_KEY
  ) {
    throw new Error('TEST_ENV_NOT_ALLOWED_IN_RELEASE_BUILD');
  }
  return {
    ...baseEnvironment(source),
    EXPO_PUBLIC_WANPANE_ENV: target,
    WANPANE_METRO_CACHE_NAMESPACE: target,
    // Release inputs are explicit. Expo's automatic .env loading could otherwise fill in another project's values.
    EXPO_NO_DOTENV: '1',
  };
}

export function runWebExport({ env, outputDir, clear = false, stdio = 'inherit' }) {
  return new Promise((resolve, reject) => {
    const args = [expoCli, 'export', '--platform', 'web', '--output-dir', outputDir];
    if (clear) args.push('--clear');
    const child = spawn(process.execPath, args, { env, stdio });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`WEB_EXPORT_FAILED:${code ?? signal ?? 'unknown'}`));
    });
  });
}

async function webBundleText(directory) {
  const files = [];
  const visit = async current => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const file = join(current, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (/\.(?:html|js|json)$/.test(entry.name)) files.push(file);
    }
  };
  await visit(directory);
  return (await Promise.all(files.map(file => readFile(file, 'utf8')))).join('\n');
}

/** Verifies the compile-time environment and secret boundary of a completed web export. */
export async function assertWebBuildProfile({ outputDir, profile, stagingProjectRef, productionProjectRef, requireTarget = false }) {
  if (!['test', 'staging', 'production'].includes(profile)) throw new Error('INVALID_WEB_BUILD_PROFILE');
  const text = await webBundleText(outputDir);
  const escaped = profile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const localSeedPattern = new RegExp(`allowsLocalReviewSeed\\)\\("${escaped}"\\)`);
  const faultPlanPattern = new RegExp(`isRuleReviewTestEnvironment\\)\\("${escaped}"\\)`);
  if (!localSeedPattern.test(text)) throw new Error(`WEB_BUILD_LOCAL_SEED_PROFILE_MISMATCH:${profile}`);
  if (!faultPlanPattern.test(text)) throw new Error(`WEB_BUILD_FAULT_PLAN_PROFILE_MISMATCH:${profile}`);
  const fixtureHostCount = text.split(E2E_FIXTURE_URL).length - 1;
  const fixtureKeyCount = text.split(E2E_FIXTURE_KEY).length - 1;
  if (profile === 'test') {
    if (fixtureHostCount === 0 || fixtureKeyCount === 0) throw new Error('E2E_FIXTURE_NOT_INLINED');
  } else if (fixtureHostCount !== 0 || fixtureKeyCount !== 0) {
    throw new Error(`E2E_FIXTURE_LEAKED_INTO_${profile.toUpperCase()}_BUILD`);
  }
  const serviceRoleMarkerCount = (text.match(/service_role|SUPABASE_SERVICE_ROLE/gi) ?? []).length;
  if (serviceRoleMarkerCount !== 0) throw new Error('SERVICE_ROLE_MARKER_LEAKED_INTO_WEB_BUILD');
  const count = needle => (needle ? text.split(needle).length - 1 : 0);
  // The staging bundle keeps the production ref only as the guard constant that refuses it.
  const productionHostCount = count(productionProjectRef && `${productionProjectRef}.supabase.co`);
  const stagingHostCount = count(stagingProjectRef && `${stagingProjectRef}.supabase.co`);
  const stagingRefCount = count(stagingProjectRef);
  if (profile === 'staging') {
    if (!stagingProjectRef || !productionProjectRef) throw new Error('STAGING_BUILD_IDENTITY_REQUIRED');
    if (productionHostCount !== 0) throw new Error('PRODUCTION_TARGET_IN_STAGING_BUILD');
    if (stagingHostCount === 0) throw new Error('STAGING_TARGET_NOT_INLINED');
  }
  if (profile === 'production' && stagingRefCount !== 0) throw new Error('STAGING_TARGET_IN_PRODUCTION_BUILD');
  if (profile === 'production' && requireTarget && productionHostCount === 0) throw new Error('PRODUCTION_TARGET_NOT_INLINED');
  return { profile, fixtureHostCount, fixtureKeyCount, serviceRoleMarkerCount, productionHostCount, stagingHostCount, stagingRefCount };
}
