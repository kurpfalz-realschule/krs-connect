import { test, expect } from '../fixtures/connect';

/**
 * Feedback #8 (Stresstest 09.07.) — „Wie kann ich in eine neue Zeile schreiben?"
 * Im Chat-Composer (Enter = senden) gibt es jetzt einen sichtbaren
 * ↵-Knopf, der einen Zeilenumbruch einfügt, plus Shift+Enter-Hinweis.
 */
test.describe('Feedback #8 — Zeilenumbruch im Composer', () => {
  test('↵-Knopf ist sichtbar und fügt einen Umbruch ein', async ({ connectPage: page }) => {
    const chatNav = page.getByRole('button', { name: 'Chats' }).first();
    await expect(chatNav).toBeVisible({ timeout: 8_000 });
    await chatNav.click();

    const firstConv = page.locator('.conversation-item').first();
    if (await firstConv.count() === 0) {
      test.skip(true, 'Keine Demo-Konversation vorhanden');
    }
    await firstConv.click();

    const input = page.locator('.chat-input-bar .rich-editor').first();
    await expect(input).toBeVisible({ timeout: 6_000 });
    await input.click();
    await input.pressSequentially('Zeile eins');

    const nlBtn = page.locator('.chat-input-bar').getByTestId('composer-newline-btn');
    await expect(nlBtn).toBeVisible({ timeout: 4_000 });
    await nlBtn.click();

    // Editor enthält jetzt einen Zeilenumbruch (<br> oder <div>-Block, je nach Browser)
    const html = await input.innerHTML();
    expect(/<br|<div/i.test(html)).toBe(true);

    // Hinweistext vorhanden (Desktop)
    await expect(page.locator('.chat-input-bar .composer-hint')).toHaveText(/Shift\+Enter/);
  });
});
