import { test, expect } from '../fixtures/connect';

/**
 * Mobile-Layout (Bottom-Bar entrümpeln + Teams/Kanäle in EINEM Drawer)
 *
 * Bug 1: In der Teams-Ansicht lagen Teams- und Kanäle-Spalte auf dem Handy als
 *        zwei fixed-Spalten übereinander → nur die Kanäle waren sichtbar.
 *        Fix: gemeinsamer `.team-drawer` (Desktop display:contents, Mobile Flex-Drawer).
 * Bug 2: Untere Leiste war mit Logo, Versionstext, großem Feedback-Button und
 *        vielen Settings-Icons überladen → Nav-Icons verdrängt.
 *        Fix: auf Mobile nur Nav + Feedback + Profil + Abmelden sichtbar.
 */
test.describe('Mobile-Layout (Demo)', () => {
  test.use({ viewport: { width: 390, height: 844 } }); // iPhone-Format

  test('Teams- und Kanäle-Spalte liegen im gemeinsamen team-drawer', async ({ connectPage: page }) => {
    const drawer = page.locator('.team-drawer');
    await expect(drawer).toHaveCount(1, { timeout: 8_000 });
    // Beide Spalten stecken im Drawer (Teams + Kanäle)
    await expect(drawer.locator('.sidebar-content')).toHaveCount(2);
    // Mindestens ein Team ist gerendert (war der „unsichtbare" Teil)
    await expect(page.locator('[data-testid="team-visible"]').first()).toHaveCount(1);
  });

  test('Bottom-Bar zeigt Wichtigstes, blendet Ballast aus', async ({ connectPage: page }) => {
    // Ausgeblendet auf Mobile
    await expect(page.locator('.sidebar-logo')).toBeHidden();
    await expect(page.locator('.app-version')).toBeHidden();
    await expect(page.locator('.beta-feedback-btn')).toBeHidden();
    // Sichtbar: die wichtigsten Nav-Icons
    await expect(page.locator('button[aria-label="Teams & Kanäle"]').first()).toBeVisible();
    await expect(page.locator('button[aria-label="Chats"]').first()).toBeVisible();
    await expect(page.locator('button[aria-label="Dateiablage"]').first()).toBeVisible();
    // Abmelden bleibt erreichbar
    await expect(page.locator('button[aria-label="Abmelden"]').first()).toBeVisible();
  });
});
