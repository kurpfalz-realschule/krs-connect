import { test, expect, openConnect } from '../fixtures/connect';

async function oeffneChat(page, width: number) {
  await page.setViewportSize({ width, height: width >= 1024 ? 800 : 844 });
  await page.addInitScript(() => {
    localStorage.setItem('krs_design_v2', '1');
    localStorage.setItem('krs_onboarding_done', '1');
  });
  await openConnect(page, { user: 'la' });
  await page.getByRole('button', { name: 'Chats', exact: true }).click();
  const back = page.getByTestId('chat-back');
  if (!(await back.isVisible().catch(() => false))) {
    if (await page.getByTestId('chat-open-list').isVisible().catch(() => false)) {
      await page.getByTestId('chat-open-list').click();
    }
    await page.locator('.conversation-item').first().click();
  }
  await expect(page.getByTestId('chat-back')).toBeVisible();
  await expect(page.getByTestId('chat-back')).toHaveText('‹ Chats');
}

test('Fokus allein versteckt die Leiste nicht, die Tastatur schon', async ({ page }) => {
  await oeffneChat(page, 390);
  const editor = page.locator('.chat-input-bar [contenteditable="true"]');
  await editor.click();
  await expect.poll(() => page.evaluate(() => (window as any).__krsEditorActive)).toBe(true);
  await expect(page.locator('html')).not.toHaveClass(/krs-keyboard-open/);
  await expect(page.locator('.app-layout > .sidebar')).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('krs-keyboard-will-show', { detail: { keyboardHeight: 80 } }));
  });
  await page.waitForTimeout(180);
  await expect(page.locator('html')).not.toHaveClass(/krs-keyboard-open/);
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('krs-keyboard-will-show', { detail: { keyboardHeight: 300 } }));
  });
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('krs-keyboard-open'))).toBe(true);
  await expect(page.locator('.app-layout > .sidebar')).toBeHidden();
  await expect(page.getByTestId('chat-back')).toBeVisible();
  await expect(page.getByTestId('chat-back')).toHaveText('‹ Chats');
  const shellVerdeckt = await page.evaluate(() => {
    const bar = document.querySelector('.app-layout > .sidebar');
    return {
      barVersteckt: bar ? bar.getAttribute('aria-hidden') : '',
      htmlHatInert: document.documentElement.hasAttribute('inert'),
    };
  });
  expect(shellVerdeckt.barVersteckt).toBe('true');
  expect(shellVerdeckt.htmlHatInert).toBe(false);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('krs-keyboard-did-hide')));
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('krs-keyboard-open'))).toBe(false);
  await expect(page.locator('.app-layout > .sidebar')).toBeVisible();
  await expect(page.getByTestId('chat-back')).toBeVisible();
});

test('Emoji in der Schreibzone lässt den Editor aktiv, eine Dateiauswahl nicht', async ({ page }) => {
  await oeffneChat(page, 390);
  const editor = page.locator('.chat-input-bar [contenteditable="true"]');
  await editor.click();
  await page.getByTestId('chat-emoji-btn').focus();
  await page.waitForTimeout(250);
  await expect.poll(() => page.evaluate(() => (window as any).__krsEditorActive)).toBe(true);
  await page.evaluate(() => {
    const feld = document.querySelector('.chat-input-bar input[type="file"]');
    if (feld) feld.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => (window as any).__krsEditorActive)).toBe(false);
});

test('Am Schreibtisch bleibt die seitliche Leiste', async ({ page }) => {
  await oeffneChat(page, 1280);
  await page.locator('.chat-input-bar [contenteditable="true"]').click();
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('krs-keyboard-will-show', { detail: { keyboardHeight: 300 } }));
  });
  await page.waitForTimeout(180);
  await expect(page.locator('html')).not.toHaveClass(/krs-keyboard-open/);
  await expect(page.locator('.app-layout > .sidebar')).toBeVisible();
  await expect(page.getByTestId('chat-back')).toBeVisible();
});

