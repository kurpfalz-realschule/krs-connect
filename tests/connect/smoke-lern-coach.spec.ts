import { test, expect, openConnect } from '../fixtures/connect';

/**
 * KRS Connect — Smoke: In-App Lern-Coach (Overlay)
 *
 * Der Lern-Coach ist ein isoliertes Vanilla-JS-Overlay (Namespace .krsc-,
 * localStorage-Key krs_coach_connect), das unabhängig vom React-State vor
 * </body> eingehängt ist. Diese Tests sichern: Overlay lädt, öffnet, hat die
 * erwarteten Schritte, merkt Fortschritt und schließt wieder.
 */
test.describe('KRS Connect — Lern-Coach Overlay', () => {
  test('FAB ist sichtbar und API vorhanden', async ({ page }) => {
    await openConnect(page, { user: 'nk' });
    const fab = page.locator('.krsc-fab');
    await expect(fab).toBeVisible({ timeout: 8_000 });
    const hasApi = await page.evaluate(() => typeof (window as any).KRSCoach === 'object');
    expect(hasApi).toBe(true);
  });

  test('Öffnen zeigt Panel mit 5 Schritten', async ({ page }) => {
    await openConnect(page, { user: 'nk' });
    await page.locator('.krsc-fab').click();
    await expect(page.locator('.krsc-panel.krsc-open')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.krsc-step')).toHaveCount(5);
    // Erste erwartete Überschrift
    await expect(page.locator('.krsc-steptitle').first()).toContainText('Ankommen');
  });

  test('Fortschritt wird gemerkt (localStorage)', async ({ page }) => {
    await openConnect(page, { user: 'nk' });
    await page.locator('.krsc-fab').click();
    await expect(page.locator('.krsc-panel.krsc-open')).toBeVisible();
    // ersten Schritt als erledigt markieren
    await page.locator('.krsc-step').first().locator('.krsc-toggle').click();
    // Badge im FAB zeigt >=1
    await expect(page.locator('.krsc-fab .krsc-badge')).toContainText('1/5');
    const stored = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('krs_coach_connect') || '{}'); }
      catch { return {}; }
    });
    expect(stored.done && Object.values(stored.done).some(Boolean)).toBeTruthy();
  });

  test('Schließen per ESC funktioniert', async ({ page }) => {
    await openConnect(page, { user: 'nk' });
    await page.locator('.krsc-fab').click();
    await expect(page.locator('.krsc-panel.krsc-open')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.krsc-panel.krsc-open')).toHaveCount(0, { timeout: 3_000 });
  });

  test('FAB blendet sich aus, wenn alle Schritte erledigt', async ({ page }) => {
    await openConnect(page, { user: 'nk' });
    await page.locator('.krsc-fab').click();
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
    // FAB ist jetzt ausgeblendet
    await expect(page.locator('.krsc-fab')).toBeHidden({ timeout: 3_000 });
    // Nach Reload bleibt er ausgeblendet (Fortschritt gemerkt)
    await page.reload();
    await page.waitForFunction(() => typeof window.KRS_VERSION === 'string');
    await expect(page.locator('.krsc-fab')).toBeHidden({ timeout: 5_000 });
  });
});
