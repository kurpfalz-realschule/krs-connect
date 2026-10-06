import { test, expect } from '../fixtures/connect';

async function oeffneChat(page, width: number) {
  await page.setViewportSize({ width, height: width >= 1024 ? 800 : 844 });
  await page.addInitScript(() => {
    localStorage.setItem('krs_design_v2', '1');
    localStorage.setItem('krs_onboarding_done', '1');
  });
  await page.goto('/index.html?forceMode=demo&forceUser=la');
  await page.waitForFunction(() => typeof (window as any).KRS_VERSION === 'string');
  if (width < 1024) {
    await page.getByRole('button', { name: 'Chats', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Chats', exact: true }).click();
  }
  const back = page.getByTestId('chat-back');
  if (!(await back.isVisible().catch(() => false))) {
    if (await page.getByTestId('chat-open-list').isVisible().catch(() => false)) {
      await page.getByTestId('chat-open-list').click();
    }
    await page.locator('.conversation-item').first().click();
  }
  await expect(page.locator('.chat-send-btn')).toBeVisible();
}

for (const width of [390, 1280]) {
  test(`WebKit ${width}: Rückweg-Text und Sendesymbol haben Fläche`, async ({ page }) => {
    await oeffneChat(page, width);
    const back = page.getByTestId('chat-back');
    await expect(back).toBeVisible();
    await expect(back).toHaveText('‹ Chats');
    const backBox = await back.boundingBox();
    expect(backBox!.width).toBeGreaterThanOrEqual(44);
    expect(backBox!.height).toBeGreaterThanOrEqual(44);
    const svg = await page.locator('.chat-send-btn svg').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    expect(svg.w).toBeGreaterThanOrEqual(12);
    expect(svg.h).toBeGreaterThanOrEqual(12);
    await expect(page.locator('.chat-send-btn')).toBeDisabled();
  });
}

for (const width of [320, 390]) {
  test(`Liste ${width} eingebettet: Chats steht einmal, Merkliste ist kein Kasten`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => {
      localStorage.setItem('krs_design_v2', '1');
      localStorage.setItem('krs_onboarding_done', '1');
    });
    const source = '/index.html?forceMode=demo&forceUser=la';
    await page.route('**/nav-embed', route => route.fulfill({
      contentType: 'text/html',
      body: `<html><body style="margin:0"><iframe title="Connect" src="${source}" style="width:100vw;height:100dvh;border:0"></iframe></body></html>`,
    }));
    await page.goto('/nav-embed');
    const app = page.frameLocator('iframe');
    await app.getByTestId('teams-open-list').click();
    await app.getByTestId('drawer-nav-chat').click();
    await expect(app.locator('.conversation-item').first()).toBeVisible();
    const namen = await page.frameLocator('iframe').locator(':root').evaluate(() => {
      const treffer: string[] = [];
      document.querySelectorAll('h1,h2,button').forEach((el) => {
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') return;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
        if (/(^|\s)Chats(\s|$)/.test(t)) treffer.push(t);
      });
      return treffer;
    });
    expect(namen).toHaveLength(1);
    const merk = app.getByTestId('drawer-nav-merkliste');
    await expect(merk).toBeVisible();
    const merkBox = await merk.boundingBox();
    expect(merkBox!.width).toBeLessThan(width - 40);
    await expect(app.getByRole('button', { name: 'Liste schließen', exact: true })).toHaveCount(0);
  });
}

test('Entwurf bleibt an diesem Gespräch', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('krs_onboarding_done', '1'));
  await page.goto('/index.html?forceMode=demo&forceUser=la');
  await page.waitForFunction(() => typeof (window as any).KRS_VERSION === 'string');
  await page.getByTestId('drawer-nav-chat').click();
  await page.getByTestId('chat-open-list').click();
  await page.locator('.conversation-item').nth(0).click();
  const editor = page.locator('.chat-input-bar [contenteditable=true]');
  await editor.fill('Satz fuer diesen Chat');
  await page.getByTestId('chat-open-list').click();
  await expect(page.getByText('Entwurf', { exact: true })).toBeVisible();
  await page.locator('.conversation-item').nth(1).click();
  await expect(editor).not.toHaveText('Satz fuer diesen Chat');
  await page.getByTestId('chat-open-list').click();
  await page.locator('.conversation-item.has-draft').click();
  await expect(editor).toHaveText('Satz fuer diesen Chat');
});
