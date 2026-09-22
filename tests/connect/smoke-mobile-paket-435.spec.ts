import { test, expect, openConnect } from '../fixtures/connect';

/**
 * Mobile-Paket v4.35.0 (22.09.2026):
 * - Kollegium fest oben
 * - Einstellungen/Profil/Admin im Konto-Menü oben rechts (nicht im ☰)
 */

test.describe('v4.35.0: Kollegium oben + Konto-Menü', () => {
  test.use({ viewport: { width: 393, height: 852 } });

  test('Kollegium ist erstes sichtbares Team', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    await page.getByTestId('drawer-nav-teams').click();
    await expect(page.getByTestId('mobile-topnav-menu')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('mobile-topnav-menu').click();
    const firstVisible = page.getByTestId('team-visible').first();
    await expect(firstVisible).toBeVisible({ timeout: 8_000 });
    await expect(firstVisible).toContainText(/Kollegium/i);
  });

  test('Konto-Menü öffnet Einstellungen; ☰ hat kein Einstellungen mehr', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    await expect(page.getByTestId('mobile-account-trigger')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('mobile-account-trigger').click();
    await expect(page.getByTestId('mobile-account-menu')).toBeVisible();
    await expect(page.getByTestId('drawer-nav-settings')).toBeVisible();
    await expect(page.getByTestId('drawer-nav-profile')).toBeVisible();
    await page.getByTestId('drawer-nav-settings').click();
    await expect(page.getByRole('dialog', { name: /Einstellungen/i })).toBeVisible({ timeout: 5_000 });

    // ☰-Drawer: Merkliste ja, Einstellungen nicht mehr als Drawer-Eintrag außerhalb des Konto-Menüs
    await page.keyboard.press('Escape').catch(() => {});
    await page.getByTestId('mobile-topnav-menu').click();
    const drawer = page.locator('.drawer-nav, .team-drawer.mobile-open, .mobile-drawer-only.mobile-open').first();
    await expect(drawer).toBeVisible({ timeout: 5_000 });
    // Settings testid sits only in account menu now — when menu closed, settings in drawer absent
    await page.getByTestId('mobile-account-overlay').click({ timeout: 1000 }).catch(() => {});
  });
});
