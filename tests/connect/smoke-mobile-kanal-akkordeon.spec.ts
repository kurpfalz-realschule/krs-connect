import { test, expect } from '../fixtures/connect';

/**
 * v4.29.0 — Kanäle klappen unter ihrem Team auf (Handy-Schubfach)
 *
 * Rückmeldung Norbert, 21.09.2026: „bei den teams kann man nicht die
 * unterteams aufblättern". Die Kanäle standen im Schubfach als eigener Block
 * GANZ UNTEN unter der kompletten Teamliste — ohne Scrollen unsichtbar.
 * Jetzt: Tippen auf ein Team klappt seine Kanäle direkt darunter auf (▸/▾),
 * nochmal tippen klappt zu. Am Rechner bleibt die eigene Kanal-Spalte.
 */
test.describe('Kanal-Akkordeon im Handy-Schubfach (Demo)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function drawerOeffnen(page) {
    await page.locator('.mobile-menu-btn').first().click();
    await expect(page.locator('.team-drawer.mobile-open')).toHaveCount(1);
  }

  test('Team antippen klappt seine Kanäle direkt darunter auf', async ({ connectPage: page }) => {
    await drawerOeffnen(page);
    const team = page.locator('[data-testid="team-visible"] [data-testid="team-toggle"]').nth(1);
    await expect(team).toBeVisible({ timeout: 8_000 });
    await expect(team).toHaveAttribute('aria-expanded', 'false');

    await team.click();
    const children = page.locator('[data-testid="team-children"]');
    await expect(children).toBeVisible({ timeout: 8_000 });
    expect(await page.locator('[data-testid="team-child-channel"]').count()).toBeGreaterThan(0);
    await expect(team).toHaveAttribute('aria-expanded', 'true');

    // Der Kanal steht WIRKLICH unter seinem Team, nicht unter der Liste.
    const teamBox = await team.boundingBox();
    const kinderBox = await children.boundingBox();
    expect(kinderBox!.y).toBeGreaterThan(teamBox!.y);
    expect(kinderBox!.y - (teamBox!.y + teamBox!.height)).toBeLessThan(24);
  });

  test('Nochmal antippen klappt das Team wieder zu', async ({ connectPage: page }) => {
    await drawerOeffnen(page);
    const team = page.locator('[data-testid="team-visible"] [data-testid="team-toggle"]').nth(1);
    await team.click();
    await expect(page.locator('[data-testid="team-children"]')).toBeVisible({ timeout: 8_000 });
    await team.click();
    await expect(page.locator('[data-testid="team-children"]')).toHaveCount(0);
  });

  test('Der alte Kanal-Block ganz unten ist auf dem Handy weg', async ({ connectPage: page }) => {
    await drawerOeffnen(page);
    await expect(page.locator('.team-drawer .sidebar-channels')).toBeHidden();
  });

  test('Kanal aus dem Akkordeon wählen schließt das Schubfach', async ({ connectPage: page }) => {
    await drawerOeffnen(page);
    const team = page.locator('[data-testid="team-visible"] [data-testid="team-toggle"]').nth(1);
    await team.click();
    await page.locator('[data-testid="team-child-channel"]').first().click();
    await expect(page.locator('.team-drawer.mobile-open')).toHaveCount(0);
  });
});

test.describe('Am Rechner bleibt die Kanal-Spalte (Demo)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('Kanal-Spalte sichtbar, Akkordeon nicht', async ({ connectPage: page }) => {
    await expect(page.locator('.sidebar-channels')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('[data-testid="team-children"]')).toBeHidden();
  });
});
