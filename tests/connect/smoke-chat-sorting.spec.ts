import { test, expect, openConnect } from '../fixtures/connect.ts';

/**
 * smoke-chat-sorting.spec.ts
 * Prüft die Teams-artige Sortierung der Chat-Übersicht:
 *  - Linke Liste: zuletzt aktiver Chat steht oben (sortConversationsByActivity)
 *  - Bei neuer Nachricht wandert der betroffene Chat nach oben (updateConversationActivity)
 *  - Nachrichten-Feed: neueste Nachricht unten (chronologisch)
 */

test.describe('Chat-Übersicht: Sortierung nach Aktivität (Teams-Style)', () => {

  test('sortConversationsByActivity ordnet neueste Aktivität nach oben', async ({ connectPage: page }) => {
    const order = await page.evaluate(() => {
      const fn = (window as any).__krsSortConversationsByActivity;
      if (typeof fn !== 'function') return null;
      const input = [
        { id: 1, lastActivityAt: '2026-06-20T10:00:00Z' }, // älter
        { id: 2, lastActivityAt: '2026-06-26T09:00:00Z' }, // neuester
        { id: 3, lastActivityAt: '2026-06-22T08:00:00Z' }, // mittel
      ];
      return fn(input).map((c: any) => c.id);
    });
    expect(order, 'window-Helfer __krsSortConversationsByActivity muss existieren').not.toBeNull();
    expect(order).toEqual([2, 3, 1]);
  });

  test('updateConversationActivity zieht den betroffenen Chat nach oben + setzt Unread/Preview', async ({ connectPage: page }) => {
    const result = await page.evaluate(() => {
      const fn = (window as any).__krsUpdateConversationActivity;
      if (typeof fn !== 'function') return null;
      const convs = [
        { id: 1, lastActivityAt: '2026-06-26T09:00:00Z', unread: 0 }, // aktuell oben
        { id: 2, lastActivityAt: '2026-06-20T10:00:00Z', unread: 0 }, // soll hochwandern
      ];
      // Neue Nachricht in Chat 2 (created_at NaN → Fallback Date.now())
      const next = fn(convs, { conversation_id: 2, content: 'Neueste Nachricht' }, { unreadDelta: 1, timeLabel: 'Jetzt' });
      const top = next[0];
      return { topId: top.id, preview: top.lastMessage, unread: top.unread, time: top.time };
    });
    expect(result, 'window-Helfer __krsUpdateConversationActivity muss existieren').not.toBeNull();
    expect(result!.topId).toBe(2);
    expect(result!.preview).toBe('Neueste Nachricht');
    expect(result!.unread).toBe(1);
    expect(result!.time).toBe('Jetzt');
  });

  test('Feed-Render: neueste Nachricht steht unten (chronologisch)', async ({ connectPage: page }) => {
    // Chat-Ansicht öffnen
    const chatNav = page.locator('button[aria-label="Chats"], button:has-text("Chat")').first();
    if (await chatNav.isVisible().catch(() => false)) await chatNav.click();

    const chatItem = page.locator('.conversation-item').first();
    if (!await chatItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip(true, 'Kein Chat sichtbar — Demo-Daten-Variante');
      return;
    }
    await chatItem.click();

    const bubbles = page.locator('.chat-msg .chat-text');
    const count = await bubbles.count();
    if (count < 2) {
      test.skip(true, 'Zu wenige Nachrichten zum Reihenfolge-Vergleich');
      return;
    }

    // Eine neue Nachricht senden — sie muss als LETZTE (unten) erscheinen
    const input = page.locator('.chat-input-bar input[type="text"]').first();
    await expect(input).toBeVisible({ timeout: 3000 });
    const marker = 'Sortiertest ' + Date.now();
    await input.fill(marker);
    await input.press('Enter');

    const last = page.locator('.chat-msg .chat-text').last();
    await expect(last).toHaveText(marker, { timeout: 4000 });
  });

});
