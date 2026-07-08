import { test, expect, openHub } from '../fixtures/hub';

/**
 * KRS Hub — Smoke: In-App Lern-Coach (Overlay)
 *
 * Wie in Connect: isoliertes Overlay (Namespace .krsc-, LS-Key krs_coach_hub),
 * unabhängig vom React-State vor </body> eingehängt. 4 Hub-Schritte.
 * Läuft gegen die lokal servierte krs-hub/index.html (Demo-Modus).
 */
test.describe('KRS Hub — Lern-Coach Overlay', () => {
  test('FAB ist sichtbar und API vorhanden', async ({ page }) => {
    await openHub(page);
    const fab = page.locator('.krsc-fab');
    await expect(fab).toBeVisible({ timeout: 8_000 });
    const hasApi = await page.evaluate(() => typeof (window as any).KRSCoach === 'object');
    expect(hasApi).toBe(true);
  });

  test('Öffnen zeigt Panel mit 4 Schritten', async ({ page }) => {
    await openHub(page);
    await page.locator('.krsc-fab').click();
    await expect(page.locator('.krsc-panel.krsc-open')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.krsc-step')).toHaveCount(4);
  });

  test('Fortschritt wird gemerkt (localStorage)', async ({ page }) => {
    await openHub(page);
    await page.locator('.krsc-fab').click();
    await expect(page.locator('.krsc-panel.krsc-open')).toBeVisible();
    await page.locator('.krsc-step').first().locator('.krsc-toggle').click();
    await expect(page.locator('.krsc-fab .krsc-badge')).toContainText('1/4');
    const stored = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('krs_coach_hub') || '{}'); }
      catch { return {}; }
    });
    expect(stored.done && Object.values(stored.done).some(Boolean)).toBeTruthy();
  });

  test('Schließen per ESC funktioniert', async ({ page }) => {
    await openHub(page);
    await page.locator('.krsc-fab').click();
    await expect(page.locator('.krsc-panel.krsc-open')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.krsc-panel.krsc-open')).toHaveCount(0, { timeout: 3_000 });
  });

  test('FAB blendet sich aus, wenn alle Schritte erledigt', async ({ page }) => {
    await openHub(page);
    await page.locator('.krsc-fab').click();
    await expect(page.locator('.krsc-panel.krsc-open')).toBeVisible();
    const steps = page.locator('.krsc-step');
    const count = await steps.count();
    for (let i = 0; i < count; i++) {
      const toggle = steps.nth(i).locator('.krsc-toggle');
      if (await toggle.getAttribute('class').then(c => (c || '').includes('krsc-ok'))) {
        await toggle.click();
      }
    }
    await expect(page.locator('.krsc-fab')).toBeHidden({ timeout: 3_000 });
    await page.reload();
    await page.waitForFunction(() => typeof window.KRS_HUB_VERSION === 'string');
    await expect(page.locator('.krsc-fab')).toBeHidden({ timeout: 5_000 });
  });
});
