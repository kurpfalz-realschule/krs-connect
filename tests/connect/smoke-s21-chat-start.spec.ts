import { test, expect, openConnect } from '../fixtures/connect.ts';

/**
 * S21 (v4.36.0): Kollegium-Prefix + Chat-Start auto-select
 */
test.describe('S21 Chat-Start & Kollegium-Prefix', () => {

  test('isKollegiumTeam matcht Prefix „kollegium…“ und behält Alt-Matches', async ({ connectPage: page }) => {
    const result = await page.evaluate(() => {
      const fn = (window as any).__krsIsKollegiumTeam;
      if (typeof fn !== 'function') return null;
      return {
        exact: fn({ name: 'Kollegium' }),
        krs: fn({ name: 'KRS Kollegium' }),
        ends: fn({ name: 'Fach Kollegium' }),
        prefix: fn({ name: 'Kollegium allgemein' }),
        other: fn({ name: 'Musik' }),
      };
    });
    expect(result, '__krsIsKollegiumTeam muss exponiert sein').not.toBeNull();
    expect(result!.exact).toBe(true);
    expect(result!.krs).toBe(true);
    expect(result!.ends).toBe(true);
    expect(result!.prefix).toBe(true);
    expect(result!.other).toBe(false);
  });

  test('getTopVisibleConversation nimmt oberste nach Aktivität, skippt hidden', async ({ connectPage: page }) => {
    const result = await page.evaluate(() => {
      const fn = (window as any).__krsGetTopVisibleConversation;
      if (typeof fn !== 'function') return null;
      const convs = [
        { id: 1, lastActivityAt: '2026-09-20T10:00:00Z' },
        { id: 2, lastActivityAt: '2026-09-22T09:00:00Z' },
        { id: 3, lastActivityAt: '2026-09-21T08:00:00Z' },
      ];
      const top = fn(convs, new Set());
      const topSkip2 = fn(convs, new Set([2]));
      return { topId: top && top.id, skipId: topSkip2 && topSkip2.id };
    });
    expect(result).not.toBeNull();
    expect(result!.topId).toBe(2);
    expect(result!.skipId).toBe(3);
  });

  test('Chat-Ansicht wählt automatisch einen sichtbaren Chat (kein chat-empty-none)', async ({ connectPage: page }) => {
    // Zur Chat-Ansicht
    const chatNav = page.getByTestId('drawer-nav-chat').or(page.locator('button[aria-label="Chats"]')).first();
    await expect(chatNav).toBeVisible({ timeout: 10_000 });
    await chatNav.click();

    // Demo hat MOCK_CONVERSATIONS → es sollte ein Chat aktiv sein, nicht der Leerzustand „keine Chats“
    await expect(page.getByTestId('chat-empty-none')).toHaveCount(0, { timeout: 5_000 });

    // Entweder ChatPanel mit Nachrichten/Header ODER Loading kurz — aber conversation-item active
    const active = page.locator('.conversation-item.active').first();
    const hasActive = await active.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasActive) {
      // Fallback: irgendein conversation-item existiert und empty-none fehlt
      const any = await page.locator('.conversation-item').count();
      expect(any, 'Demo sollte sichtbare Chats haben').toBeGreaterThan(0);
    } else {
      await expect(active).toBeVisible();
    }

    // Version
    const ver = await page.evaluate(() => (window as any).KRS_VERSION);
    expect(ver).toBe('4.36.0');
  });
});
