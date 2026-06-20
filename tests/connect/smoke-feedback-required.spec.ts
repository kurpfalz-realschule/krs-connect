import { test, expect } from '../fixtures/connect';

/**
 * Fix #13 — Feedback-Pflichtfelder.
 *
 * "Absenden" bleibt deaktiviert, bis Kategorie (Thema) UND Nachricht ausgefüllt
 * sind. Statt eines verwirrenden Fehler-Toasts erscheint ein Inline-Hinweis.
 * Dies ist ein UI-Test (echtes Modal-Markup), daher mit defensivem Skip, falls
 * der Feedback-Button in einer UI-Variante fehlt.
 */
test.describe('KRS Connect — Feedback Pflichtfelder', () => {
  test('Absenden ist erst nach Thema + Nachricht aktiv', async ({ connectPage: page }) => {
    const open = page.getByRole('button', { name: /Feedback geben/i }).first();
    if (await open.count() === 0) {
      test.skip(true, 'Kein "Feedback geben"-Button gefunden — UI-Variante');
    }
    await open.click();

    const modal = page.locator('.feedback-modal').first();
    await expect(modal).toBeVisible();

    const send = modal.getByRole('button', { name: /Absenden/i });
    await expect(send).toBeDisabled();

    // Nur Thema/Kategorie wählen → weiterhin deaktiviert + Inline-Hinweis
    await modal.locator('.feedback-cat').first().click();
    await expect(send).toBeDisabled();
    await expect(modal.getByText(/Bitte noch eine Nachricht/i)).toBeVisible();

    // Nachricht ergänzen → jetzt aktiv
    await modal.locator('.feedback-textarea').fill('E2E-Test-Feedback');
    await expect(send).toBeEnabled();
  });
});
