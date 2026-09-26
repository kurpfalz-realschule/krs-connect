// tests/connect/smoke-paket-d.spec.ts
// Paket D (4.45.0) — Feierabend (D3), Thread-Antworten ungelesen (D1),
// Kenntnisnahme hinter Flag (D2). Demo-Modus.
//
// Server-Teile (krs_is_quiet, rpc_unread_thread_counts, ack_status, Edge
// notify-push) sind per SQL-Trockenlauf/net.http_post geprüft (HANDOVER 0BJ);
// hier geht es um die Oberfläche und das Zusammenspiel im Client.

import { test, expect } from '@playwright/test';
import { openConnect, waitForAppReady } from '../fixtures/connect';

async function einstellungenOeffnen(page) {
  await page.locator('button[aria-label="Einstellungen öffnen"]').first().click();
  const dlg = page.locator('.modal-overlay[aria-label="Einstellungen"]').first();
  await expect(dlg).toBeVisible({ timeout: 5_000 });
  return dlg;
}

test.describe('D3 Feierabend — Einstellungen (Demo)', () => {
  test.beforeEach(async ({ page }) => {
    await openConnect(page, { user: 'la' });
    await waitForAppReady(page);
  });

  test('Standard 18–7 Uhr, Wochenende + Ferien an; Änderungen bleiben gespeichert', async ({ page }) => {
    let dlg = await einstellungenOeffnen(page);
    const sek = dlg.locator('[data-testid="quiet-section"]');
    await expect(sek).toContainText('Feierabend');
    await expect(sek).toContainText('Dringende Beiträge kommen immer durch');
    const schalter = sek.getByRole('switch', { name: 'Feierabend-Modus umschalten' });
    await expect(schalter).toHaveAttribute('aria-checked', 'true');
    await expect(sek.locator('[data-testid="quiet-start"]')).toHaveValue('18:00');
    await expect(sek.locator('[data-testid="quiet-end"]')).toHaveValue('07:00');
    await expect(sek.locator('[data-testid="quiet-weekend"]')).toBeChecked();
    await expect(sek.locator('[data-testid="quiet-holidays"]')).toBeChecked();

    // Zeit ändern + Ferien aus → gespeichert
    await sek.locator('[data-testid="quiet-start"]').fill('20:30');
    await expect(sek.locator('[data-testid="quiet-status"]')).toHaveText(/Gespeichert/);
    await sek.locator('[data-testid="quiet-holidays"]').uncheck();

    // Panel schließen und wieder öffnen → Werte bleiben
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal-overlay[aria-label="Einstellungen"]')).toHaveCount(0);
    dlg = await einstellungenOeffnen(page);
    const sek2 = dlg.locator('[data-testid="quiet-section"]');
    await expect(sek2.locator('[data-testid="quiet-start"]')).toHaveValue('20:30');
    await expect(sek2.locator('[data-testid="quiet-holidays"]')).not.toBeChecked();
    await expect(sek2.locator('[data-testid="quiet-weekend"]')).toBeChecked();
  });

  test('Modus aus blendet Zeiten aus und bleibt aus', async ({ page }) => {
    let dlg = await einstellungenOeffnen(page);
    const schalter = dlg.getByRole('switch', { name: 'Feierabend-Modus umschalten' });
    await schalter.click();
    await expect(schalter).toHaveAttribute('aria-checked', 'false');
    await expect(dlg.locator('[data-testid="quiet-start"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    dlg = await einstellungenOeffnen(page);
    await expect(dlg.getByRole('switch', { name: 'Feierabend-Modus umschalten' })).toHaveAttribute('aria-checked', 'false');
  });

  test('Zeitfelder sind groß genug zum Tippen (≥ 44 px, Schrift ≥ 16 px gegen iOS-Zoom)', async ({ page }) => {
    const dlg = await einstellungenOeffnen(page);
    const feld = dlg.locator('[data-testid="quiet-start"]');
    const box = await feld.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    const fs = await feld.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fs).toBeGreaterThanOrEqual(16);
  });
});

test.describe('D1 Thread-Antworten ungelesen (Demo)', () => {
  test.beforeEach(async ({ page }) => {
    await openConnect(page, { user: 'la' });
    await waitForAppReady(page);
  });

  test('„2 neue Antworten" am eigenen Beitrag, verschwindet nach Öffnen des Threads', async ({ page }) => {
    const badge = page.locator('[data-testid="thread-unread-badge"]');
    await expect(badge).toHaveCount(1, { timeout: 10_000 });
    await expect(badge).toHaveText('2 neue Antworten');
    // Knopf nennt die neuen Antworten auch für Vorleseprogramme
    const knopf = page.locator('.post-footer button').filter({ has: badge });
    await expect(knopf).toHaveAttribute('aria-label', /2 neu$/);

    await knopf.click();
    await expect(page.locator('.thread-panel').first()).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="thread-unread-badge"]')).toHaveCount(0);
  });
});

