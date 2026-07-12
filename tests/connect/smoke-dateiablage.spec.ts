import { test, expect } from '../fixtures/connect';

/**
 * Dateiablage-Platzhalter (v4.16.0: Umstieg von iServ auf Nextcloud)
 *
 * Linker Nav-Button „Dateiablage" öffnet ein Modal, das bewusst darauf
 * hinweist, dass die eigene Dateiablage direkt in Connect noch in Arbeit ist,
 * und bis dahin auf die Nextcloud-Dateiablage der Schule verlinkt.
 */
test.describe('Dateiablage — Nav-Button & Modal (Demo)', () => {
  test('Nav-Button öffnet Modal mit Nextcloud-Hinweis und Nextcloud-Link', async ({ connectPage: page }) => {
    const navBtn = page.locator('button[aria-label="Dateiablage"]').first();
    if (await navBtn.count() === 0) {
      test.skip(true, 'Dateiablage-Nav-Button nicht gefunden — UI-Variante');
    }
    await expect(navBtn).toBeVisible({ timeout: 5_000 });
    await navBtn.click();

    // Modal sichtbar mit Überschrift
    const dialog = page.locator('.modal-overlay[aria-label="Dateiablage"]').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog).toContainText(/Nextcloud/i);
    await expect(dialog).not.toContainText(/iServ/i);

    // Nextcloud-Link korrekt und in neuem Tab, kein iServ-Link mehr
    const link = dialog.locator('a[target="_blank"]').first();
    await expect(link).toHaveAttribute('href', 'https://cloud.realschule-schriesheim.de');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(dialog.locator('a[href*="krs.sh-schulen.de"]')).toHaveCount(0);
  });

  test('Modal lässt sich mit Schließen-Button wieder schließen', async ({ connectPage: page }) => {
    const navBtn = page.locator('button[aria-label="Dateiablage"]').first();
    if (await navBtn.count() === 0) {
      test.skip(true, 'Dateiablage-Nav-Button nicht gefunden — UI-Variante');
    }
    await navBtn.click();
    const dialog = page.locator('.modal-overlay[aria-label="Dateiablage"]').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await dialog.locator('button[aria-label="Schließen"]').first().click();
    await expect(dialog).toHaveCount(0, { timeout: 5_000 });
  });
});
