import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright-Konfiguration für KRS Connect + KRS Hub
 *
 * Drei Test-Suites:
 *  - tests/connect/  → Smoke-Tests gegen lokale krs-connect-v3.html im Demo-Modus
 *  - tests/hub/      → Smoke-Tests gegen lokale krs-hub/index.html im Demo-Modus
 *  - tests/live/     → Health-Checks gegen die Live-URLs auf GitHub Pages
 *
 * Lokale Tests: webServer startet einen http-server auf 127.0.0.1:4173
 * Live-Tests: nutzen ihre eigene baseURL und brauchen keinen Webserver
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: 'connect',
      testDir: './tests/connect',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'hub',
      testDir: './tests/hub',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'live',
      testDir: './tests/live',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: undefined, // Live-Tests setzen ihre eigene URL
        // Health-Monitoring braucht kein Video/Trace/Screenshot. Der CI-Runner
        // hat kein ffmpeg-Binary → Video-Init würde browserContext.newPage()
        // werfen und alle Page-Tests rot machen (unabhängig vom Seiten-Status).
        video: 'off',
        trace: 'off',
        screenshot: 'off',
      },
    },
  ],
  webServer: {
    command: 'npm run serve',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
