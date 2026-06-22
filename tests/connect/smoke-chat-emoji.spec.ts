import { test, expect } from '../fixtures/connect';

/**
 * #10 — Emojis im Chat-Composer
 *
 * Die vorhandene EmojiPicker-Komponente (bisher nur im Forum) ist jetzt auch im
 * Chat-Eingabefeld verfügbar. Test: Picker öffnet, ausgewähltes Emoji landet im
 * Nachrichten-Input.
 */
test.describe('#10 Emojis im Chat', () => {
  test('Emoji-Button öffnet Picker und fügt ein Emoji ins Eingabefeld ein', async ({ connectPage: page }) => {
    // In die Chat-Ansicht wechseln
    const chatNav = page.getByRole('button', { name: 'Chats' }).first();
    await expect(chatNav).toBeVisible({ timeout: 8_000 });
    await chatNav.click();

    // Erste Konversation auswählen
    const firstConv = page.locator('.conversation-item').first();
    if (await firstConv.count() === 0) {
      test.skip(true, 'Keine Demo-Konversation vorhanden');
    }
    await firstConv.click();

    // Emoji-Button im Composer
    const emojiBtn = page.getByTestId('chat-emoji-btn');
    await expect(emojiBtn).toBeVisible({ timeout: 6_000 });
    await emojiBtn.click();

    // Picker offen
    const picker = page.locator('.emoji-picker');
    await expect(picker).toBeVisible({ timeout: 4_000 });

    // Erstes Emoji wählen
    const firstEmoji = picker.locator('.emoji-btn').first();
    await expect(firstEmoji).toBeVisible();
    const chosen = (await firstEmoji.textContent())?.trim() || '';
    await firstEmoji.click();

    // Eingabefeld enthält jetzt das Emoji
    const input = page.locator('.chat-input-bar input[type="text"]');
    await expect(input).toHaveValue(new RegExp(chosen.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 4_000 });

    // Picker wieder geschlossen
    await expect(picker).toHaveCount(0, { timeout: 4_000 });
  });
});
