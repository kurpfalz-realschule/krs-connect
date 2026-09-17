import { test, expect, openConnect } from '../fixtures/connect';

/**
 * KRS Connect — Smoke: In-App Lern-Coach (Overlay)
 *
 * Der Lern-Coach ist ein isoliertes Vanilla-JS-Overlay (Namespace .krsc-,
 * localStorage-Key krs_coach_connect), das unabhängig vom React-State vor
 * </body> eingehängt ist. Diese Tests sichern: Overlay lädt, öffnet, hat die
 * erwarteten Schritte, merkt Fortschritt und schließt wieder.
 *
 * v4.23.3: Der schwebende FAB wurde vollständig entfernt. Einstieg ist nur
 * noch bewusst über „❓ Hilfe → 🎓 Lern-Coach (Tutorials)" möglich.
 */
test.describe('KRS Connect — Lern-Coach Overlay', () => {
  test('v4.23.3: schwebender Lernen-Knopf ist vollständig entfernt, API ist da', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    const hasApi = await page.evaluate(() => typeof (window as any).KRSCoach === 'object');
    expect(hasApi).toBe(true);
    await expect(page.locator('.krsc-fab')).toHaveCount(0);
  });

  test('Öffnen zeigt Panel mit 5 Schritten', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    await page.evaluate(() => (window as any).KRSCoach.open());
    await expect(page.locator('.krsc-panel.krsc-open')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.krsc-step')).toHaveCount(5);
    // Erste erwartete Überschrift
    await expect(page.locator('.krsc-steptitle').first()).toContainText('Ankommen');
  });

  test('Fortschritt wird gemerkt (localStorage)', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    await page.evaluate(() => (window as any).KRSCoach.open());
    await expect(page.locator('.krsc-panel.krsc-open')).toBeVisible();
    // ersten Schritt als erledigt markieren
    await page.locator('.krsc-step').first().locator('.krsc-toggle').click();
    const stored = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('krs_coach_connect') || '{}'); }
      catch { return {}; }
    });
    expect(stored.done && Object.values(stored.done).some(Boolean)).toBeTruthy();
  });

  test('Schließen per ESC funktioniert', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    await page.evaluate(() => (window as any).KRSCoach.open());
    await expect(page.locator('.krsc-panel.krsc-open')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.krsc-panel.krsc-open')).toHaveCount(0, { timeout: 3_000 });
  });

  test('Fortschritt bleibt nach allen Schritten und einem Reload erhalten', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    await page.evaluate(() => (window as any).KRSCoach.open());
    await expect(page.locator('.krsc-panel.krsc-open')).toBeVisible();
    // alle Schritte als erledigt markieren
    const steps = page.locator('.krsc-step');
    const count = await steps.count();
    for (let i = 0; i < count; i++) {
      const toggle = steps.nth(i).locator('.krsc-toggle');
      if (await toggle.getAttribute('class').then(c => (c || '').includes('krsc-ok'))) {
        await toggle.click();
      }
    }
    const storedBeforeReload = await page.evaluate(() => JSON.parse(localStorage.getItem('krs_coach_connect') || '{}'));
    expect(Object.values(storedBeforeReload.done || {}).filter(Boolean)).toHaveLength(5);
    await page.reload();
    await page.waitForFunction(() => typeof window.KRS_VERSION === 'string');
    await expect(page.locator('.krsc-fab')).toHaveCount(0);
    const storedAfterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('krs_coach_connect') || '{}'));
    expect(Object.values(storedAfterReload.done || {}).filter(Boolean)).toHaveLength(5);
  });
});
