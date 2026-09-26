import { test, expect } from '@playwright/test';
import { openConnect } from '../fixtures/connect';

// H-7b (4.44.0): Lehrkraft mit mehreren Vornamen kann nur den Rufnamen anzeigen lassen.
// Demo-Persona 'tr' heisst "Tim Robin R.". Der Server prueft dieselbe Regel (krs_name_change_ok).
test.describe('Rufname kuerzen (Profil)', () => {
  test('zweiten Vornamen abwaehlen → Name ohne Zweitnamen', async ({ page }) => {
    await openConnect(page, { user: 'tr' });
    await page.locator('button[title="Profil"]').first().click();
    await page.getByTestId('rufname-open').click();
    const teile = page.getByTestId('rufname-teil');
    await expect(teile).toHaveCount(3);
    await expect(teile.nth(2)).toBeDisabled();           // Nachname bleibt
    await teile.nth(1).click();                           // "Robin" abwaehlen
    await page.getByTestId('rufname-save').click();
    await expect(page.getByText('Name geändert: Tim R.')).toBeVisible({ timeout: 4000 });
  });
  test('alle Vornamen weg geht nicht (Speichern gesperrt)', async ({ page }) => {
    await openConnect(page, { user: 'tr' });
    await page.locator('button[title="Profil"]').first().click();
    await page.getByTestId('rufname-open').click();
    const teile = page.getByTestId('rufname-teil');
    await teile.nth(0).click(); await teile.nth(1).click();
    await expect(page.getByTestId('rufname-save')).toBeDisabled();
  });
  test('Zweiteilige Namen sehen keinen Knopf', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    await page.locator('button[title="Profil"]').first().click();
    await expect(page.getByRole('button', { name: /abmelden/i }).first()).toBeVisible();
    await expect(page.getByTestId('rufname-open')).toHaveCount(0);
  });
});
