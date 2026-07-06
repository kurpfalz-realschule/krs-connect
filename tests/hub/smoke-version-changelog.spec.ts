import { test, expect } from '../fixtures/hub';

/**
 * Hub: Versionsanzeige + Changelog ("Was ist neu")  (v3.4.0, 2026-07-06)
 *
 * Demo-Modus: Benutzermenü zeigt die Version, "Was ist neu" öffnet den
 * Changelog. (Der Update-Banner pollt live und ist im Demo-Modus aus.)
 */
test.describe('KRS Hub — Version & Changelog', () => {

  test('Benutzermenü zeigt Version und öffnet den Changelog', async ({ hubPage: page }) => {
    // Benutzermenü öffnen
    await page.locator('.topbar-user').click();
    // Versionszeile sichtbar
    const ver = page.getByTestId('hub-version');
    await expect(ver).toBeVisible();
    await expect(ver).toContainText('KRS Hub v');
    // "Was ist neu" → Changelog-Modal
    await page.getByTestId('usermenu-whatsnew').click();
    await expect(page.getByTestId('changelog-modal')).toBeVisible();
    await expect(page.getByTestId('changelog-modal')).toContainText('Was ist neu');
    await expect(page.getByTestId('changelog-modal')).toContainText('Admin-Panel ohne PIN');
    await expect(page.getByTestId('changelog-version')).toContainText('v3.');
  });
});
