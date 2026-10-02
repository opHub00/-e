import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const refFromUrl = value => {
  try { return new URL(value).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1] ?? null; } catch { return null; }
};
const required = name => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
};
const stagingUrl = required('SUPABASE_STAGING_URL');
const stagingRef = required('SUPABASE_STAGING_PROJECT_REF').toLowerCase();
const productionRef = required('SUPABASE_PRODUCTION_PROJECT_REF').toLowerCase();
required('SUPABASE_STAGING_ANON_KEY');
required('SUPABASE_STAGING_SERVICE_ROLE_KEY');
required('WANPANE_STAGING_WEB_URL');
if (process.env.WANPANE_ENV?.trim().toLowerCase() !== 'staging') throw new Error('STAGING_ENV_REQUIRED');
if (stagingRef === productionRef || refFromUrl(stagingUrl) !== stagingRef) throw new Error('STAGING_IDENTITY_MISMATCH');

let storageState;
let protectionBypass;
const cookieJar = process.env.WANPANE_VERCEL_COOKIE_JAR?.trim();
if (cookieJar) {
  const cookies = (await readFile(cookieJar, 'utf8')).split(/\r?\n/).flatMap(line => {
    const httpOnly = line.startsWith('#HttpOnly_');
    if ((!httpOnly && line.startsWith('#')) || !line.trim()) return [];
    const values = (httpOnly ? line.slice('#HttpOnly_'.length) : line).split('\t');
    if (values.length < 7) return [];
    const [domain, , path, secure, expires, name, value] = values;
    return [{ name, value, domain, path, expires: Number(expires) || -1, httpOnly, secure: secure === 'TRUE', sameSite: 'Lax' }];
  });
  if (!cookies.length) throw new Error('VERCEL_PROTECTION_COOKIE_REQUIRED');
  await mkdir('.cache/staging-e2e', { recursive: true });
  storageState = '.cache/staging-e2e/storage-state.json';
  await writeFile(storageState, JSON.stringify({ cookies, origins: [] }), { encoding: 'utf8', mode: 0o600 });
}
const verboseLog = process.env.WANPANE_VERCEL_VERBOSE_LOG?.trim();
if (verboseLog) {
  const line = (await readFile(verboseLog, 'utf8')).split(/\r?\n/)
    .find(value => /^> x-vercel-protection-bypass:/i.test(value));
  protectionBypass = line?.slice(line.indexOf(':') + 1).trim();
  if (!protectionBypass) throw new Error('VERCEL_PROTECTION_BYPASS_REQUIRED');
}

const require = createRequire(import.meta.url);
const cli = require.resolve('@playwright/test/cli');
const child = spawn(process.execPath, [cli, 'test', '--config=playwright.staging.config.ts', ...process.argv.slice(2)], {
  env: {
    ...process.env,
    WANPANE_STAGING_BROWSER_CONFIRMED: '1',
    ...(storageState ? { WANPANE_STAGING_STORAGE_STATE: storageState } : {}),
    ...(protectionBypass ? { WANPANE_VERCEL_PROTECTION_BYPASS: protectionBypass } : {}),
  },
  stdio: 'inherit',
});
const result = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (code, signal) => resolve({ code, signal }));
});
process.exitCode = result.code ?? 1;
