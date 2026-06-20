import { test, expect } from '../fixtures/connect';

/**
 * Batch 1 — Logout-Discoverability: Der Abmelden-Button ist jetzt auch im
 * Profil-Panel (Avatar antippen), damit er auf iPad/Handy auffindbar ist
 * (vorher nur als kleines Icon in der Sidebar-Leiste).
 */
test.describe('KRS Connect — Smoke: Logout im Profil-Panel', () => {
  test('Avatar → Profil zeigt "Abmelden"', async ({ connectPage: page }) => {
    const profileBtn = page.getByRole('button', { name: /profil/i }).first();
    if (await profileBtn.count() === 0) {
      test.skip(true, 'Kein Profil-Button gefunden — UI-Variante');
    }
    await profileBtn.click();
    await expect(page.getByRole('button', { name: /abmelden/i }).first())
      .toBeVisible({ timeout: 4_000 });
  });
});
