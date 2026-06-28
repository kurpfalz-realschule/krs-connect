import { test, expect } from '../fixtures/connect';

/**
 * v4.10.0 — Sidebar-Reorg & Einstellungen-Panel
 *
 * Prüft die aufgeräumte Nav-Leiste und das neue ⚙️ Einstellungen-Panel:
 *  - genau EIN Feedback-Einstieg in der Leiste (großer Beta-Button)
 *  - keine Suche-/Saved-Nav-Items mehr in der Icon-Rail
 *  - ⚙️ öffnet das Panel mit allen 4 Abschnitten inkl. Changelog v4.10.0
 *  - 🔍 neben „Teams" öffnet die Such-Ansicht
 *  - „Gespeichert & gepinnt" oben in der Chat-Spalte öffnet die Saved-Ansicht
 */

test.describe('v4.10.0 Einstellungen-Panel (Demo)', () => {
  test('⚙️ öffnet Panel mit allen 4 Abschnitten + Changelog v4.10.0', async ({ connectPage: page }) => {
    const btn = page.locator('button[aria-label="Einstellungen öffnen"]').first();
    if (await btn.count() === 0) {
      test.skip(true, 'Einstellungen-Button nicht gefunden — UI-Variante');
    }
    await expect(btn).toBeVisible({ timeout: 5_000 });
    await btn.click();

    const dialog = page.locator('.modal-overlay[aria-label="Einstellungen"]').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog).toContainText('Benachrichtigungen');
    await expect(dialog).toContainText('Lesebestätigungen');
    await expect(dialog).toContainText(/Hilfe/i);
    await expect(dialog).toContainText('Was ist neu');
    // Changelog enthält die aktuelle Version
    await expect(dialog).toContainText('v4.10.0');
  });

  test('Zurück-Navigation: Einstellungen → Hilfe → „← Zurück" landet wieder in Einstellungen', async ({ connectPage: page }) => {
    const btn = page.locator('button[aria-label="Einstellungen öffnen"]').first();
    if (await btn.count() === 0) {
      test.skip(true, 'Einstellungen-Button nicht gefunden — UI-Variante');
    }
    await btn.click();
    const settings = page.locator('.modal-overlay[aria-label="Einstellungen"]').first();
    await expect(settings).toBeVisible({ timeout: 5_000 });

    // Hilfe öffnen (push auf den Modal-Stack)
    await page.getByRole('button', { name: '❓ Hilfe & Tipps' }).first().click();
    await expect(page.getByRole('heading', { name: /Hilfe & Tipps/ }).first()).toBeVisible({ timeout: 5_000 });
    // Nur oberstes Modal sichtbar → Einstellungen ist verdeckt/entfernt
    await expect(page.locator('.modal-overlay[aria-label="Einstellungen"]')).toHaveCount(0);

    // „← Zurück" führt eine Ebene hoch — zurück zu den Einstellungen
    const back = page.getByRole('button', { name: 'Zurück' }).first();
    await expect(back).toBeVisible({ timeout: 5_000 });
    await back.click();
    await expect(page.locator('.modal-overlay[aria-label="Einstellungen"]').first()).toBeVisible({ timeout: 5_000 });
  });

  test('Was-ist-neu zeigt die volle Chronik bis zurück zum Start (März 2026)', async ({ connectPage: page }) => {
    const btn = page.locator('button[aria-label="Einstellungen öffnen"]').first();
    if (await btn.count() === 0) {
      test.skip(true, 'Einstellungen-Button nicht gefunden — UI-Variante');
    }
    await btn.click();
    const dialog = page.locator('.modal-overlay[aria-label="Einstellungen"]').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    // Aktuellste Version oben …
    await expect(dialog).toContainText('v4.10.5');
    // … und die historischen Meilensteine bis zum Projektstart
    await expect(dialog).toContainText('v4.0.0');
    await expect(dialog).toContainText('März 2026 — Start');
  });

  test('Panel schließt per Schließen-Button und per ESC', async ({ connectPage: page }) => {
    const btn = page.locator('button[aria-label="Einstellungen öffnen"]').first();
    if (await btn.count() === 0) {
      test.skip(true, 'Einstellungen-Button nicht gefunden — UI-Variante');
    }
    // Schließen-Button
    await btn.click();
    const dialog = page.locator('.modal-overlay[aria-label="Einstellungen"]').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog.locator('button[aria-label="Schließen"]').first().click();
    await expect(dialog).toHaveCount(0, { timeout: 5_000 });

    // ESC
    await btn.click();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0, { timeout: 5_000 });
  });

  test('Benachrichtigungs-Schalter ist als role=switch erreichbar', async ({ connectPage: page }) => {
    const btn = page.locator('button[aria-label="Einstellungen öffnen"]').first();
    if (await btn.count() === 0) {
      test.skip(true, 'Einstellungen-Button nicht gefunden — UI-Variante');
    }
    await btn.click();
    const dialog = page.locator('.modal-overlay[aria-label="Einstellungen"]').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    const switches = dialog.locator('[role="switch"]');
    // Benachrichtigungen + Lesebestätigungen → 2 Schalter
    await expect(switches).toHaveCount(2);
  });
});

