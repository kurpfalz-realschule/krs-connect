import { test, expect, openHub, HUB_PATH } from '../fixtures/hub';
import { Page } from '@playwright/test';

/**
 * B5 · Schulleitungs-Board — Mitteilungen & Dienste editierbar (2026-07-06)
 *
 * Ergänzt B1: Neben Terminen/FAQ pflegen Editoren (role='admin' ODER
 * users.hub_editor, z. B. Daniel/Sm) jetzt auch die Mitteilungen-Box
 * (typ='mitteilung', Richtext) und die Dienste-Leiste Küche/Hof
 * (typ='dienst', Klartext-Wert) — dieselbe hub_infos-Tabelle + RLS.
 * Hier: UI-Verhalten im Demo-Modus (forceMode=demo, Store
 * window.__HUB_INFO_STORE mit demo-m1/m2 + demo-d1/d2).
 */

async function openHubAs(page: Page, kuerzel: string) {
  await page.goto(`${HUB_PATH}?forceMode=demo&forceUser=${kuerzel}`);
  await page.waitForFunction(
    () => typeof (window as any).KRS_HUB_VERSION === 'string',
    null,
    { timeout: 10_000 }
  );
}

test.describe('KRS Hub — B5: Mitteilungen & Dienste editierbar', () => {

  test('Board rendert Mitteilungen- und Dienste-Sektion mit Demo-Daten', async ({ hubPage: page }) => {
    await expect(page.getByTestId('board-mitteilungen')).toBeVisible();
    await expect(page.getByTestId('board-dienste')).toBeVisible();
    await expect(page.getByTestId('board-mitteilungen')).toContainText('USB-Sticks zurückgeben');
    await expect(page.getByTestId('board-dienste')).toContainText('Küchendienst');
    await expect(page.getByTestId('board-dienste')).toContainText('Klasse 9a');
  });

  test('Editor (Superadmin Ko) sieht Hinzufügen- und Bearbeiten-Buttons', async ({ page }) => {
    await openHubAs(page, 'Ko');
    await expect(page.getByTestId('board-add-mitteilung')).toBeVisible();
    await expect(page.getByTestId('board-add-dienst')).toBeVisible();
    await expect(page.getByTestId('info-edit-demo-m1')).toBeVisible();
    await expect(page.getByTestId('info-edit-demo-d1')).toBeVisible();
  });

  test('Nicht-Editor (L3, member) sieht KEINE Bearbeiten-Buttons', async ({ page }) => {
    await openHubAs(page, 'L3');
    await expect(page.getByTestId('board-mitteilungen')).toBeVisible();
    await expect(page.getByTestId('board-add-mitteilung')).toHaveCount(0);
    await expect(page.getByTestId('board-add-dienst')).toHaveCount(0);
    await expect(page.getByTestId('info-edit-demo-m1')).toHaveCount(0);
    await expect(page.getByTestId('info-edit-demo-d1')).toHaveCount(0);
  });

  test('Editor kann Mitteilung anlegen (Richtext, Demo-Store: Create)', async ({ page }) => {
    await openHubAs(page, 'Ko');
    await page.getByTestId('board-add-mitteilung').click();
    await expect(page.getByTestId('info-edit-modal')).toBeVisible();
    await page.getByTestId('info-edit-titel').fill('E2E-Mitteilung');
    await page.getByTestId('info-edit-body').click();
    await page.keyboard.type('Kurzer Hinweis aus dem Test.');
    await page.getByTestId('info-edit-save').click();
    await expect(page.getByTestId('info-edit-modal')).toHaveCount(0);
    await expect(page.getByTestId('board-mitteilungen')).toContainText('E2E-Mitteilung');
  });

  test('Editor kann Dienst-Wert bearbeiten (Klartext-Feld, Demo-Store: Update)', async ({ page }) => {
    await openHubAs(page, 'Ko');
    await page.getByTestId('info-edit-demo-d1').click();
    // Dienst nutzt Klartext-Feld statt Richtext-Editor
    const plain = page.getByTestId('info-edit-plain');
    await expect(plain).toHaveValue('Klasse 9a');
    await expect(page.getByTestId('info-edit-body')).toHaveCount(0);
    await plain.fill('Klasse 8b');
    await page.getByTestId('info-edit-save').click();
    await expect(page.getByTestId('board-dienste')).toContainText('Klasse 8b');
    await expect(page.getByTestId('board-dienste')).not.toContainText('Klasse 9a');
  });

  test('Editor kann neuen Dienst anlegen (Demo-Store: Create)', async ({ page }) => {
    await openHubAs(page, 'Ko');
    await page.getByTestId('board-add-dienst').click();
    await expect(page.getByTestId('info-edit-modal')).toBeVisible();
    await page.getByTestId('info-edit-titel').fill('🧹 Tafeldienst');
    await page.getByTestId('info-edit-plain').fill('Klasse 7a');
    await page.getByTestId('info-edit-save').click();
    await expect(page.getByTestId('info-edit-modal')).toHaveCount(0);
    await expect(page.getByTestId('board-dienste')).toContainText('Tafeldienst');
    await expect(page.getByTestId('board-dienste')).toContainText('Klasse 7a');
  });

  test('Editor kann Mitteilung löschen (Demo-Store: Delete)', async ({ page }) => {
    await openHubAs(page, 'Ko');
    page.on('dialog', d => d.accept());
    await page.getByTestId('info-delete-demo-m2').click();
    await expect(page.getByTestId('board-mitteilungen')).not.toContainText('USB-Sticks zurückgeben');
  });

  test('XSS: Script-Payload in Mitteilung wird sanitisiert', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__HUB_INFO_STORE = [{
        id: 'demo-mxss', typ: 'mitteilung', position: 0,
        titel: 'XSS-Mitteilung',
        inhalt_html: '<img src=x onerror="window.__XSS_FIRED=true">'
          + '<scr' + 'ipt>window.__XSS_FIRED=true</scr' + 'ipt><b>ok</b>',
        datum: null,
      }];
    });
    await openHub(page);
    const box = page.getByTestId('board-mitteilungen');
    await expect(box).toContainText('ok');
    await expect(box.locator('img')).toHaveCount(0);
    const fired = await page.evaluate(() => (window as any).__XSS_FIRED === true);
    expect(fired, 'XSS-Payload darf nicht ausgeführt werden').toBe(false);
  });

  test('Dienst-Wert wird als Klartext gerendert (kein rohes HTML)', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__HUB_INFO_STORE = [{
        id: 'demo-dhtml', typ: 'dienst', position: 0,
        titel: '🍽 Küchendienst',
        inhalt_html: '<b>9a</b>',
        datum: null,
      }];
    });
    await openHub(page);
    const box = page.getByTestId('board-dienste');
    await expect(box).toContainText('9a');
    // htmlToText → Klartext, kein <b>-Element im Dienst-Wert
    await expect(box.locator('.dienst-value b')).toHaveCount(0);
  });
});
