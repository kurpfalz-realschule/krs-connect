import { test, expect, openConnect } from '../fixtures/connect';
import type { Page } from '@playwright/test';

/**
 * 4.59.0 — „Benachrichtigungen aktiviert“ nicht bei jedem Start.
 *
 * Vorher: In der iOS-App meldet der Shim beim Start 'default', Connect fragte
 * automatisch nach, APNs sagte „erlaubt“ → Toast über der Leiste, jedes Mal.
 * Jetzt: automatischer Weg ohne Erfolgs-Toast; Erinnerung bei fehlender
 * Erlaubnis höchstens alle 14 Tage (localStorage krs_notif_reminder_at).
 */
const KEY = 'krs_notif_reminder_at';
const TAG = 24 * 60 * 60 * 1000;

async function fakeNotification(page: Page, perm: 'default' | 'denied', grantOnRequest: boolean, native: boolean) {
  await page.addInitScript(({ perm, grantOnRequest, native }) => {
    const state = { permission: perm as string };
    function N() {}
    Object.defineProperty(N, 'permission', { get: () => state.permission });
    (N as any).requestPermission = () => {
      (window as any).__notifRequests = ((window as any).__notifRequests || 0) + 1;
      state.permission = grantOnRequest ? 'granted' : 'denied';
      return Promise.resolve(state.permission);
    };
    Object.defineProperty(window, 'Notification', { value: N, configurable: true, writable: true });
    // Wie krs-native-client.js nach dem Handschlag (vor dem 3-s-Timer).
    if (native) document.addEventListener('DOMContentLoaded', () => document.documentElement.setAttribute('data-krs-native', 'ios'));
  }, { perm, grantOnRequest, native });
}

async function setReminder(page: Page, ago: number | null) {
  await page.addInitScript(({ key, ago }) => {
    try {
      if (sessionStorage.getItem('__notifSeeded')) return;
      sessionStorage.setItem('__notifSeeded', '1');
      if (ago === null) localStorage.removeItem(key);
      else localStorage.setItem(key, String(Date.now() - ago));
    } catch (e) {}
  }, { key: KEY, ago });
}

const toasts = (page: Page) => page.locator('.toast');

test.describe('Benachrichtigungs-Erinnerung (4.59.0)', () => {
  test('iOS-App, schon erlaubt: still nachfragen, kein Toast', async ({ page }) => {
    await fakeNotification(page, 'default', true, true);
    await openConnect(page, { user: 'la' });
    await page.waitForFunction(() => (window as any).__notifRequests >= 1, null, { timeout: 8000 });
    await page.waitForTimeout(500);
    await expect(toasts(page).filter({ hasText: /Benachrichtigung/ })).toHaveCount(0);
  });

  test('iOS-App, abgelehnt: Hinweis einmal, beim nächsten Start nicht', async ({ page }) => {
    await setReminder(page, null);
    await fakeNotification(page, 'default', false, true);
    await openConnect(page, { user: 'la' });
    await expect(toasts(page).filter({ hasText: 'Benachrichtigungen sind aus' })).toHaveCount(1, { timeout: 8000 });
    await page.reload();
    await page.waitForFunction(() => (window as any).__notifRequests >= 1, null, { timeout: 8000 });
    await page.waitForTimeout(500);
    await expect(toasts(page).filter({ hasText: /Benachrichtigung/ })).toHaveCount(0);
  });

  test('Browser blockiert: Hinweis nur, wenn 14 Tage um sind', async ({ page }) => {
    await setReminder(page, 3 * TAG);
    await fakeNotification(page, 'denied', false, false);
    await openConnect(page, { user: 'la' });
    await page.waitForTimeout(4000);
    await expect(toasts(page).filter({ hasText: /Benachrichtigung/ })).toHaveCount(0);
  });

  test('Browser blockiert, 15 Tage her: Hinweis mit OK, Zeitstempel neu', async ({ page }) => {
    await setReminder(page, 15 * TAG);
    await fakeNotification(page, 'denied', false, false);
    await openConnect(page, { user: 'la' });
    const t = toasts(page).filter({ hasText: 'im Browser blockiert' });
    await expect(t).toHaveCount(1, { timeout: 8000 });
    const at = await page.evaluate((k) => Number(localStorage.getItem(k)), KEY);
    expect(Date.now() - at).toBeLessThan(60_000);
    await t.getByRole('button', { name: 'OK' }).click();
    await expect(t).toHaveCount(0);
  });

  test('Browser, noch nie gefragt: Dialog nur alle 14 Tage', async ({ page }) => {
    await setReminder(page, 2 * TAG);
    await fakeNotification(page, 'default', true, false);
    await openConnect(page, { user: 'la' });
    await page.waitForTimeout(4000);
    expect(await page.evaluate(() => (window as any).__notifRequests || 0)).toBe(0);
  });

  test('Selbst ausgeschaltet: keine Erinnerung', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('krs-notifications', 'off'); } catch (e) {} });
    await setReminder(page, null);
    await fakeNotification(page, 'denied', false, false);
    await openConnect(page, { user: 'la' });
    await page.waitForTimeout(4000);
    await expect(toasts(page).filter({ hasText: /Benachrichtigung/ })).toHaveCount(0);
  });
});