test.describe('v4.10.0 Nav-Leiste aufgeräumt (Demo)', () => {
  test('Genau ein Feedback-Einstieg in der Leiste (Beta-Button)', async ({ connectPage: page }) => {
    // Großer Beta-Feedback-Button vorhanden
    await expect(page.locator('.beta-feedback-btn')).toHaveCount(1);
    // Kein kleiner 📣 in der unteren Leiste mehr (alter aria-label)
    await expect(page.locator('.sidebar-bottom button[aria-label="Feedback geben"]')).toHaveCount(0);
  });

  test('Keine Suche-/Saved-Nav-Items in der Icon-Rail', async ({ connectPage: page }) => {
    // Such-Ansicht wird nicht mehr über ein Rail-nav-item mit aria-label „Suche" geöffnet
    await expect(page.locator('.sidebar-nav button[aria-label="Suche"]')).toHaveCount(0);
    await expect(page.locator('.sidebar-nav button[aria-label="Lesezeichen"]')).toHaveCount(0);
  });

  test('⚙️ Einstellungen sichtbar, Admin entkoppelt (🛠️ statt ⚙️)', async ({ connectPage: page }) => {
    await expect(page.locator('button[aria-label="Einstellungen öffnen"]')).toHaveCount(1);
    // nk ist Admin im Demo-Modus → 🛠️-Button da
    const adminBtn = page.locator('button[aria-label="Admin-Panel öffnen"]').first();
    if (await adminBtn.count() > 0) {
      await expect(adminBtn).toContainText('🛠️');
    }
  });
});

test.describe('v4.10.0 Suche & Gespeichert in den Ansichten (Demo)', () => {
  test('🔍 neben „Teams" öffnet die Such-Ansicht', async ({ connectPage: page }) => {
    const searchBtn = page.locator('button[aria-label="Suche öffnen"]').first();
    if (await searchBtn.count() === 0) {
      test.skip(true, 'Such-Button nicht gefunden — UI-Variante');
    }
    await searchBtn.click();
    // Such-Ansicht erkennbar an der Überschrift „Suche"
    await expect(page.getByRole('heading', { name: 'Suche' }).first()).toBeVisible({ timeout: 5_000 });
  });

  test('„Gespeichert & gepinnt" oben in der Chat-Spalte öffnet Saved-Ansicht', async ({ connectPage: page }) => {
    // In die Chat-Ansicht wechseln
    await page.locator('button[aria-label="Chats"]').first().click();
    const savedBtn = page.locator('.saved-section-btn').first();
    if (await savedBtn.count() === 0) {
      test.skip(true, 'Gespeichert-Abschnitt nicht gefunden — UI-Variante');
    }
    await expect(savedBtn).toBeVisible({ timeout: 5_000 });
    await savedBtn.click();
    await expect(page.getByRole('heading', { name: /Gespeicherte Nachrichten/ }).first()).toBeVisible({ timeout: 5_000 });
  });
});
