import { test, expect, openConnect } from '../fixtures/connect';

/**
 * Connect: Sidebar-Link „Notizen & Aufgaben".
 * Öffnet das persönliche Notizen-Modul (krs-hub/notizen) in neuem Tab —
 * gleiche Origin, daher geteilte Supabase-Session. Hier nur Presence-Check.
 */
test.describe('KRS Connect — Notizen-Link', () => {
  test('Sidebar zeigt Notizen-Eintrag', async ({ page }) => {
    await openConnect(page, { user: 'nk' });
    const nav = page.getByTestId('nav-notizen');
    await expect(nav).toBeVisible({ timeout: 8_000 });
    await expect(nav).toHaveAttribute('aria-label', 'Notizen & Aufgaben');
  });
});
