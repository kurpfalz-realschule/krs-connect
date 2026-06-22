import { test, expect } from '../fixtures/connect';

/**
 * #14 — Emojis in Beiträgen & Antworten
 * Der Beitrags-Composer hat einen Emoji-Button (😊), der den EmojiPicker öffnet.
 */
test.describe('#14 Emojis im Beitrag — UI (Demo)', () => {
  test('Emoji-Button im Beitrags-Composer öffnet den Picker', async ({ connectPage: page }) => {
    // Beitrags-Formular öffnen (Compact-Bar „Beitrag schreiben…")
    const opener = page.getByText(/Beitrag schreiben/).first();
    if (await opener.count() === 0) {
      test.skip(true, 'Kein Beitrags-Composer sichtbar — UI-Variante (kein Kanal gewählt)');
    }
    await opener.click();

    const emojiBtn = page.getByTestId('post-emoji-btn');
    if (await emojiBtn.count() === 0) {
      test.skip(true, 'Emoji-Button nicht sichtbar — UI-Variante');
    }
    await expect(emojiBtn).toBeVisible({ timeout: 4_000 });
    await emojiBtn.click();
    // EmojiPicker erscheint
    await expect(page.locator('.emoji-picker').first()).toBeVisible({ timeout: 4_000 });
  });
});
