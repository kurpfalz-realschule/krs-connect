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

/**
 * 320px-Reflow-Test mit geöffnetem Dialog (Empfehlung aus A11Y-SPEC.md 7.1,
 * Block C „200-%-Zoom/Reflow"): bisher war kein Dialog/Composer Teil eines
 * Reflow-Tests, und 320px (statt nur 390px) war ebenfalls nicht geprüft.
 */
test.describe('Mobile-Layout 320px — Reflow mit offenem Dialog (Demo)', () => {
  test.use({ viewport: { width: 320, height: 568 } }); // iPhone SE-Format

  async function hasHorizontalOverflow(page) {
    return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  }

  test('Hauptansicht hat bei 320px kein horizontales Scrollen', async ({ connectPage: page }) => {
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });

  test('Einstellungen-Dialog bei 320px: kein horizontales Scrollen, Dialog bleibt bedienbar', async ({ connectPage: page }) => {
    const trigger = page.locator('button[aria-label="Einstellungen öffnen"]').first();
    await expect(trigger).toBeVisible({ timeout: 5_000 });
    await trigger.click();

    const dialog = page.locator('.modal-overlay[aria-label="Einstellungen"]').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Der eigentliche Reflow-Check: mit offenem Dialog darf die Seite nicht
    // breiter werden als der 320-px-Viewport.
    expect(await hasHorizontalOverflow(page)).toBe(false);

    // Schließen bleibt bei 320px funktionsfähig (Backdrop-Klick, siehe
    // smoke-a11y-focus.spec.ts für den Desktop-Viewport-Fall).
    await page.mouse.click(4, 4);
    await expect(dialog).toHaveCount(0);
  });
});
