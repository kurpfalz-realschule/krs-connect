import { test, expect } from '../fixtures/connect';

/**
 * Feedback #5 (Stresstest 09.07.) — „Mir fehlt das Bienen-Emoji".
 * Neue Emoji-Kategorie „Natur" inkl. 🐝; Suche nach „biene" findet sie.
 */
test.describe('Feedback #5 — Emoji-Kategorie Natur (🐝)', () => {
  test('Picker enthält Kategorie Natur und die Suche findet die Biene', async ({ connectPage: page }) => {
    const chatNav = page.getByRole('button', { name: 'Chats' }).first();
    await expect(chatNav).toBeVisible({ timeout: 8_000 });
    await chatNav.click();

    const firstConv = page.locator('.conversation-item').first();
    if (await firstConv.count() === 0) {
      test.skip(true, 'Keine Demo-Konversation vorhanden');
    }
    await firstConv.click();

    const emojiBtn = page.getByTestId('chat-emoji-btn');
    await expect(emojiBtn).toBeVisible({ timeout: 6_000 });
    await emojiBtn.click();

    const picker = page.locator('.emoji-picker');
    await expect(picker).toBeVisible({ timeout: 4_000 });

    // Kategorie „Natur" existiert
    await expect(picker.locator('.emoji-category', { hasText: 'Natur' })).toBeVisible();

    // Suche nach „biene" liefert 🐝
    await picker.locator('input').fill('biene');
    await expect(picker.getByText('🐝').first()).toBeVisible({ timeout: 3_000 });
  });
});
