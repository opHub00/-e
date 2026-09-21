import { spawn } from 'node:child_process';
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

const baseEnvironment = source => ({ ...source });

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
export async function assertWebBuildProfile({ outputDir, profile }) {
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
  return { profile, fixtureHostCount, fixtureKeyCount, serviceRoleMarkerCount };
}
