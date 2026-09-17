import { test, expect, openConnect } from '../fixtures/connect';

/**
 * Connect: „Notizen & Aufgaben“ ist KEIN Sidebar-Eintrag mehr (v4.24.0).
 *
 * Bis v4.23.3 stand das Notizen-Modul als eigener Knopf in Connects Navigation
 * — obwohl es eine Hub-App ist und dort schon als Kachel liegt. Auf dem Handy
 * standen dadurch zwei Navigationsleisten übereinander (Hub-Tabs +
 * Connect-Leiste) mit teils denselben Zielen. Rückmeldung Norbert
 * (17.09.2026): „Wichtig ist eigentlich der Switch zwischen Connect und Hub.
 * Im Hub sind alle Apps. Connect sollte aufgeräumt sein mit maximaler
 * Fokussierung auf Inhalte.“ Seitdem zeigt Connect nur noch Foren und Chats;
 * Notizen erreicht man über den Hub (Kachel „Notizen & Aufgaben“).
 */
test.describe('KRS Connect — Notizen liegt im Hub, nicht in Connect', () => {
  test('Sidebar zeigt keinen Notizen-Eintrag mehr', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    await expect(page.locator('.sidebar-nav')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('nav-notizen')).toHaveCount(0);
  });

  test('Der Weg zum Hub bleibt erreichbar', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    // Standalone (nicht im Hub-iframe): der Haus-Knopf führt zurück zum Hub,
    // von dort sind alle Module inkl. Notizen als Kachel erreichbar.
    await expect(page.getByTestId('nav-hub')).toBeVisible({ timeout: 8_000 });
  });
});
