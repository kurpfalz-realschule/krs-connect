import { defineConfig, devices } from '@playwright/test';

/**
 * O1-Merge-Verifikation — schlanke Variante der Hauptkonfig:
 * kein Video/Trace/Screenshot (Sandbox-Zeitlimit), nur connect-Suite.
 * Für CI/S2 gilt weiterhin playwright.config.ts.
 */
export default defineConfig({
  testDir: './tests',
  outputDir: '/tmp/pw-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['line']],
  timeout: 20_000,
  expect: { timeout: 6_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: 'connect',
      testDir: './tests/connect',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run serve',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
