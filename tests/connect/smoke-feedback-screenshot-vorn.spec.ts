import { test, expect, openConnect } from '../fixtures/connect';
import type { Page } from '@playwright/test';

/**
 * 4.59.1 — Screenshot im Feedback-Board öffnet sich VOR dem Board.
 * Vorher: Vorschau .fv-overlay auf z-index 9000, Board .feedback-overlay auf 9998
 * → die Vorschau lag unsichtbar hinter dem Board.
 */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const boardDialog = (page: Page) => page.getByRole('dialog', { name: /Feedback-Board/ });

test('Klick auf Screenshot im Board: Vorschau liegt oben, Escape schließt nur sie', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await page.addInitScript(() => { try { localStorage.setItem('krs_design_v2', '1'); } catch (e) {} });
  await openConnect(page, { user: 'la' });
  // Demo-Eintrag mit Screenshot anlegen (gemeinsamer Demo-Speicher).
  await page.evaluate(async (img) => {
    const ds = new (window as any).DataService(null);
    await ds.submitFeedback({ userId: 1, name: 'Test Werner', category: 'bug', message: 'Mit Screenshot', imageUrl: img });
  }, PNG);
  await page.getByText('‹ Teams', { exact: true }).first().click();
  await page.locator('[data-testid="list-tool-feedback"]:visible').first().click();
  await expect(boardDialog(page)).toBeVisible();

  const shot = boardDialog(page).getByAltText('Screenshot zum Feedback').first();
  await expect(shot).toBeVisible();
  await shot.click();

  const viewer = page.locator('.fv-overlay');
  await expect(viewer).toBeVisible();
  // Was in der Bildschirmmitte SICHTBAR oben liegt, gehört zur Vorschau, nicht
  // zum Board. Die Vorschau setzt den Rest der App `inert`; elementFromPoint
  // überspringt inerte Elemente und sähe ein darüberliegendes Board nicht.
  // Darum `inert` für die Messung kurz entfernen (echte Malreihenfolge).
  const oben = await page.evaluate(() => {
    const inert = Array.from(document.querySelectorAll('[inert]'));
    inert.forEach((el) => el.removeAttribute('inert'));
    const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    inert.forEach((x) => x.setAttribute('inert', ''));
    return { imViewer: !!el?.closest('.fv-overlay'), imBoard: !!el?.closest('.feedback-overlay') };
  });
  expect(oben).toEqual({ imViewer: true, imBoard: false });
  // „‹ Zurück“ ist klickbar (nicht verdeckt).
  await page.getByTestId('fv-back').click();
  await expect(viewer).toHaveCount(0);
  await expect(boardDialog(page)).toBeVisible();

  // Escape schließt nur die Vorschau, das Board bleibt offen.
  await shot.click();
  await expect(viewer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  await expect(boardDialog(page)).toBeVisible();
});

test('Rechner, vertrautes Design: Screenshot im Board öffnet sich vor dem Board', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openConnect(page, { user: 'la' });
  await page.evaluate(async (img) => {
    const ds = new (window as any).DataService(null);
    await ds.submitFeedback({ userId: 1, name: 'Test Werner', category: 'bug', message: 'Mit Screenshot', imageUrl: img });
  }, PNG);
  const beta = page.locator('.beta-feedback-btn:visible').first();
  if (await beta.count() === 0) test.skip(true, 'Beta-Feedback-Button nicht sichtbar — UI-Variante');
  await beta.click();
  await expect(boardDialog(page)).toBeVisible();
  await boardDialog(page).getByAltText('Screenshot zum Feedback').first().click();
  await expect(page.locator('.fv-overlay')).toBeVisible();
  const z = await page.evaluate(() => ({
    viewer: Number(getComputedStyle(document.querySelector('.fv-overlay')!).zIndex),
    board: Number(getComputedStyle(document.querySelector('.feedback-overlay')!).zIndex),
  }));
  expect(z.viewer).toBeGreaterThan(z.board);
  const oben = await page.evaluate(() => {
    const inert = Array.from(document.querySelectorAll('[inert]'));
    inert.forEach((el) => el.removeAttribute('inert'));
    const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    inert.forEach((x) => x.setAttribute('inert', ''));
    return !!el?.closest('.fv-overlay');
  });
  expect(oben).toBe(true);
});
