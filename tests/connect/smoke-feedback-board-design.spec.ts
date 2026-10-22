import { test, expect, openConnect } from '../fixtures/connect';
import type { Page } from '@playwright/test';

/**
 * 4.59.2 — Feedback-Board sieht im neuen Design wie das neue Design aus.
 * Vorher war das Board in beiden Designs pixelgleich (Rückmeldung Norbert,
 * 22.10.2026: „Feedback-Board sehe ich immer nur im alten Design“).
 * Geprüft wird an berechneten Stilen, die es nur im neuen Design gibt.
 */
const boardDialog = (page: Page) => page.getByRole('dialog', { name: /Feedback-Board/ });

async function openBoard(page: Page, design: '0' | '1', width: number, height: number, user = 'la') {
  await page.setViewportSize({ width, height });
  await page.addInitScript((d) => { try { localStorage.setItem('krs_design_v2', d); } catch (e) {} }, design);
  await openConnect(page, { user });
  // Weg ins Board ist in anderen Tests geprüft; hier zählt nur, wie es aussieht.
  await page.evaluate(() => (document.querySelector('[aria-label="Feedback-Board öffnen"]') as HTMLElement).click());
  await expect(boardDialog(page)).toBeVisible();
  await expect(page.locator('.fb-item').first()).toBeVisible();
}

const styles = (page: Page) => page.evaluate(() => {
  const cs = (sel: string) => getComputedStyle(document.querySelector(sel) as Element);
  const modal = (document.querySelector('.fb-board-modal') as HTMLElement).getBoundingClientRect();
  const active = cs('.fb-board-filter.active');
  return {
    titleBorder: cs('.fb-board-modal > .feedback-title').borderBottomWidth,
    itemRadius: cs('.fb-item').borderTopLeftRadius,
    itemTopBorder: cs('.fb-item').borderTopWidth,
    activeBg: active.backgroundColor,
    filterHeight: (document.querySelector('.fb-board-filter') as HTMLElement).getBoundingClientRect().height,
    modal: { w: modal.width, h: modal.height },
    vw: innerWidth, vh: innerHeight,
    querscroll: document.documentElement.scrollWidth > innerWidth + 2,
  };
});

test('Rechner, neues Design: Kopfzeile mit Linie, Liste statt Karten, aktiver Filter hellblau', async ({ page }) => {
  await openBoard(page, '1', 1280, 800, 'admin');
  const s = await styles(page);
  expect(s.titleBorder).toBe('1px');
  expect(s.itemTopBorder).toBe('0px');
  expect(s.itemRadius).toBe('0px');
  expect(s.activeBg).toBe('rgb(231, 239, 255)');
  expect(s.filterHeight).toBeGreaterThanOrEqual(44);
  expect(s.modal.w).toBeLessThanOrEqual(760);
});

test('Handy, neues Design: Board füllt den Bildschirm, kein Querscrollen, Filter 2×2', async ({ page }) => {
  for (const [w, h] of [[320, 640], [390, 844]]) {
    await openBoard(page, '1', w, h);
    const s = await styles(page);
    expect(Math.round(s.modal.w)).toBe(s.vw);
    expect(Math.round(s.modal.h)).toBe(s.vh);
    expect(s.querscroll).toBe(false);
    const cols = await page.evaluate(() => getComputedStyle(document.querySelector('.fb-board-toolbar') as Element).gridTemplateColumns.split(' ').length);
    expect(cols).toBe(2);
    // „Feedback schreiben“ über die ganze Breite, nicht abgeschnitten
    const nb = await page.locator('.fb-board-new').boundingBox();
    expect(nb!.x).toBeGreaterThanOrEqual(0);
    expect(nb!.x + nb!.width).toBeLessThanOrEqual(w);
  }
});

test('Vertrautes Design: Board unverändert (Karten mit Rahmen, Pillen-Filter)', async ({ page }) => {
  await openBoard(page, '0', 1280, 800);
  const s = await styles(page);
  expect(s.itemTopBorder).toBe('1px');
  expect(s.itemRadius).not.toBe('0px');
  expect(s.titleBorder).toBe('0px');
  expect(s.activeBg).not.toBe('rgb(231, 239, 255)');
});
