import { test, expect } from '../fixtures/connect';
import { readFileSync } from 'node:fs';

// D1 replaces mobile-topnav-menu with one labelled list entry in the content.
// Exercise actual iframe embedding as well as standalone navigation.
for (const embedded of [false, true]) {
  for (const width of [320, 390, 768]) {
    test(`D1 ${embedded ? 'iframe' : 'standalone'} ${width}: lists, tabs and return paths`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(() => localStorage.setItem('krs_onboarding_done', '1'));
      if (process.env.D1_SOURCE) {
        const body = readFileSync(process.env.D1_SOURCE, 'utf8');
        await page.route('**/index.html?*', route => route.fulfill({ contentType: 'text/html', body }));
      }
      const source = '/index.html?forceMode=demo&forceUser=la';
      if (embedded) {
        await page.route('**/d1-embed', route => route.fulfill({ contentType: 'text/html', body: `<html><body style="margin:0"><iframe title="Connect" src="${source}" style="width:100vw;height:100dvh;border:0"></iframe></body></html>` }));
        await page.goto('/d1-embed');
      } else await page.goto(source);
      const app = embedded ? page.frameLocator('iframe') : page;
      const teams = app.getByTestId('teams-open-list');
      await expect(teams).toBeVisible();
      await expect(app.getByTestId('mobile-topnav-menu')).toHaveCount(0);
      await expect(app.locator('.mobile-menu-btn:visible')).toHaveCount(1);
      for (const tab of ['links', 'termine', 'posts']) {
        await app.getByTestId('team-tab-' + tab).click();
        await expect(teams).toBeVisible();
        await expect(app.locator('.mobile-menu-btn:visible')).toHaveCount(1);
      }
      await teams.click();
      await expect(app.locator('.team-drawer.mobile-open')).toBeVisible();
      await app.getByRole('button', { name: 'Suche öffnen', exact: true }).first().click();
      await expect(app.getByTestId('search-back')).toBeVisible();
      await app.getByTestId('search-back').click();
      await expect(teams).toBeVisible();
      await app.getByTestId('drawer-nav-chat').click();
      await expect(app.locator('.mobile-menu-btn:visible')).toHaveCount(1);
      await app.getByTestId('chat-open-list').click();
      await expect(app.locator('.conversation-item').first()).toBeVisible();
      await app.locator('.conversation-item').first().click();
      await expect(app.getByTestId('chat-open-list')).toBeVisible();
      await app.getByTestId('chat-open-list').click();
      if (embedded) await app.getByTestId('drawer-nav-merkliste').click();
      else await app.getByRole('button', { name: 'Merkliste öffnen', exact: true }).click();
      await expect(app.getByTestId('saved-back')).toBeVisible();
      await app.getByTestId('saved-back').click();
      await expect(app.getByTestId('chat-open-list')).toBeVisible();
      await app.getByTestId('mobile-account-trigger').click();
      await expect(app.getByTestId('drawer-nav-settings')).toBeVisible();
      await expect(app.getByTestId('drawer-nav-profile')).toBeVisible();
      await app.getByTestId('mobile-account-overlay').click();
      const box = await app.getByTestId('chat-open-list').boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      const frame = embedded ? page.frames().find(f => f.url().includes('index.html'))! : page.mainFrame();
      expect(await frame.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2)).toBe(false);
      await page.screenshot({ path: `../app-design/2026-10-05/d1-${embedded ? 'iframe' : 'standalone'}-${width}.png` });
    });
  }
}
