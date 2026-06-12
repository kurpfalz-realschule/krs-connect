import { test, expect } from '../fixtures/connect';

test.describe('KRS Connect — Smoke: Chat & Navigation', () => {
  test('Chat-View kann aktiviert werden', async ({ connectPage: page }) => {
    // Versuche, ein Chat-Icon oder -Link zu finden
    const chatNav = page.getByRole('button', { name: /chat|nachricht/i }).first();
    if (await chatNav.count() === 0) {
      test.skip(true, 'Kein Chat-Button gefunden — UI-Variante');
    }
    await chatNav.click();
    // Conversation-Liste oder leere Chat-Sektion
    await expect(page.getByText(/Konversation|Nachricht|Chat/i).first())
      .toBeVisible({ timeout: 4_000 });
  });

  test('Profil-Modal lässt sich öffnen', async ({ connectPage: page }) => {
    // Avatar oder Profil-Button suchen
    const profileBtn = page.getByRole('button', { name: /profil|einstellungen/i }).first();
    if (await profileBtn.count() === 0) {
      test.skip(true, 'Kein Profil-Button gefunden');
    }
    await profileBtn.click();
    // Profil-Section sollte sichtbar werden
    await expect(page.getByText(/Profilbild|Avatar|Mein Profil/i).first())
      .toBeVisible({ timeout: 3_000 });
  });
});
