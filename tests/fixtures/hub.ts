import { test as base, expect, Page } from '@playwright/test';

export { expect };

/**
 * KRS Hub — Test-Fixture
 *
 * Lädt die Hub-Shell im Demo-Modus mit forceMode=demo. Der Override skippt
 * den PIN-Login und setzt ein Demo-Profil (Demo Lehrer, role=admin).
 */
export const HUB_PATH = '/krs-hub/index.html';

export async function openHub(page: Page) {
  await page.goto(`${HUB_PATH}?forceMode=demo`);
  await page.waitForFunction(
    () => typeof window.KRS_HUB_VERSION === 'string',
    null,
    { timeout: 10_000 }
  );
  // Sidebar sollte bald sichtbar sein
  await expect(page.locator('.shell, .sidebar, main').first())
    .toBeVisible({ timeout: 10_000 });
}

export const test = base.extend<{ hubPage: Page }>({
  hubPage: async ({ page }, use) => {
    await openHub(page);
    await use(page);
  },
});
