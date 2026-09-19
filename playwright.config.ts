import { defineConfig, devices } from '@playwright/test';

const PORT = 4321;

/** Browser smoke coverage for the assessment flow. Runs against the static web export. */
export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.artifacts/runs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile-390x844', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: false } },
    { name: 'desktop-1440x900', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `node e2e/staticServer.mjs dist ${PORT}`,
    url: `http://127.0.0.1:${PORT}/assessment`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
