/**
 * Builds the browser fixture bundle and then serves it for Playwright.
 *
 * Playwright injects EXPO_PUBLIC_WANPANE_ENV=test into this process. The clean
 * export is intentionally scoped to E2E so production and staging exports keep
 * their real environment and cannot inherit a cached local-seed transform.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

if (process.env.EXPO_PUBLIC_WANPANE_ENV !== 'test') {
  throw new Error('E2E_TEST_ENV_REQUIRED');
}

const require = createRequire(import.meta.url);
const expoCli = require.resolve('expo/bin/cli');

await new Promise((resolve, reject) => {
  const build = spawn(
    process.execPath,
    [expoCli, 'export', '--platform', 'web', '--clear'],
    { env: process.env, stdio: 'inherit' },
  );
  build.once('error', reject);
  build.once('exit', code => {
    if (code === 0) resolve();
    else reject(new Error(`E2E_WEB_EXPORT_FAILED:${code ?? 'signal'}`));
  });
});

// staticServer reads these conventional CLI arguments and stays in this process,
// so Playwright can terminate the complete E2E server without orphaning a child.
process.argv[2] = process.argv[2] ?? 'dist';
process.argv[3] = process.argv[3] ?? '4321';
await import('./staticServer.mjs');
