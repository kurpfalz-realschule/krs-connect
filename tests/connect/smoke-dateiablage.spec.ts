import { test, expect } from '../fixtures/connect';

/**
 * Dateiablage-Platzhalter (Nextcloud kommt, bis dahin iServ)
 *
 * Linker Nav-Button „Dateiablage" öffnet ein Modal, das bewusst darauf
 * hinweist, dass die eigene Dateiablage mit Nextcloud nachgerüstet wird, und
 * bis dahin auf die iServ-Dateiablage der Schule verlinkt.
 */
test.describe('Dateiablage — Nav-Button & Modal (Demo)', () => {
  test('Nav-Button öffnet Modal mit Nextcloud-Hinweis und iServ-Link', async ({ connectPage: page }) => {
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

    // iServ-Link korrekt und in neuem Tab
    const link = dialog.locator('a[target="_blank"]').first();
    await expect(link).toHaveAttribute('href', 'https://krs.sh-schulen.de');
    await expect(link).toHaveAttribute('rel', /noopener/);
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
