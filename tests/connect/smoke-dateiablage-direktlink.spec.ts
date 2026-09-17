import { test, expect } from '../fixtures/connect';

/**
 * Dateiablage — Sidebar-Direktlink (v4.18.0)
 *
 * Anforderung Norbert (30.07.2026): Nur noch cloud.realschule-schriesheim.de
 * als Speicher (nicht mehr iServ), und ein direkter Link ohne Umwege. Bis
 * v4.17.0 öffnete der Sidebar-Button ein Zwischen-Modal (FilesPlaceholderModal)
 * mit einem weiteren Klick auf den eigentlichen Nextcloud-Link. Seit v4.18.0
 * ist der Nav-Eintrag selbst ein <a href target="_blank">-Link, kein Modal
 * mehr dazwischen.
 *
 * Hinweis: username 'nk' existiert in den (anonymisierten) Demo-Mock-Daten
 * nicht mehr (S2b-Migration 'nk' → 'la', siehe MOCK_USERS-Kommentar in
 * index.html) — die connectPage-Fixture loggt standardmäßig 'la' ein.
 */
test.describe('Dateiablage — Sidebar-Direktlink (Demo)', () => {
  test('Dateiablage-Element ist ein Link auf die Nextcloud-URL, öffnet in neuem Tab', async ({ connectPage: page }) => {
    const link = page.locator('[data-testid="nav-dateiablage"]').first();
    await expect(link).toBeVisible({ timeout: 8_000 });

    // Muss ein <a>-Element sein (kein <button>, kein Modal-Trigger mehr).
    await expect(link).toHaveAttribute('href', 'https://cloud.realschule-schriesheim.de');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toHaveAttribute('title', 'Dateiablage (Nextcloud)');
    await expect(link).toHaveAttribute('aria-label', 'Dateiablage (Nextcloud)');

    const tagName = await link.evaluate(el => el.tagName.toLowerCase());
    expect(tagName).toBe('a');
  });

  test('Dateiablage öffnet ohne Zwischen-Modal in einem neuen Tab', async ({ connectPage: page }) => {
    const link = page.locator('[data-testid="nav-dateiablage"]').first();
    await expect(link).toBeVisible({ timeout: 8_000 });

    // Den externen Nextcloud-Host nicht laden: Er ist kein Bestandteil dieses
    // UI-Tests und kann in CI unabhängig von Connect kurzzeitig unerreichbar sein.
    // href + target belegen den direkten neuen Tab ohne Zwischen-Modal.
    await expect(link).toHaveAttribute('href', 'https://cloud.realschule-schriesheim.de');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(page.locator('.modal-overlay[aria-label="Dateiablage"]')).toHaveCount(0);
  });
});
