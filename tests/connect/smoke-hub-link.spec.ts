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

  // v4.16.0: Im Hub-iframe eingebettet ergibt der 🏠-Button keinen Sinn
  // (man ist ja schon im Hub). Da Playwright echtes cross-origin iframe-
  // Embedding nicht ohne Weiteres simulieren kann, setzen wir den Test-Hook
  // window.__krsIsEmbedded vor dem App-Start per addInitScript.
  test('Im Hub-Embed (__krsIsEmbedded) ist der Hub-Button ausgeblendet', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__krsIsEmbedded = true;
      try { localStorage.setItem('krs_onboarding_done', '1'); } catch (e) {}
    });
    const params = new URLSearchParams({ forceMode: 'demo', forceUser: 'nk' });
    await page.goto(`/index.html?${params.toString()}`);
    await page.waitForFunction(() => typeof (window as any).KRS_VERSION === 'string', null, { timeout: 10_000 });

    expect(await page.evaluate(() => (window as any).__krsIsEmbedded)).toBe(true);
    await expect(page.getByTestId('nav-hub')).toHaveCount(0);
  });
});
