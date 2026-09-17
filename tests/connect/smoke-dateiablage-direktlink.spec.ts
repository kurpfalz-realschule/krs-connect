import { test, expect } from '../fixtures/connect';

/**
 * Dateiablage — liegt im Hub, nicht mehr in Connect (v4.24.0)
 *
 * Historie: v4.18.0 machte den Sidebar-Eintrag zum Direktlink auf
 * cloud.realschule-schriesheim.de (vorher ein Zwischen-Modal). v4.24.0 nimmt
 * den Eintrag aus Connect heraus, solange die Schule den Hub nutzt: dort liegt
 * dieselbe Nextcloud bereits als Kachel („Dateiablage“ in EXTERNAL_LINKS),
 * und doppelte Ziele in zwei übereinanderliegenden Leisten waren genau die
 * Unruhe, die Norbert am 17.09.2026 gemeldet hat.
 *
 * Schulen OHNE Hub (hub.enabled = false in tenant.js) behalten den Link — für
 * sie ist Connect die einzige Oberfläche. Die Bedingung steht im Code
 * (`!window.__KRS_HUB_ENABLED && !!NEXTCLOUD_FILES_URL`); hier wird der
 * KRS-Fall (Hub an) geprüft.
 */
test.describe('Dateiablage — Hub-Kachel statt Connect-Eintrag (Demo)', () => {
  test('Mit aktivem Hub steht kein Dateiablage-Eintrag in Connects Leiste', async ({ connectPage: page }) => {
    await expect(page.locator('.sidebar-nav')).toBeVisible({ timeout: 8_000 });
    expect(await page.evaluate(() => !!(window as any).__KRS_HUB_ENABLED)).toBe(true);
    await expect(page.locator('[data-testid="nav-dateiablage"]')).toHaveCount(0);
  });

  test('Die Nextcloud-Adresse bleibt konfiguriert (der Hub verlinkt sie)', async ({ connectPage: page }) => {
    const url = await page.evaluate(() => (window as any).T
      ? (window as any).T('links.nextcloudUrl', '')
      : '');
    expect(url).toBe('https://cloud.realschule-schriesheim.de');
  });
});