test.describe('D2 Kenntnisnahme (Demo)', () => {
  async function dringendVonAnderen(page) {
    // Dringend-Beitrag von „Lehrkraft B" (id 2) in Kanal 1 anlegen, dann
    // Kanal neu laden (anderen Kanal wählen und zurück) — wie ein Realtime-Eingang.
    await page.evaluate(async () => {
      const DS = (window as any).DataService;
      const ds = new DS(null);
      await ds.createPost(1, 2, '<p>Bitte bis morgen lesen.</p>', 'D2-Test', null, true);
    });
  }

  async function kanalNeuLaden(page) {
    // Anderen Kanal wählen und zurück → getPosts lädt den neuen Beitrag
    await page.getByText('FAQ und Infos', { exact: true }).first().click();
    await expect(page.getByText('FAQ und Infos Schulwoche 12').first()).toBeVisible({ timeout: 8_000 });
    await page.getByText('Allgemein', { exact: true }).first().click();
  }

  test('Flag aus (Standard): kein Kenntnisnahme-Knopf', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    await waitForAppReady(page);
    const r = await page.evaluate(() => (window as any).KRS_VERSION);
    expect(r).toBe('4.45.0');
    await expect(page.locator('[data-testid="ack-bar"]')).toHaveCount(0);
    // Auch der Live-Build hat das Flag aus
    const flag = await page.evaluate(() => document.documentElement.outerHTML.includes('ACK: false,'));
    expect(flag).toBe(true);
  });

  test('Flag an (Demo): bestätigen, Zähler, Liste nur für Verfasser:in', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('KRS_FEATURE_ACK', '1'); } catch (e) {} });
    await openConnect(page, { user: 'la' });
    await waitForAppReady(page);
    await dringendVonAnderen(page);
    await kanalNeuLaden(page);

    const bar = page.locator('.post').filter({ hasText: 'Bitte bis morgen lesen.' }).locator('[data-testid="ack-bar"]');
    await expect(bar).toBeVisible({ timeout: 8_000 });
    await expect(bar.locator('[data-testid="ack-count"]')).toHaveText('0 von 7 bestätigt');
    // „la" ist in der Demo Admin → darf die Liste sehen (wie Schulleitung)
    await expect(bar.locator('[data-testid="ack-missing-toggle"]')).toHaveText('fehlt noch: 7');

    await bar.locator('[data-testid="ack-btn"]').click();
    await expect(bar.locator('[data-testid="ack-btn"]')).toHaveText('✓ bestätigt');
    await expect(bar.locator('[data-testid="ack-btn"]')).toBeDisabled();
    await expect(bar.locator('[data-testid="ack-count"]')).toHaveText('1 von 7 bestätigt');
    await bar.locator('[data-testid="ack-missing-toggle"]').click();
    await expect(bar.locator('[data-testid="ack-missing"]')).not.toContainText('Lehrkraft A');
    await expect(bar.locator('[data-testid="ack-missing"]')).toContainText('Anna L.');
  });

  test('Flag an (Demo): normale Lehrkraft sieht nur die Zahl, keine Namen', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('KRS_FEATURE_ACK', '1'); } catch (e) {} });
    await openConnect(page, { user: 'al' }); // Anna L., role member
    await waitForAppReady(page);
    await dringendVonAnderen(page);
    await kanalNeuLaden(page);
    const bar = page.locator('.post').filter({ hasText: 'Bitte bis morgen lesen.' }).locator('[data-testid="ack-bar"]');
    await expect(bar).toBeVisible({ timeout: 8_000 });
    await expect(bar.locator('[data-testid="ack-count"]')).toHaveText(/von 7 bestätigt/);
    await expect(bar.locator('[data-testid="ack-missing-toggle"]')).toHaveCount(0);
  });
});

test.describe('0BJ-Folge: Beiträge-Ladefehler + eindeutige Einbettung', () => {
  test('getPosts fragt mit FK-Hinweis ab und meldet Fehler statt still leer', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    await waitForAppReady(page);
    const r = await page.evaluate(async () => {
      const w = window as any;
      const log: string[] = [];
      const chain: any = {
        select(s: string) { log.push(s); return chain; },
        eq() { return chain; }, is() { return chain; }, order() { return chain; },
        range() { return Promise.resolve({ data: null, error: { code: 'PGRST201', message: 'mehrdeutig' } }); },
      };
      const ds = new w.DataService(null); ds.isDemo = false; ds.sb = { from: () => chain };
      const posts = await ds.getPosts(77);
      return { posts, fehler: ds._postsFehler, select: log[0] };
    });
    expect(r.posts).toEqual([]);
    expect(r.fehler).toBe(77);
    expect(r.select).toContain('author:users!posts_author_id_fkey(');
    await expect(page.locator('.toast').filter({ hasText: 'Beiträge konnten nicht geladen werden' }).first()).toBeVisible();
  });
});
