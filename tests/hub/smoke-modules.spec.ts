import { test, expect } from '../fixtures/hub';

test.describe('KRS Hub — Smoke: Modul-Switch & iframes', () => {
  test('Klick auf Connect-Modul öffnet iframe', async ({ hubPage: page }) => {
    // Modul-Button für Connect anklicken
    const connectBtn = page.locator('.nav-item').filter({ hasText: /connect/i }).first();
    if (await connectBtn.count() === 0) {
      test.skip(true, 'Connect-Nav-Item nicht gefunden');
    }
    await connectBtn.click();
    // iframe sollte sichtbar werden
    const frame = page.locator('iframe[src*="krs-connect"]');
    await expect(frame).toHaveCount(1, { timeout: 4_000 });
  });

  test('Hash-Router setzt #/connect bei Modul-Wechsel', async ({ hubPage: page }) => {
    const connectBtn = page.locator('.nav-item').filter({ hasText: /connect/i }).first();
    if (await connectBtn.count() === 0) {
      test.skip(true);
    }
    await connectBtn.click();
    await expect(page).toHaveURL(/#\/connect/);
  });

  test('Externe Links (Untis, Homepage) sind im Dashboard verfügbar', async ({ hubPage: page }) => {
    // Dashboard ohne aktiven Modul
    await page.evaluate(() => { window.location.hash = '#/'; });
    await page.waitForTimeout(500);
    // Link zur Schulhomepage
    const homepageLink = page.locator('a[href*="realschule-schriesheim.de"]').first();
    await expect(homepageLink).toBeVisible({ timeout: 4_000 });
  });
});