test('Eingebettet: nur die vier Felder, der Frame setzt die Klasse nicht', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('krs_design_v2', '1');
    localStorage.setItem('krs_onboarding_done', '1');
  });
  const source = '/index.html?forceMode=demo&forceUser=la';
  await page.route('**/nav-embed', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<html><body style="margin:0"><iframe title="Connect" src="${source}" style="width:100vw;height:100dvh;border:0"></iframe></body></html>`,
  }));
  await page.goto('/nav-embed');
  const app = page.frameLocator('iframe[title="Connect"]');
  await app.getByTestId('teams-open-list').click();
  await app.getByTestId('drawer-nav-chat').click();
  await app.locator('.conversation-item').first().click();
  await expect(app.getByTestId('chat-back')).toBeVisible();
  const frame = page.frame({ url: /index\.html/ });
  expect(frame).toBeTruthy();
  await frame!.evaluate(() => {
    const ziel = window.parent as any;
    const orig = ziel.postMessage.bind(ziel);
    ziel.__krsGesendet = [];
    ziel.postMessage = (data: any, origin?: string) => {
      if (data && data.type === 'KRS_EDITOR_ACTIVE') ziel.__krsGesendet.push({ data, origin });
      return orig(data, origin);
    };
  });
  await app.locator('.chat-input-bar [contenteditable="true"]').click();
  await expect.poll(() => page.evaluate(() => ((window as any).__krsGesendet || []).length)).toBe(1);
  const sendung = await page.evaluate(() => (window as any).__krsGesendet[0]);
  expect(Object.keys(sendung.data).sort()).toEqual(['active', 'requestId', 'type', 'version']);
  expect(sendung.data).toMatchObject({ type: 'KRS_EDITOR_ACTIVE', version: 1, active: true });
  expect(sendung.data.requestId).toMatch(/^[a-f0-9-]{4,80}$/);
  expect(sendung.origin).toBe('https://kurpfalz-realschule.github.io');
  await frame!.evaluate(() => {
    window.dispatchEvent(new CustomEvent('krs-keyboard-will-show', { detail: { keyboardHeight: 300 } }));
  });
  await page.waitForTimeout(180);
  await expect.poll(() => frame!.evaluate(() => document.documentElement.classList.contains('krs-keyboard-open'))).toBe(false);
  await frame!.evaluate(() => { (window as any).KRS_HUB_URL = ''; });
  await app.locator('.chat-input-bar [contenteditable="true"]').evaluate((el) => (el as HTMLElement).blur());
  await page.waitForTimeout(250);
  await app.locator('.chat-input-bar [contenteditable="true"]').click();
  await page.waitForTimeout(200);
  await expect.poll(() => page.evaluate(() => ((window as any).__krsGesendet || []).length)).toBe(1);
});

test('Viewport-Schrumpfung versteckt nur bei aktivem Editor und ohne Zoom', async ({ page }) => {
  await page.addInitScript(() => {
    let h = 844;
    let scale = 1;
    const listeners: Record<string, Array<() => void>> = {};
    const fake = {
      get height() { return h; },
      get width() { return window.innerWidth; },
      get scale() { return scale; },
      get offsetTop() { return 0; },
      get offsetLeft() { return 0; },
      get pageTop() { return 0; },
      get pageLeft() { return 0; },
      addEventListener(type: string, fn: () => void) { (listeners[type] || (listeners[type] = [])).push(fn); },
      removeEventListener(type: string, fn: () => void) { listeners[type] = (listeners[type] || []).filter((eintrag) => eintrag !== fn); },
    };
    (window as any).__krsFakeViewport = {
      set(next: number, nextScale?: number) {
        h = next;
        if (typeof nextScale === 'number') scale = nextScale;
        (listeners.resize || []).forEach((fn) => fn());
      },
    };
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake });
  });
  await oeffneChat(page, 390);
  await page.evaluate(() => (window as any).__krsFakeViewport.set(640));
  await page.waitForTimeout(180);
  await expect(page.locator('html')).not.toHaveClass(/krs-keyboard-open/);
  await page.locator('.chat-input-bar [contenteditable="true"]').click();
  await page.evaluate(() => (window as any).__krsFakeViewport.set(640));
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('krs-keyboard-open'))).toBe(true);
  await expect(page.getByTestId('chat-back')).toBeVisible();
  await page.evaluate(() => (window as any).__krsFakeViewport.set(640, 1.5));
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('krs-keyboard-open'))).toBe(false);
});
