import { test, expect } from '../fixtures/connect';

test.describe('KRS Connect — Smoke: Teams & Channels', () => {
  test('Sidebar zeigt mindestens ein Team', async ({ connectPage: page }) => {
    // Hauptlayout sollte sichtbar sein
    await expect(page.locator('aside, .sidebar, .app-layout, nav').first())
      .toBeVisible({ timeout: 10_000 });
    // Team "Kollegium" o.ä. in der Teamliste — nicht die S19-Topnav-Beschriftung
    // "Teams" (die am Desktop im DOM bleibt, aber display:none hat).
    await expect(page.locator('[data-testid="team-visible"]').first()).toBeVisible({ timeout: 8_000 });
  });

  test('Beitrag schreiben: Compact-Bar öffnet Editor', async ({ connectPage: page }) => {
    // Compact-Input-Button finden ("Beitrag schreiben...")
    const compactBtn = page.getByText(/Beitrag schreiben/i).first();
    if (await compactBtn.count() === 0) {
      test.skip(true, 'Kein aktiver Channel ausgewählt — Test skip');
    }
    await compactBtn.click();
    // Editor sollte sich öffnen (Titel-Input auftauchen)
    await expect(page.locator('input[placeholder*="Titel"]').first())
      .toBeVisible({ timeout: 4_000 });
  });

  test('Tab-Titel enthält "KRS Connect"', async ({ connectPage: page }) => {
    await expect(page).toHaveTitle(/KRS Connect/);
  });
});
