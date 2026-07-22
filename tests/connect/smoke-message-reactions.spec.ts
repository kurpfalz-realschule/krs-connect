import { test, expect, openConnect } from '../fixtures/connect';

/**
 * #11 — Reaktionen auf Chat-Nachrichten
 *
 * Backend ist bereits generisch: reactions(target_type IN ('post','message'))
 * + RPC toggle_reaction. Daher KEINE Migration nötig — nur Frontend + Demo.
 */
test.describe('#11 Nachrichten-Reaktionen — DataService (Demo)', () => {
  test('toggle setzt/entfernt Reaktion, mehrere User zählen korrekt', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    const r = await page.evaluate(async () => {
      const DS = (window as any).DataService;
      const ds = new DS(null);
      const MID = 987654;
      await ds.toggleReaction('message', MID, 1, '👍');
      const a1 = (await ds.getReactions('message', [MID])).get(MID) || [];
      await ds.toggleReaction('message', MID, 1, '👍'); // wieder weg
      const a2 = (await ds.getReactions('message', [MID])).get(MID) || [];
      await ds.toggleReaction('message', MID, 1, '❤️');
      await ds.toggleReaction('message', MID, 2, '❤️');
      const a3 = (await ds.getReactions('message', [MID])).get(MID) || [];
      const heart = a3.find((x: any) => x.emoji === '❤️');
      return {
        a1Count: a1.length, a1Emoji: a1[0]?.emoji, a1Users: a1[0]?.count,
        a2Count: a2.length,
        heartCount: heart?.count, heartUsers: heart?.users?.length,
      };
    });
    expect(r.a1Count).toBe(1);
    expect(r.a1Emoji).toBe('👍');
    expect(r.a1Users).toBe(1);
    expect(r.a2Count).toBe(0);     // Toggle entfernt die letzte Reaktion
    expect(r.heartCount).toBe(2);  // zwei verschiedene User
    expect(r.heartUsers).toBe(2);
  });
});

test.describe('#11 Nachrichten-Reaktionen — UI (Demo)', () => {
  test('Reagieren-Button öffnet Picker und fügt eine Chip-Reaktion hinzu', async ({ connectPage: page }) => {
    const chatNav = page.getByRole('button', { name: 'Chats' }).first();
    await expect(chatNav).toBeVisible({ timeout: 8_000 });
    await chatNav.click();

    const firstConv = page.locator('.conversation-item').first();
    if (await firstConv.count() === 0) test.skip(true, 'Keine Demo-Konversation');
    await firstConv.click();

    const reactBtn = page.getByTestId('msg-react-btn').first();
    if (await reactBtn.count() === 0) test.skip(true, 'Keine Nachrichten in dieser Konversation');
    await reactBtn.click();

    const picker = page.locator('.emoji-picker');
    await expect(picker).toBeVisible({ timeout: 4_000 });
    await picker.locator('.emoji-btn').first().click();

    // Eine Chip-Reaktion erscheint an der Nachricht
    await expect(page.getByTestId('msg-reaction-chip').first()).toBeVisible({ timeout: 4_000 });
  });
});
