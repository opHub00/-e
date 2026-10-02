import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.WANPANE_STAGING_WEB_URL;
if (!baseURL || !/^https:\/\//.test(baseURL)) throw new Error('WANPANE_STAGING_WEB_URL_REQUIRED');

export default defineConfig({
  testDir: './e2e/staging',
  outputDir: './e2e/.artifacts/staging-runs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [['list']],
  use: {
    baseURL,
    ...(process.env.WANPANE_STAGING_STORAGE_STATE
      ? { storageState: process.env.WANPANE_STAGING_STORAGE_STATE }
      : {}),
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
