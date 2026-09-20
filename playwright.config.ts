import { defineConfig, devices } from '@playwright/test';

const PORT = 4321;
const externallyManagedServer = process.env.WANPANE_E2E_EXTERNAL_SERVER === '1';

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
    // The PWA service worker serves public/offline.html when a navigation is slow,
    // which makes parallel runs flake on a page the app never actually failed to load.
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile-390x844', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: false } },
    { name: 'desktop-1440x900', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: externallyManagedServer ? undefined : {
    command: `node e2e/prepareWebServer.mjs dist ${PORT}`,
    url: `http://127.0.0.1:${PORT}/assessment`,
    env: {
      ...process.env,
      EXPO_PUBLIC_WANPANE_ENV: 'test',
      // Public, non-secret fixture values let browser tests construct the client;
      // every matching request is intercepted by Playwright and never reaches a DB.
      EXPO_PUBLIC_SUPABASE_URL: 'https://e2e-fixture.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-e2e-placeholder',
    },
    // Never reuse a server whose bundle may have been transformed for another env.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
