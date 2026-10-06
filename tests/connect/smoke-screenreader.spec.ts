import { test, expect } from '../fixtures/connect';

/**
 * Screenreader-Sprint: Lesemodus, Listen, deutsche Namen.
 * Schalter bleiben Schalter. Keine Personen aus Rückmeldungen.
 */

test.describe('Screenreader-Struktur (Demo)', () => {
  test('Lesemodus, ein Inhalt, Teams und Kanäle sind Listen', async ({ connectPage: page }) => {
    await expect(page.locator('.app-layout')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[role="application"]')).toHaveCount(0);
    await expect(page.locator('main#main')).toHaveCount(1);
    await expect(page.locator('main#main')).toHaveAttribute('aria-label', 'Inhalt');
    await expect(page.locator('a.skip-link')).toHaveAttribute('href', '#main');
    await expect(page.locator('nav[aria-label="Hauptnavigation"]')).toBeVisible();

    const teams = page.locator('.sidebar-teams ul.sidebar-list');
    await expect(teams).toBeVisible();
    await expect(teams.locator(':scope > li.team-group').first()).toBeVisible();
    const toggle = teams.locator('button[data-testid="team-toggle"]').first();
    await expect(toggle).toBeVisible();
    expect(await toggle.evaluate((el) => el.tagName)).toBe('BUTTON');
    await expect(toggle).toHaveAttribute('aria-expanded', /true|false/);

    const channels = page.locator('.sidebar-channels ul.sidebar-list');
    const channel = channels.locator(':scope > li > button.list-item').first();
    await expect(channel).toBeVisible();
    expect(await channel.evaluate((el) => el.tagName)).toBe('BUTTON');
    await expect(channel.locator('span[aria-hidden="true"]').first()).toHaveText('#');

    const suche = page.locator('.sidebar-teams button[aria-label="Suche öffnen"]');
    await expect(suche.locator('span[aria-hidden="true"]')).toHaveText('🔍');

    const heading = page.locator('.content-header h1').first();
    await expect(heading).toBeVisible();
    await expect(heading.locator('span[aria-hidden="true"]')).toHaveText('# ');
  });

  test('Chats sind eine Liste, der Verlauf heißt Nachrichten', async ({ connectPage: page }) => {
    await page.locator('button[aria-label="Chats"]').first().click();
    const list = page.locator('ul.conversation-items');
    await expect(list).toBeVisible();
    await expect(page.locator('#krs-chats-heading')).toHaveText('Chats');
    const row = list.locator(':scope > li[data-testid="conv-visible"]').first();
    await expect(row).toBeVisible();
    await expect(row.locator('button.conversation-item')).toBeVisible();
    await row.locator('button.conversation-item').click();
    const feed = page.locator('ul.chat-messages');
    await expect(feed).toHaveAttribute('aria-label', 'Nachrichten');
    await expect(feed.locator(':scope > li.chat-msg').first()).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('h2.chat-header-name')).toBeVisible();
  });
});
