import { test as base, expect } from '@playwright/test';
import { openConnect } from '../fixtures/connect';

/**
 * PRIV-01 (4.47.0) — Mehr Privatsphäre im Kollegium.
 *
 *  - „Wer ist online" (Zähler unten in der Leiste, Button in der Chat-Spalte,
 *    grüne/graue Punkte an Chat-Avataren, „Online" im Chat-Kopf) sehen nur
 *    Admins/Owner.
 *  - „Gelesen von" an Beiträgen sehen nur Admins/Owner (Demo-Modus lädt keine
 *    Leserlisten, darum hier nur Admin/Member-Sichtbarkeit des Online-Status
 *    und der neue Einstellungs-Hinweis; die Leserliste ist per Code-Gate
 *    `canSeeReadReceipts` abgesichert).
 *
 * Demo-Personas: 'la' = admin, 'al' = member.
 */

async function openChats(page) {
  await page.getByRole('button', { name: /chat|nachricht/i }).first().click();
  await expect(page.getByRole('button', { name: /Neuer Chat/i }).first()).toBeVisible({ timeout: 4_000 });
}

base.describe('PRIV-01 Online-Status nur für Admins', () => {
  base('Admin sieht Online-Zähler, Online-Button im Chat und Status-Punkte', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    await expect(page.getByTestId('online-indicator')).toBeVisible({ timeout: 8_000 });
    await openChats(page);
    await expect(page.locator('button[aria-label="Wer ist online"]')).toBeVisible();
    await expect(page.locator('.conversation-list .avatar-status').first()).toBeAttached();
  });

  base('Kollegin (member) sieht keinen Online-Status', async ({ page }) => {
    await openConnect(page, { user: 'al' });
    // Leiste ist da (Einstellungen-Button), Online-Zähler aber nicht
    await expect(page.locator('button[aria-label="Einstellungen öffnen"]').first()).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('online-indicator')).toHaveCount(0);
    await expect(page.locator('.online-panel')).toHaveCount(0);
    await openChats(page);
    await expect(page.locator('button[aria-label="Wer ist online"]')).toHaveCount(0);
    await expect(page.locator('.conversation-list .avatar-status')).toHaveCount(0);
    await expect(page.locator('.online-dot')).toHaveCount(0);
  });

  base('Einstellungen erklären: nur Admins sehen Lesebestätigungen', async ({ page }) => {
    await openConnect(page, { user: 'al' });
    await page.locator('button[aria-label="Einstellungen öffnen"]').first().click();
    const dialog = page.locator('.modal-overlay[aria-label="Einstellungen"]').first();
    await expect(dialog).toContainText('Nur die Admins sehen, dass du einen Beitrag gelesen hast');
    await expect(dialog).toContainText('v4.54.0');
  });
});
