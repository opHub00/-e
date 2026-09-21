/**
 * Builds the browser fixture bundle and then serves it for Playwright.
 *
 * Playwright injects EXPO_PUBLIC_WANPANE_ENV=test into this process. The clean
 * export is intentionally scoped to E2E so production and staging exports keep
 * their real environment and cannot inherit a cached local-seed transform.
 */
import { E2E_OUTPUT_DIR, assertWebBuildProfile, runWebExport } from '../scripts/web-build.mjs';

if (process.env.EXPO_PUBLIC_WANPANE_ENV !== 'test') {
  throw new Error('E2E_TEST_ENV_REQUIRED');
}

await runWebExport({ env: process.env, outputDir: E2E_OUTPUT_DIR, clear: true });
await assertWebBuildProfile({ outputDir: E2E_OUTPUT_DIR, profile: 'test' });

// staticServer reads these conventional CLI arguments and stays in this process,
// so Playwright can terminate the complete E2E server without orphaning a child.
process.argv[2] = process.argv[2] ?? E2E_OUTPUT_DIR;
process.argv[3] = process.argv[3] ?? '4321';
await import('./staticServer.mjs');
