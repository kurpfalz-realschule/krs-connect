import { test, expect } from '../fixtures/connect';
import type { Page } from '@playwright/test';

const REMOTE_VERSION = '9.0.0';

test.use({ serviceWorkers: 'block' });

async function prepare(page: Page, remoteVersion: string) {
  await page.addInitScript(() => {
    (window as any).__krsTestNow = 1_000_000;
    Date.now = () => (window as any).__krsTestNow;
  });
  await page.route('**/index.html?*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `window.KRS_VERSION = '${remoteVersion}';`,
    });
  });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof (window as any).KRS_VERSION === 'string');
}

async function visibility(page: Page, state: 'hidden' | 'visible', advanceMs = 0) {
  await page.evaluate(({ state, advanceMs }) => {
    (window as any).__krsTestNow += advanceMs;
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, { state, advanceMs });
}

test.describe('KRS Connect — automatische Aktualisierung', () => {
  test('neuere Version lädt nach 60 Sekunden im Hintergrund automatisch', async ({ page }) => {
    let loads = 0;
    page.on('load', () => { loads += 1; });
    await prepare(page, REMOTE_VERSION);
    await visibility(page, 'hidden');
    await visibility(page, 'visible', 60_001);
    await expect.poll(() => loads).toBe(2);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('krs_autoreload_for'))).toBe(REMOTE_VERSION);
  });

  test('Text im Composer verhindert Reload und zeigt das Banner', async ({ page }) => {
    let loads = 0;
    page.on('load', () => { loads += 1; });
    await prepare(page, REMOTE_VERSION);
    await page.evaluate(() => {
      const composer = document.createElement('textarea');
      composer.className = 'rich-editor';
      composer.value = 'Mein noch nicht gesendeter Text';
      document.body.appendChild(composer);
    });
    await visibility(page, 'hidden');
    await visibility(page, 'visible', 60_001);
    await expect(page.getByTestId('update-banner')).toBeVisible();
    expect(loads).toBe(1);
  });

  test('offener Dialog verhindert den automatischen Reload', async ({ page }) => {
    let loads = 0;
    page.on('load', () => { loads += 1; });
    await prepare(page, REMOTE_VERSION);
    await page.evaluate(() => {
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      document.body.appendChild(dialog);
    });
    await visibility(page, 'hidden');
    await visibility(page, 'visible', 60_001);
    await expect(page.getByTestId('update-banner')).toBeVisible();
    expect(loads).toBe(1);
  });

  test('laufender Upload verhindert den automatischen Reload', async ({ page }) => {
    let loads = 0;
    page.on('load', () => { loads += 1; });
    await prepare(page, REMOTE_VERSION);
    await page.evaluate(() => { (window as any).__krsActiveUploads = 1; });
    await visibility(page, 'hidden');
    await visibility(page, 'visible', 60_001);
    await expect(page.getByTestId('update-banner')).toBeVisible();
    expect(loads).toBe(1);
  });

  test('gleiche Remote-Version zeigt kein Banner und lädt nicht neu', async ({ page }) => {
    let loads = 0;
    page.on('load', () => { loads += 1; });
    await prepare(page, '4.30.0');
    await visibility(page, 'hidden');
    await visibility(page, 'visible', 60_001);
    await expect(page.getByTestId('update-banner')).toHaveCount(0);
    expect(loads).toBe(1);
  });

  test('nur fünf Sekunden im Hintergrund lösen keinen Reload aus', async ({ page }) => {
    let loads = 0;
    page.on('load', () => { loads += 1; });
    await prepare(page, REMOTE_VERSION);
    await visibility(page, 'hidden');
    await visibility(page, 'visible', 5_000);
    await expect(page.getByTestId('update-banner')).toBeVisible();
    expect(loads).toBe(1);
  });

  test('dieselbe alte Version lädt nach dem ersten Reload nicht erneut', async ({ page }) => {
    let loads = 0;
    page.on('load', () => { loads += 1; });
    await prepare(page, REMOTE_VERSION);
    await visibility(page, 'hidden');
    await visibility(page, 'visible', 60_001);
    await expect.poll(() => loads).toBe(2);
    await page.waitForFunction(() => typeof (window as any).KRS_VERSION === 'string');
    await visibility(page, 'hidden');
    await visibility(page, 'visible', 60_001);
    await expect(page.getByTestId('update-banner')).toBeVisible();
    await page.waitForTimeout(100);
    expect(loads).toBe(2);
  });

  test('Anmeldebildschirm zeigt die laufende Version', async ({ page }) => {
    // Die Version wird aus window.KRS_VERSION gelesen statt fest verdrahtet:
    // vorher stand hier '4.30.0', wodurch der Test bei JEDEM Release rot wurde,
    // ohne dass am Verhalten etwas kaputt war (gefunden beim Sprung auf v4.31.0).
    // Geprüft wird die Aussage, auf die es ankommt: Das Abzeichen zeigt genau
    // die laufende Version — der Fünf-Sekunden-Check am Gerät.
    await prepare(page, '9.9.9');
    const laufend = await page.evaluate(() => (window as any).KRS_VERSION);
    expect(laufend).toMatch(/^\d+\.\d+\.\d+$/);
    await expect(page.getByTestId('version-badge')).toHaveText('v' + laufend);
  });

  test('Demo-Modus pollt die Remote-Version nicht', async ({ page }) => {
    let pollRequests = 0;
    await page.route('**/index.html?*', async route => {
      if (route.request().resourceType() === 'document') return route.continue();
      pollRequests += 1;
      await route.fulfill({ status: 200, body: `window.KRS_VERSION = '${REMOTE_VERSION}';` });
    });
    await page.goto('/index.html?forceMode=demo');
    await page.waitForFunction(() => typeof (window as any).KRS_VERSION === 'string');
    await visibility(page, 'hidden');
    await visibility(page, 'visible', 60_001);
    expect(pollRequests).toBe(0);
    await expect(page.getByTestId('update-banner')).toHaveCount(0);
  });
});
