import { test, expect } from '../fixtures/connect';

/**
 * #15 — Mehrere Teams gleichzeitig löschen (Aufräum-Modus, nur globaler Admin).
 * nk ist im Demo globaler Admin → 🧹-Button im Teams-Header öffnet den Dialog.
 */
test.describe('#15 Teams aufräumen — UI (Demo)', () => {
  test('🧹-Button öffnet Bulk-Löschen-Dialog mit Auswahl', async ({ connectPage: page }) => {
    const cleanupBtn = page.getByRole('button', { name: /Teams aufräumen/ }).first();
    if (await cleanupBtn.count() === 0) {
      test.skip(true, 'Aufräum-Button nicht sichtbar — UI-Variante / kein Admin');
    }
    await cleanupBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Teams aufräumen')).toBeVisible({ timeout: 6_000 });
    // Mindestens eine auswählbare Team-Checkbox
    await expect(dialog.locator('input[type=checkbox]').first()).toBeVisible({ timeout: 4_000 });
    // Löschen-Button ist ohne Auswahl deaktiviert
    const delBtn = dialog.getByRole('button', { name: /Ausgewählte löschen/ });
    await expect(delBtn).toBeDisabled();
  });
});
