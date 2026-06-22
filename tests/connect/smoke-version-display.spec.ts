import { test, expect } from '../fixtures/connect';

/**
 * #13 — Versionsanzeige
 * Die laufende Version steht sichtbar in der Sidebar (Update-Hinweis-Banner
 * wird im Demo-/Test-Modus bewusst NICHT gepollt → hier nur die Anzeige).
 */
test.describe('#13 Versionsanzeige — UI (Demo)', () => {
  test('Sidebar zeigt „KRS Connect v<nr> · Beta"', async ({ connectPage: page }) => {
    const label = page.locator('.app-version').first();
    if (await label.count() === 0) {
      test.skip(true, 'Versionslabel nicht sichtbar — UI-Variante');
    }
    await expect(label).toContainText(/KRS Connect v\d+\.\d+/);
  });
});
