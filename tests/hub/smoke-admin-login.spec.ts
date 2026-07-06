import { test, expect, HUB_PATH } from '../fixtures/hub';
import { Page } from '@playwright/test';

/**
 * Hub-Admin: Login-Auth statt PIN (dashboard-admin v5, 2026-07-06)
 *
 * Das Admin-Panel wird nur für role='admin' gerendert und autorisiert
 * serverseitig per Login-JWT — KEIN PIN mehr. Hier: UI-Verhalten im
 * Demo-Modus (forceMode=demo). Die eigentliche JWT-Autorisierung liegt
 * in der Edge Function und wird live geprüft.
 */
async function openHubAs(page: Page, kuerzel: string) {
  await page.goto(`${HUB_PATH}?forceMode=demo&forceUser=${kuerzel}`);
  await page.waitForFunction(
    () => typeof (window as any).KRS_HUB_VERSION === 'string',
    null,
    { timeout: 10_000 },
  );
}

test.describe('KRS Hub — Admin-Panel: Login statt PIN', () => {

  test('Admin öffnet Panel OHNE PIN-Abfrage', async ({ page }) => {
    await openHubAs(page, 'Ko');
    // Admin-Einstieg (Sidebar) ist für Admins sichtbar
    const adminBtn = page.getByTestId('sidebar-admin');
    await expect(adminBtn).toBeVisible();
    await adminBtn.click();
    // Panel offen …
    await expect(page.getByTestId('admin-panel')).toBeVisible();
    // … und KEIN PIN-Feld / Entsperren-Button mehr
    await expect(page.getByTestId('admin-pin')).toHaveCount(0);
    await expect(page.getByTestId('admin-unlock')).toHaveCount(0);
    // Tabs sind direkt da
    await expect(page.getByTestId('admin-tab-lehrer')).toBeVisible();
  });

  test('Lehrkräfte-Liste lädt direkt (Demo-Store, kein PIN-Gate)', async ({ page }) => {
    await openHubAs(page, 'Ko');
    await page.getByTestId('sidebar-admin').click();
    await expect(page.getByTestId('admin-tab-lehrer')).toBeVisible();
    // Demo-Kollegium erscheint ohne Entsperren
    await expect(page.getByTestId('admin-panel')).toContainText(/Lehrkraft|Demo/);
  });
});
