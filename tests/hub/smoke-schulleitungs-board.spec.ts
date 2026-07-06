import { test, expect, openHub, HUB_PATH } from '../fixtures/hub';
import { Page } from '@playwright/test';

/**
 * B1 · Schulleitungs-Board (2026-07-05)
 *
 * FAQs + wichtige Termine auf der Hub-Startseite, live aus hub_infos.
 * Schreiben dürfen nur role='admin' oder users.hub_editor (Daniel/Sm) —
 * serverseitig per RLS erzwungen, hier wird das UI-Verhalten im
 * Demo-Modus geprüft (forceMode=demo, Demo-Store window.__HUB_INFO_STORE).
 */

async function openHubAs(page: Page, kuerzel: string) {
  await page.goto(`${HUB_PATH}?forceMode=demo&forceUser=${kuerzel}`);
  await page.waitForFunction(
    () => typeof (window as any).KRS_HUB_VERSION === 'string',
    null,
    { timeout: 10_000 }
  );
}

test.describe('KRS Hub — B1: Schulleitungs-Board', () => {

  test('Board rendert Termine- und FAQ-Sektion mit Demo-Daten', async ({ hubPage: page }) => {
    await expect(page.getByTestId('board-termine')).toBeVisible();
    await expect(page.getByTestId('board-faq')).toBeVisible();
    // Demo-Seed: Termine liegen im Jahr 2099 → nie „abgelaufen"
    await expect(page.getByTestId('board-termine')).toContainText('Dienstbesprechung');
    await expect(page.getByTestId('board-faq')).toContainText('Wie buche ich iPads?');
    // Kalender-Link vorhanden
    await expect(page.getByTestId('board-termine').locator('a', { hasText: 'Schulkalender' })).toBeVisible();
  });

  test('FAQ-Antwort öffnet als Akkordeon und rendert sanitisiertes HTML', async ({ hubPage: page }) => {
    await page.getByRole('button', { name: /Wie buche ich iPads/ }).click();
    const detail = page.locator('.faq-detail');
    await expect(detail.first()).toBeVisible();
    // <b> aus dem Demo-Inhalt bleibt erhalten (Allowlist)
    await expect(detail.first().locator('b')).toContainText('iPad-Buchung');
  });

  test('Editor (Superadmin Ko) sieht Bearbeiten-Buttons', async ({ page }) => {
    await openHubAs(page, 'Ko');
    await expect(page.getByTestId('board-add-termin')).toBeVisible();
    await expect(page.getByTestId('board-add-faq')).toBeVisible();
    await expect(page.getByTestId('info-edit-demo-f1')).toBeVisible();
  });

  test('Nicht-Editor (L3, member) sieht KEINE Bearbeiten-Buttons', async ({ page }) => {
    await openHubAs(page, 'L3');
    await expect(page.getByTestId('board-termine')).toBeVisible();
    await expect(page.getByTestId('board-add-termin')).toHaveCount(0);
    await expect(page.getByTestId('board-add-faq')).toHaveCount(0);
    await expect(page.getByTestId('info-edit-demo-f1')).toHaveCount(0);
  });

  test('Editor kann FAQ anlegen (Demo-Store CRUD: Create)', async ({ page }) => {
    await openHubAs(page, 'Ko');
    await page.getByTestId('board-add-faq').click();
    await expect(page.getByTestId('info-edit-modal')).toBeVisible();
    await page.getByTestId('info-edit-titel').fill('Testfrage aus Playwright?');
    await page.getByTestId('info-edit-body').click();
    await page.keyboard.type('Antwort aus dem E2E-Test.');
    await page.getByTestId('info-edit-save').click();
    await expect(page.getByTestId('info-edit-modal')).toHaveCount(0);
    await expect(page.getByTestId('board-faq')).toContainText('Testfrage aus Playwright?');
  });

  test('Editor kann Termin bearbeiten (Demo-Store CRUD: Update)', async ({ page }) => {
    await openHubAs(page, 'Ko');
    await page.getByTestId('info-edit-demo-t1').click();
    const titel = page.getByTestId('info-edit-titel');
    await expect(titel).toHaveValue(/Dienstbesprechung/);
    await titel.fill('Dienstbesprechung NEU 14:00 Uhr');
    await page.getByTestId('info-edit-save').click();
    await expect(page.getByTestId('board-termine')).toContainText('Dienstbesprechung NEU 14:00 Uhr');
  });

  test('Editor kann Eintrag löschen (Demo-Store CRUD: Delete)', async ({ page }) => {
    await openHubAs(page, 'Ko');
    page.on('dialog', d => d.accept());
    await page.getByTestId('info-delete-demo-f2').click();
    await expect(page.getByTestId('board-faq')).not.toContainText('Wer hilft bei Technik-Fragen?');
  });

  test('XSS: Script-/Event-Handler-Payloads überleben die Sanitisierung nicht', async ({ page }) => {
    // Demo-Store VOR dem App-Code seeden (App seedet nur, wenn leer)
    await page.addInitScript(() => {
      (window as any).__HUB_INFO_STORE = [{
        id: 'demo-xss', typ: 'faq', position: 99,
        titel: 'XSS-Test',
        inhalt_html: '<img src=x onerror="window.__XSS_FIRED=true">'
          + '<scr' + 'ipt>window.__XSS_FIRED=true</scr' + 'ipt><b>ok</b>',
        datum: null,
      }];
    });
    await openHub(page);
    await page.getByRole('button', { name: 'XSS-Test' }).click();
    const detail = page.locator('.faq-detail').first();
    await expect(detail).toContainText('ok');
    await expect(detail.locator('img')).toHaveCount(0);
    const fired = await page.evaluate(() => (window as any).__XSS_FIRED === true);
    expect(fired, 'XSS-Payload darf nicht ausgeführt werden').toBe(false);
  });

  test('Vergangene Termine werden ausgeblendet', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__HUB_INFO_STORE = [
        { id: 'demo-past', typ: 'termin', position: 0, titel: 'Uralt-Termin', inhalt_html: '', datum: '2020-01-01' },
        { id: 'demo-fut', typ: 'termin', position: 0, titel: 'Zukunfts-Termin', inhalt_html: '', datum: '2099-01-01' },
      ];
    });
    await openHub(page);
    await expect(page.getByTestId('board-termine')).toBeVisible();
    await expect(page.getByTestId('board-termine')).toContainText('Zukunfts-Termin');
    await expect(page.getByTestId('board-termine')).not.toContainText('Uralt-Termin');
  });
});
