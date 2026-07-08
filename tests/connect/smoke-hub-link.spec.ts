import { test, expect, openConnect } from '../fixtures/connect';

/**
 * Connect: Sidebar-Link „Zurück zum Hub" (v4.14.0).
 * Bringt Nutzer:innen von Connect zurück zu KRS Hub — gleiche Origin
 * (kurpfalz-realschule.github.io), daher geteilte Supabase-Session.
 * Navigation im selben Tab (kein neuer Tab), da die App verlassen wird.
 *
 * Hinweis: Wir klicken den Button NICHT wirklich (das würde eine echte
 * Navigation auf eine Live-URL auslösen und den Test unhermetisch machen).
 * Stattdessen prüfen wir Sichtbarkeit/Label hier und die Ziel-Konstante
 * window.KRS_HUB_URL separat.
 */
test.describe('KRS Connect — Hub-Link', () => {
  test('Sidebar zeigt Hub-Eintrag ganz oben', async ({ page }) => {
    await openConnect(page, { user: 'nk' });
    const nav = page.getByTestId('nav-hub');
    await expect(nav).toBeVisible({ timeout: 8_000 });
    await expect(nav).toHaveAttribute('aria-label', 'Zurück zum KRS Hub');
    await expect(nav).toHaveAttribute('title', 'Zurück zum KRS Hub');
  });

  test('Hub-URL-Konstante zeigt auf krs-hub (Origin-Check)', async ({ page }) => {
    await openConnect(page, { user: 'nk' });
    const hubUrl = await page.evaluate(() => (window as any).KRS_HUB_URL);
    expect(hubUrl).toBe('https://kurpfalz-realschule.github.io/krs-hub/');
  });
});
