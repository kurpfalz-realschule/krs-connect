import { test, expect, HUB_PATH } from '../fixtures/hub';
import { Page } from '@playwright/test';

/**
 * Hub-Admin: Passwort für Kollege zurücksetzen (Temp-Passwort).
 *
 * UI-Verhalten im Demo-Modus (forceMode=demo). Die eigentliche
 * service_role-Aktion liegt in der Edge Function `dashboard-admin`
 * (action: 'reset_password') und wird live geprüft. Im Demo liefert
 * AdminService.resetPassword ein simuliertes Temp-Passwort.
 */
async function openAdmin(page: Page, kuerzel: string) {
  await page.goto(`${HUB_PATH}?forceMode=demo&forceUser=${kuerzel}`);
  await page.waitForFunction(() => typeof (window as any).KRS_HUB_VERSION === 'string', null, { timeout: 10_000 });
  await page.getByTestId('sidebar-admin').click();
  await expect(page.getByTestId('admin-tab-lehrer')).toBeVisible();
}

test.describe('KRS Hub — Admin: Passwort zurücksetzen', () => {
  test('Reset-Button je Lehrkraft vorhanden', async ({ page }) => {
    await openAdmin(page, 'Ko');
    await expect(page.getByTestId('lehrer-resetpw').first()).toBeVisible({ timeout: 6_000 });
  });

  test('Klick erzeugt Temp-Passwort-Dialog', async ({ page }) => {
    await openAdmin(page, 'Ko');
    // window.confirm automatisch bestätigen
    page.on('dialog', (d) => d.accept());
    await page.getByTestId('lehrer-resetpw').first().click();
    await expect(page.getByTestId('pw-result')).toBeVisible({ timeout: 5_000 });
    const temp = page.getByTestId('pw-temp');
    await expect(temp).toBeVisible();
    // Temp-Passwort ist nicht leer und hat das KRS-Muster
    await expect(temp).toContainText(/Krs-/);
  });

  test('Dialog lässt sich schließen', async ({ page }) => {
    await openAdmin(page, 'Ko');
    page.on('dialog', (d) => d.accept());
    await page.getByTestId('lehrer-resetpw').first().click();
    await expect(page.getByTestId('pw-result')).toBeVisible();
    await page.getByRole('button', { name: 'Schließen' }).click();
    await expect(page.getByTestId('pw-result')).toHaveCount(0, { timeout: 3_000 });
  });
});
