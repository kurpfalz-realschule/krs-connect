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
    await openConnect(page, { user: 'la' });
    const nav = page.getByTestId('nav-hub');
    await expect(nav).toBeVisible({ timeout: 8_000 });
    await expect(nav).toHaveAttribute('aria-label', 'Zurück zum KRS Hub');
    await expect(nav).toHaveAttribute('title', 'Zurück zum KRS Hub');
  });

  test('Hub-URL-Konstante zeigt auf krs-hub (Origin-Check)', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    const hubUrl = await page.evaluate(() => (window as any).KRS_HUB_URL);
    expect(hubUrl).toBe('https://kurpfalz-realschule.github.io/krs-hub/');
  });

  // v4.16.0 hatte den 🏠-Button im Hub-iframe ausgeblendet — man war ja schon
  // im Hub und sah dessen Leiste daneben. Seit **Hub v3.20.0 / Connect v4.28.0**
  // gilt das Gegenteil: der Hub blendet seine eigene Leiste aus, solange Connect
  // läuft (vorher standen zwei senkrechte Leisten nebeneinander). Damit ist das
  // Haus in Connects Leiste der sichtbare Rückweg — eingebettet schickt es
  // `KRS_HUB_NAVIGATE` an die Hülle, statt den Hub in den iframe zu laden.
  // Test-Hook `window.__krsIsEmbedded` wie gehabt per addInitScript.
  test('Im Hub-Embed führt der Hub-Button per Nachricht zurück (statt zu navigieren)', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__krsIsEmbedded = true;
      try { localStorage.setItem('krs_onboarding_done', '1'); } catch (e) {}
    });
    const params = new URLSearchParams({ forceMode: 'demo', forceUser: 'la' });
    await page.goto(`/index.html?${params.toString()}`);
    await page.waitForFunction(() => typeof (window as any).KRS_VERSION === 'string', null, { timeout: 10_000 });

    expect(await page.evaluate(() => (window as any).__krsIsEmbedded)).toBe(true);
    await expect(page.getByTestId('nav-hub')).toBeVisible({ timeout: 8_000 });

    // Klick schickt eine postMessage an die Hülle und navigiert NICHT.
    const nachricht = await page.evaluate(async () => {
      const w = window as any;
      const vorher = location.href;
      return await new Promise<string>((fertig) => {
        w.parent.postMessage = (daten: any) => fertig(JSON.stringify(daten));
        (document.querySelector('[data-testid="nav-hub"]') as HTMLElement)?.click();
        setTimeout(() => fertig(location.href === vorher ? 'keine Nachricht' : 'navigiert!'), 800);
      });
    });
    expect(nachricht).toContain('KRS_HUB_NAVIGATE');
  });
});
