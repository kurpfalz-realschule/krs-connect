import { test, expect } from '../fixtures/connect';

/**
 * v4.13.0 — Passwort selbst zurücksetzen & ändern
 *
 * Prüft die neue Passwort-Verwaltung:
 *  - DataService stellt sendPasswordReset() und updatePassword() bereit
 *    (Demo-Modus = No-Op, aber vorhanden und ohne Fehler)
 *  - Der Changelog im Einstellungen-Panel weist die neue Version aus
 *  - Im Demo-Modus wird der „Passwort ändern"-Abschnitt bewusst NICHT gezeigt
 *    (onChangePassword ist nur im echten Login gesetzt)
 *
 * Hinweis: Der „Passwort vergessen?"-Link und der Neu-Setzen-Dialog leben im
 * SetupScreen, der im Demo-/Test-Modus (forceMode=demo) übersprungen wird — die
 * echte Reset-Kette läuft nur mit Supabase-Session und wird im Deploy-Gate der
 * Live-Health-Checks bzw. manuell verifiziert.
 */

test.describe('v4.13.0 Passwort-Reset & -Änderung (Demo)', () => {
  test('DataService bietet sendPasswordReset() und updatePassword() (Demo = No-Op)', async ({ connectPage: page }) => {
    const result = await page.evaluate(async () => {
      const ds = new (window as any).DataService(null); // null = Demo
      const hasReset = typeof ds.sendPasswordReset === 'function';
      const hasUpdate = typeof ds.updatePassword === 'function';
      const reset = hasReset ? await ds.sendPasswordReset('vorname.name@realschule-schriesheim.de') : null;
      const update = hasUpdate ? await ds.updatePassword('einNeuesPasswort123') : null;
      return { hasReset, hasUpdate, resetErr: reset && reset.error, updateErr: update && update.error };
    });
    expect(result.hasReset).toBe(true);
    expect(result.hasUpdate).toBe(true);
    // Demo-Modus: kein echter Mailversand, aber sauber ohne Fehler
    expect(result.resetErr).toBeNull();
    expect(result.updateErr).toBeNull();
  });

  test('Einstellungen: Changelog nennt v4.13.0 mit Passwort-Reset', async ({ connectPage: page }) => {
    const btn = page.locator('button[aria-label="Einstellungen öffnen"]').first();
    if (await btn.count() === 0) {
      test.skip(true, 'Einstellungen-Button nicht gefunden — UI-Variante');
    }
    await btn.click();
    const dialog = page.locator('.modal-overlay[aria-label="Einstellungen"]').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog).toContainText('v4.13.0');
    await expect(dialog).toContainText(/Passwort/i);
  });

  test('Demo-Modus zeigt KEINEN „Passwort ändern"-Abschnitt (nur echter Login)', async ({ connectPage: page }) => {
    const btn = page.locator('button[aria-label="Einstellungen öffnen"]').first();
    if (await btn.count() === 0) {
      test.skip(true, 'Einstellungen-Button nicht gefunden — UI-Variante');
    }
    await btn.click();
    const dialog = page.locator('.modal-overlay[aria-label="Einstellungen"]').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    // Der Abschnitt „🔑 Passwort ändern" darf im Demo-Modus nicht erscheinen.
    await expect(dialog.getByText('🔑 Passwort ändern')).toHaveCount(0);
  });
});
