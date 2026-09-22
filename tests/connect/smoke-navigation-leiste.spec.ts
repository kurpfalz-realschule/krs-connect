import { test, expect, openConnect } from '../fixtures/connect';

/**
 * S19 (22.09.2026, P1) — Teams|Chats und Hub in der oberen Leiste, nicht nur im ☰.
 *
 * data-testid drawer-nav-teams / drawer-nav-chat / drawer-nav-apps liegen jetzt
 * auf der `.mobile-topnav` (nicht mehr im Drawer). ☰ öffnet weiterhin den
 * Teams-Drawer (Verhalten unverändert für smoke-ungelesen-punkt).
 */

test.describe('S19: Navigation-Leiste mobil', () => {
  test.use({ viewport: { width: 393, height: 852 } });

  test('a/b) Teams ↔ Chats ohne ☰', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    await expect(page.getByTestId('mobile-topnav')).toBeVisible({ timeout: 8_000 });

    await page.getByTestId('drawer-nav-chat').click();
    await expect(page.getByTestId('drawer-nav-chat')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.conversation-item, .chat-empty, .chat-panel').first()).toBeVisible({ timeout: 8_000 });

    await page.getByTestId('drawer-nav-teams').click();
    await expect(page.getByTestId('drawer-nav-teams')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.content, .team-drawer').first()).toBeVisible({ timeout: 8_000 });
  });

  test('c) ▦ Hub sendet KRS_HUB_NAVIGATE an den erwarteten Origin', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__krsIsEmbedded = true;
      try { localStorage.setItem('krs_onboarding_done', '1'); } catch (e) {}
    });
    const params = new URLSearchParams({ forceMode: 'demo', forceUser: 'la' });
    await page.goto(`/index.html?${params.toString()}`);
    await page.waitForFunction(() => typeof (window as any).KRS_VERSION === 'string', null, { timeout: 10_000 });

    await expect(page.getByTestId('drawer-nav-apps')).toBeVisible({ timeout: 8_000 });

    const nachricht = await page.evaluate(async () => {
      const w = window as any;
      const hubUrl = w.KRS_HUB_URL || '';
      let erwartetOrigin = location.origin;
      try { if (hubUrl) erwartetOrigin = new URL(hubUrl, location.href).origin; } catch (e) {}
      return await new Promise<{ ok: boolean; raw: string; target?: string }>((fertig) => {
        const vorher = w.parent.postMessage;
        w.parent.postMessage = (daten: any, target?: string) => {
          fertig({ ok: true, raw: JSON.stringify(daten), target: String(target) });
          w.parent.postMessage = vorher;
        };
        (document.querySelector('[data-testid="drawer-nav-apps"]') as HTMLElement)?.click();
        setTimeout(() => fertig({ ok: false, raw: 'timeout' }), 800);
      }).then((r) => {
        // Origin-Check: Ziel darf nicht '*' sein
        return JSON.stringify({ ...r, erwartetOrigin });
      });
    });
    const parsed = JSON.parse(nachricht);
    expect(parsed.ok).toBe(true);
    expect(parsed.raw).toContain('KRS_HUB_NAVIGATE');
    expect(parsed.raw).toContain('"moduleId":null');
    expect(parsed.target).not.toBe('*');
    expect(parsed.target).toBe(parsed.erwartetOrigin);
  });

  test('d) Bei 320 px keine Beschriftung abgeschnitten', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await openConnect(page, { user: 'la' });
    const topnav = page.getByTestId('mobile-topnav');
    await expect(topnav).toBeVisible({ timeout: 8_000 });
    // Sprint: zuerst Symbole weglassen, Beschriftungen „Teams"/„Chats" müssen stehen.
    await expect(page.getByTestId('drawer-nav-teams')).toContainText('Teams');
    await expect(page.getByTestId('drawer-nav-chat')).toContainText('Chats');
    const ok = await topnav.evaluate((el) => {
      const labels = Array.from(el.querySelectorAll('.topnav-label'));
      // Nur sichtbare Labels (Hub-Label fällt unter 380px weg — das ist Absicht).
      return labels
        .filter((n) => getComputedStyle(n).display !== 'none')
        .every((n) => (n as HTMLElement).scrollWidth <= (n as HTMLElement).clientWidth + 1);
    });
    expect(ok).toBe(true);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);
  });
});

test.describe('S19: Gegenprobe Desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('e) mobile-topnav unsichtbar, Seitenleiste unverändert', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    await expect(page.getByTestId('mobile-topnav')).toBeHidden();
    await expect(page.locator('.sidebar').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Teams & Kanäle' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chats' }).first()).toBeVisible();
  });
});
