import { test, expect, openConnect } from '../fixtures/connect';
import type { Page } from '@playwright/test';

/**
 * 4.59.0 — Neues Design ist Standard; Feedback-Board im neuen Design erreichbar.
 */
async function openRaw(page: Page, design: string | null) {
  await page.addInitScript((d) => {
    try {
      localStorage.setItem('krs_onboarding_done', '1');
      if (d === null) localStorage.removeItem('krs_design_v2'); else localStorage.setItem('krs_design_v2', d);
    } catch (e) {}
  }, design);
  await page.goto('/index.html?forceMode=demo&forceUser=la');
  await page.waitForFunction(() => typeof (window as any).KRS_VERSION === 'string');
}
const boardDialog = (page: Page) => page.getByRole('dialog', { name: /Feedback-Board/ });

test('Ohne eigene Wahl: neues Design an', async ({ page }) => {
  await openRaw(page, null);
  await expect(page.locator('html')).toHaveClass(/krs-design-v2/);
});

test('Selbst ausgeschaltet (0): vertrautes Design bleibt', async ({ page }) => {
  await openRaw(page, '0');
  await expect(page.locator('html')).not.toHaveClass(/krs-design-v2/);
});

test('Handy, neues Design: „Feedback“ in der Liste öffnet das Board', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await page.addInitScript(() => { try { localStorage.setItem('krs_design_v2', '1'); } catch (e) {} });
  await openConnect(page, { user: 'la' });
  // Connect startet im Kanal; die Liste kommt über „‹ Teams“.
  await page.getByText('‹ Teams', { exact: true }).first().click();
  const btn = page.locator('[data-testid="list-tool-feedback"]:visible').first();
  await expect(btn).toBeVisible();
  // Vier Knöpfe passen nebeneinander, ohne Querscrollen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2)).toBe(false);
  await btn.click();
  await expect(boardDialog(page)).toBeVisible();
});

test('Im Hub eingebettet, Rechner, neues Design: „Feedback-Board“ öffnet das Board', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    (window as any).__krsIsEmbedded = true;
    try { localStorage.setItem('krs_design_v2', '1'); } catch (e) {}
  });
  await openConnect(page, { user: 'la' });
  // Im echten Hub setzt krs-design.js diese Klasse nach dem Handschlag.
  await page.evaluate(() => document.documentElement.classList.add('krs-design-embedded'));
  const btn = page.getByTestId('design-feedback-board').first();
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(boardDialog(page)).toBeVisible();
});
