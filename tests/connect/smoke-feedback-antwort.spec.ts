import { test, expect, openConnect } from '../fixtures/connect';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/**
 * v4.53.0 — Antwort im Feedback-Board
 *
 * Unter einer Rückmeldung kann eine Antwort des Admin-Teams stehen.
 * Lesen: alle, die das Board öffnen. Schreiben, ändern, entfernen: nur Admins.
 *
 * Die eigentliche Sperre sitzt in der Datenbank (UPDATE auf feedback nur für
 * globale Admins, Trigger feedback_reply_guard, Migration
 * 2026-10-03_feedback-antwort.sql). Hier wird die Oberfläche geprüft und der
 * Aufruf, den die App an Supabase schickt.
 *
 * Demo-Personas: „la“ ist Admin, „al“ ist Mitglied (MOCK_USERS).
 * Demo-Daten: fb1 (erledigt) hat eine Antwort, fb2 und fb3 haben keine.
 */

async function openBoard(page: Page) {
  const beta = page.locator('.beta-feedback-btn').first();
  if (await beta.count() > 0 && await beta.isVisible()) {
    await beta.click();
  } else {
    // Schmale Ansicht: der Knopf sitzt nicht in der Leiste, der Weg führt über die Einstellungen.
    await page.getByRole('button', { name: 'Einstellungen öffnen' }).first().click();
    await page.getByRole('button', { name: /Feedback/ }).first().click();
  }
  await expect(page.locator('.fb-item').first()).toBeVisible({ timeout: 6_000 });
}

const item = (page: Page, text: string) => page.locator('.fb-item').filter({ hasText: text });

test.describe('4.53.0 Feedback-Antwort — DataService', () => {
  test('A1 Demo: setzen (ohne Rand-Leerzeichen), ändern, entfernen; unbekannte ID → null; über 2000 Zeichen wird gekürzt', async ({ connectPage: page }) => {
    const r = await page.evaluate(async () => {
      const ds = new (window as any).DataService(null);
      const find = async (id: string) => (await ds.getFeedback()).find((f: any) => String(f.id) === id);
      const vorher = (await find('fb2')).admin_reply ?? null;
      const a = await ds.setFeedbackReply('fb2', '   Erste Antwort  ');
      const gesetzt = { text: a.admin_reply, zeit: !!a.admin_reply_at };
      const b = await ds.setFeedbackReply('fb2', 'Zweite Antwort');
      const geaendert = b.admin_reply;
      const lang = (await ds.setFeedbackReply('fb2', 'x'.repeat(2500))).admin_reply.length;
      const c = await ds.setFeedbackReply('fb2', '   ');
      const entfernt = { text: c.admin_reply, zeit: c.admin_reply_at };
      const unbekannt = await ds.setFeedbackReply('gibt-es-nicht', 'x');
      const status = (await find('fb2')).status;
      // Wie der Server: getFeedback und setFeedbackReply liefern Kopien, kein Durchgriff auf den Demo-Store.
      const liste = await ds.getFeedback();
      liste.find((f: any) => f.id === 'fb1').admin_reply = 'von außen geändert';
      const kopie = (await find('fb1')).admin_reply !== 'von außen geändert';
      const rueck = await ds.setFeedbackReply('fb3', 'x'); rueck.admin_reply = 'y';
      const rueckKopie = (await find('fb3')).admin_reply === 'x';
      return { vorher, gesetzt, geaendert, lang, entfernt, unbekannt, status, kopie, rueckKopie };
    });
    expect(r.vorher).toBeNull();
    expect(r.gesetzt).toEqual({ text: 'Erste Antwort', zeit: true });
    expect(r.geaendert).toBe('Zweite Antwort');
    expect(r.lang).toBe(2000);
    expect(r.entfernt).toEqual({ text: null, zeit: null });
    expect(r.unbekannt).toBeNull();
    expect(r.status).toBe('in_arbeit'); // Antworten ändert den Status nicht
    expect(r.kopie).toBe(true);
    expect(r.rueckKopie).toBe(true);
  });

  test('A2 Server-Pfad: UPDATE auf feedback nur mit admin_reply und updated_at, gefiltert auf die ID; keine Zeit vom Gerät', async ({ connectPage: page }) => {
    const r = await page.evaluate(async () => {
      const w = window as any;
      const log: any[] = [];
      const fakeSb = {
        from: (table: string) => ({
          update: (row: any) => ({ eq: (col: string, val: any) => ({ select: () => ({ single: () => {
            log.push({ table, row, col, val });
            return Promise.resolve({ data: { id: val, ...row, admin_reply_at: row.admin_reply ? '2026-10-03T18:00:00Z' : null }, error: null });
          } }) }) }),
        }),
      };
      const ds = new w.DataService(null); ds.isDemo = false; ds.sb = fakeSb;
      const a = await ds.setFeedbackReply(56, '  Behoben in 4.52.3. ');
      const b = await ds.setFeedbackReply(56, '');
      return { a, b, log };
    });
    expect(r.log).toHaveLength(2);
    expect(r.log[0].table).toBe('feedback');
    expect(r.log[0].col).toBe('id');
    expect(r.log[0].val).toBe(56);
    expect(Object.keys(r.log[0].row).sort()).toEqual(['admin_reply', 'updated_at']);
    expect(r.log[0].row.admin_reply).toBe('Behoben in 4.52.3.');
    expect(r.log[1].row.admin_reply).toBeNull();        // leerer Text entfernt die Antwort
    expect(r.a.admin_reply_at).toBe('2026-10-03T18:00:00Z'); // Zeit kommt vom Server zurück
    expect(r.b.admin_reply_at).toBeNull();
  });

  test('A3 Server-Pfad: lehnt die Datenbank ab (kein Admin), kommt null zurück und eine verständliche Meldung', async ({ connectPage: page }) => {
    const r = await page.evaluate(async () => {
      const w = window as any;
      const fakeSb = {
        from: () => ({
          // So antwortet PostgREST, wenn die RLS-Regel keine Zeile durchlässt.
          update: () => ({ eq: () => ({ select: () => ({ single: () =>
            Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }) }) }) }),
        }),
      };
      const ds = new w.DataService(null); ds.isDemo = false; ds.sb = fakeSb;
      const res = await ds.setFeedbackReply(56, 'Versuch');
      const res2 = await ds.setFeedbackReply(56, '');
      return { res, res2 };
    });
    expect(r.res).toBeNull();
    expect(r.res2).toBeNull();
    await expect(page.locator('.toast').filter({ hasText: 'Antwort konnte nicht gespeichert werden. Bitte versuche es erneut.' }).first()).toBeVisible();
    await expect(page.locator('.toast').filter({ hasText: 'Antwort konnte nicht entfernt werden. Bitte versuche es erneut.' }).first()).toBeVisible();
  });
});

test.describe('4.53.0 Feedback-Antwort — Mitglied (kein Admin)', () => {
  test('A4 sieht die Antwort mit Datum, aber weder „Antworten“ noch „Antwort bearbeiten“ noch die Status-Auswahl', async ({ page }) => {
    await openConnect(page, { user: 'al' });
    await openBoard(page);

    const fb1 = item(page, 'Könnte man Beiträge auch anpinnen?');
    const antwort = fb1.locator('.fb-reply');
    await expect(antwort).toBeVisible();
    await expect(antwort.locator('.fb-reply-label')).toHaveText('💬 Antwort vom Admin-Team');
    await expect(antwort.locator('.fb-reply-text')).toContainText('„Anheften“');
    await expect(antwort.locator('.fb-item-meta')).toHaveText('22.06.26');   // Datum der Antwort, ohne Uhrzeit
    // Das Datum der Rückmeldung (21.06.) steht VOR der Antwort, nicht darunter.
    const reihenfolge = await fb1.evaluate((el) => {
      const kinder = [...el.children];
      const datum = kinder.findIndex((k) => k.classList.contains('fb-item-meta') && /21\.06\.26/.test(k.textContent || ''));
      const kasten = kinder.findIndex((k) => k.classList.contains('fb-reply'));
      return { datum, kasten, letztes: kinder[kinder.length - 1].className };
    });
    expect(reihenfolge.datum).toBeGreaterThan(-1);
    expect(reihenfolge.datum).toBeLessThan(reihenfolge.kasten);
    expect(reihenfolge.letztes).toBe('fb-reply');                             // keine Admin-Zeile darunter

    await expect(page.locator('.fb-reply')).toHaveCount(1);        // fb2 und fb3 haben keine
    await expect(page.locator('.fb-reply-btn')).toHaveCount(0);
    await expect(page.locator('.fb-reply-editor')).toHaveCount(0);
    await expect(page.locator('.fb-status-select')).toHaveCount(0);
    await expect(page.locator('.fb-item-admin')).toHaveCount(0);
    await expect(page.locator('.fb-board-modal').getByRole('button', { name: /Antwort/ })).toHaveCount(0);
  });
});

test.describe('4.53.0 Feedback-Antwort — Admin', () => {
  test('A5 antworten: leeres Feld sperrt „Antwort speichern“; nach dem Speichern steht die Antwort da und der Knopf heißt „Antwort bearbeiten“', async ({ connectPage: page }) => {
    await openBoard(page);
    const fb2 = item(page, 'Beim Hochladen eines PDFs');
    await expect(fb2.locator('.fb-reply')).toHaveCount(0);

    await fb2.getByRole('button', { name: 'Antworten auf die Rückmeldung von Lehrkraft C' }).click();
    const feld = fb2.locator('.fb-reply-textarea');
    await expect(feld).toBeFocused();
    await expect(feld).toHaveValue('');
    const speichern = fb2.getByRole('button', { name: 'Antwort speichern' });
    await expect(speichern).toBeDisabled();
    await expect(fb2.getByRole('button', { name: 'Antwort entfernen' })).toHaveCount(0); // nichts zu entfernen
    await expect(fb2.locator('.fb-reply-hint')).toContainText('Die Antwort sehen alle');

    await feld.fill('  Behoben: Der Upload läuft wieder durch.\nFalls nicht: Seite neu laden.  ');
    await expect(fb2.locator('.fb-reply-hint')).toContainText('/ 2000');
    await expect(speichern).toBeEnabled();
    await speichern.click();

    await expect(page.locator('.toast').filter({ hasText: 'Antwort gespeichert' }).first()).toBeVisible();
    await expect(fb2.locator('.fb-reply-editor')).toHaveCount(0);
    // Exakter Inhalt (Rand-Leerzeichen weg, Zeilenumbruch erhalten) und sichtbarer Umbruch.
    expect(await fb2.locator('.fb-reply-text').evaluate((el) => el.textContent)).toBe('Behoben: Der Upload läuft wieder durch.\nFalls nicht: Seite neu laden.');
    await expect(fb2.locator('.fb-reply-text')).toHaveCSS('white-space', 'pre-wrap');
    const knopf = fb2.getByRole('button', { name: 'Antwort bearbeiten zur Rückmeldung von Lehrkraft C' });
    await expect(knopf).toBeVisible();
    await expect(knopf).toBeFocused();                                  // Fokus zurück am Ausgangspunkt
    await expect(fb2.locator('.fb-badge')).toHaveText('In Arbeit');     // Status unverändert
  });

  test('A6 bearbeiten: Feld ist vorbelegt, unverändert bleibt „Antwort speichern“ gesperrt, geänderter Text ersetzt den alten', async ({ connectPage: page }) => {
    await openBoard(page);
    const fb1 = item(page, 'Könnte man Beiträge auch anpinnen?');
    await fb1.getByRole('button', { name: /^Antwort bearbeiten/ }).click();

    const feld = fb1.locator('.fb-reply-textarea');
    await expect(feld).toHaveValue(/„Anheften“/);
    await expect(fb1.locator('.fb-reply')).toHaveCount(0);              // während des Bearbeitens nicht doppelt
    const speichern = fb1.getByRole('button', { name: 'Antwort speichern' });
    await expect(speichern).toBeDisabled();

    await feld.fill('Neue Fassung der Antwort.');
    await speichern.click();
    await expect(fb1.locator('.fb-reply-text')).toHaveText('Neue Fassung der Antwort.');
    await expect(page.locator('.fb-reply')).toHaveCount(1);
  });

  test('A7 entfernen: die Antwort verschwindet, der Knopf heißt wieder „Antworten“', async ({ connectPage: page }) => {
    await openBoard(page);
    const fb1 = item(page, 'Könnte man Beiträge auch anpinnen?');
    await fb1.getByRole('button', { name: /^Antwort bearbeiten/ }).click();
    await fb1.getByRole('button', { name: 'Antwort entfernen' }).click();

    const toast = page.locator('.toast').filter({ hasText: 'Antwort entfernt' }).first();
    await expect(toast).toBeVisible();
    await expect(fb1.locator('.fb-reply')).toHaveCount(0);
    await expect(fb1.getByRole('button', { name: /^Antworten auf die Rückmeldung von/ })).toBeVisible();
    await expect(fb1.locator('.fb-badge')).toHaveText('Erledigt');

    // Entfernen fragt nicht nach, lässt sich aber zurücknehmen.
    await toast.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(fb1.locator('.fb-reply-text')).toContainText('„Anheften“');
    await expect(fb1.getByRole('button', { name: /^Antwort bearbeiten/ })).toBeVisible();
  });

  test('A8 abbrechen und Escape schließen nur den Editor; ein Klick neben das Fenster schließt das Board dann nicht', async ({ connectPage: page }) => {
    await openBoard(page);
    const fb3 = item(page, 'Viel besser als Teams');

    await fb3.getByRole('button', { name: /^Antworten/ }).click();
    await fb3.locator('.fb-reply-textarea').fill('Entwurf, der nicht gespeichert wird');
    await fb3.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(fb3.locator('.fb-reply-editor')).toHaveCount(0);
    await expect(fb3.locator('.fb-reply')).toHaveCount(0);
    await expect(fb3.locator('.fb-reply-btn')).toBeFocused();           // Fokus zurück am Ausgangspunkt

    await fb3.getByRole('button', { name: /^Antworten/ }).click();
    await fb3.locator('.fb-reply-textarea').fill('Noch ein Entwurf');
    await page.locator('.feedback-overlay').click({ position: { x: 5, y: 5 } });
    await expect(fb3.locator('.fb-reply-textarea')).toHaveValue('Noch ein Entwurf'); // Board und Entwurf noch da

    await page.keyboard.press('Escape');
    await expect(fb3.locator('.fb-reply-editor')).toHaveCount(0);
    await expect(page.locator('.fb-board-modal')).toBeVisible();        // Board bleibt offen
    await expect(fb3.locator('.fb-reply-btn')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.locator('.fb-board-modal')).toHaveCount(0);       // erst das zweite Escape schließt es
  });

  test('A9 Antwort ist reiner Text: HTML wird angezeigt, nicht ausgeführt', async ({ connectPage: page }) => {
    await openBoard(page);
    const fb2 = item(page, 'Beim Hochladen eines PDFs');
    const boese = '<img src=x onerror="window.__fbXss=1"> <b>fett</b> <script>window.__fbXss=2</script>';
    await fb2.getByRole('button', { name: /^Antworten/ }).click();
    await fb2.locator('.fb-reply-textarea').fill(boese);
    await fb2.getByRole('button', { name: 'Antwort speichern' }).click();

    const text = fb2.locator('.fb-reply-text');
    await expect(text).toHaveText(boese);
    expect(await text.locator('img, b, script').count()).toBe(0);
    expect(await page.evaluate(() => (window as any).__fbXss)).toBeUndefined();
  });

  test('A10 Filter: eine beantwortete Rückmeldung zeigt ihre Antwort auch in der gefilterten Ansicht; ein Statuswechsel lässt die Antwort stehen', async ({ connectPage: page }) => {
    await openBoard(page);
    await page.locator('.fb-board-filter', { hasText: 'Erledigt' }).click();
    const fb1 = item(page, 'Könnte man Beiträge auch anpinnen?');
    await expect(fb1.locator('.fb-reply-text')).toContainText('„Anheften“');

    await page.locator('.fb-board-filter', { hasText: 'Alle' }).click();
    await item(page, 'Könnte man Beiträge auch anpinnen?').locator('.fb-status-select').selectOption('in_arbeit');
    await expect(item(page, 'Könnte man Beiträge auch anpinnen?').locator('.fb-badge')).toHaveText('In Arbeit');
    await expect(item(page, 'Könnte man Beiträge auch anpinnen?').locator('.fb-reply-text')).toContainText('„Anheften“');
  });
});

test.describe('4.53.0 Feedback-Antwort — Admin, Randfälle', () => {
  test('A14 Filter „Offen“, Status während des Schreibens auf „Erledigt“: Eintrag und Entwurf bleiben stehen; nach dem Speichern fällt er aus der Ansicht, der Fokus bleibt im Board', async ({ connectPage: page }) => {
    await openBoard(page);
    await page.locator('.fb-board-filter', { hasText: 'Offen' }).click();
    const fb3 = item(page, 'Viel besser als Teams');
    await fb3.getByRole('button', { name: /^Antworten/ }).click();
    await fb3.locator('.fb-reply-textarea').fill('Danke!');

    await fb3.locator('.fb-status-select').selectOption('erledigt');
    await expect(fb3.locator('.fb-badge')).toHaveText('Erledigt');
    await expect(fb3.locator('.fb-reply-textarea')).toHaveValue('Danke!');   // nicht verschwunden

    await page.locator('.fb-board-filter', { hasText: 'In Arbeit' }).click();
    await expect(fb3.locator('.fb-reply-textarea')).toHaveValue('Danke!');   // auch nach Filterwechsel noch da

    await fb3.getByRole('button', { name: 'Antwort speichern' }).click();
    await expect(page.locator('.toast').filter({ hasText: 'Antwort gespeichert' }).first()).toBeVisible();
    await expect(item(page, 'Viel besser als Teams')).toHaveCount(0);        // jetzt gilt der Filter wieder
    await expect(page.locator('.fb-board-filter.active')).toBeFocused();

    await page.locator('.fb-board-filter', { hasText: 'Erledigt' }).click();
    await expect(item(page, 'Viel besser als Teams').locator('.fb-reply-text')).toHaveText('Danke!');
  });

  test('A15 solange ein Editor offen ist, sind die „Antworten“-Knöpfe der anderen Einträge gesperrt', async ({ connectPage: page }) => {
    await openBoard(page);
    const fb3 = item(page, 'Viel besser als Teams');
    await fb3.getByRole('button', { name: /^Antworten/ }).click();
    await fb3.locator('.fb-reply-textarea').fill('Entwurf');

    await expect(page.locator('.fb-reply-btn')).toHaveCount(2);              // der eigene Knopf ist dem Editor gewichen
    for (const b of await page.locator('.fb-reply-btn').all()) await expect(b).toBeDisabled();
    await expect(page.locator('.fb-reply-editor')).toHaveCount(1);

    await fb3.getByRole('button', { name: 'Abbrechen' }).click();
    for (const b of await page.locator('.fb-reply-btn').all()) await expect(b).toBeEnabled();
  });

  test('A16 Speichern scheitert: währenddessen „Speichert…“, alles gesperrt, Escape schließt nichts; danach stehen Editor und Text noch da', async ({ connectPage: page }) => {
    await openBoard(page);
    await page.evaluate(() => {
      (window as any).DataService.prototype.setFeedbackReply = async function () {
        await new Promise((r) => setTimeout(r, 700));
        (window as any).__fbAufrufe = ((window as any).__fbAufrufe || 0) + 1;
        return null; // so meldet der DataService einen Fehler
      };
    });
    const fb2 = item(page, 'Beim Hochladen eines PDFs');
    await fb2.getByRole('button', { name: /^Antworten/ }).click();
    const feld = fb2.locator('.fb-reply-textarea');
    await feld.fill('Text, der nicht verloren gehen darf');
    await fb2.getByRole('button', { name: 'Antwort speichern' }).click();

    const speichert = fb2.getByRole('button', { name: 'Speichert…' });
    await expect(speichert).toBeDisabled();
    await expect(fb2.getByRole('button', { name: 'Abbrechen' })).toBeDisabled();
    await expect(feld).toHaveJSProperty('readOnly', true);
    await page.keyboard.press('Escape');                                      // mitten im Speichern
    await expect(feld).toBeVisible();

    await expect(fb2.getByRole('button', { name: 'Antwort speichern' })).toBeEnabled({ timeout: 4_000 });
    await expect(feld).toHaveValue('Text, der nicht verloren gehen darf');
    await expect(feld).toBeFocused();
    await expect(fb2.locator('.fb-reply')).toHaveCount(0);                    // nichts wurde als gespeichert angezeigt
    await expect(page.locator('.fb-board-modal')).toBeVisible();
    expect(await page.evaluate(() => (window as any).__fbAufrufe)).toBe(1);   // genau ein Aufruf
  });

  test('A17 liegt die Datei-Vorschau über dem Board, schließt Escape nur sie; Editor, Text und Board bleiben', async ({ connectPage: page }) => {
    await openBoard(page);
    const fb3 = item(page, 'Viel besser als Teams');
    await fb3.getByRole('button', { name: /^Antworten/ }).click();
    await fb3.locator('.fb-reply-textarea').fill('Entwurf bleibt');

    await page.evaluate(() => (window as any).openFileViewer([{ url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', name: 'Screenshot', type: 'image/gif' }], 0));
    await expect(page.locator('.fv-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.fv-overlay')).toHaveCount(0);
    await expect(fb3.locator('.fb-reply-textarea')).toHaveValue('Entwurf bleibt');
    await expect(page.locator('.fb-board-modal')).toBeVisible();
  });

  test('A18 der Zustand der Liste kommt aus der Antwort des Servers, nicht aus dem Demo-Store', async ({ connectPage: page }) => {
    await openBoard(page);
    // Der Stub ändert den Demo-Store NICHT und gibt nur zurück, was der Server liefern würde.
    await page.evaluate(() => {
      (window as any).DataService.prototype.setFeedbackReply = async function (id: any, text: string) {
        return { id, admin_reply: String(text).trim() + ' (vom Server)', admin_reply_at: '2026-10-03T18:30:00.000Z' };
      };
    });
    const fb2 = item(page, 'Beim Hochladen eines PDFs');
    await fb2.getByRole('button', { name: /^Antworten/ }).click();
    await fb2.locator('.fb-reply-textarea').fill('Behoben');
    await fb2.getByRole('button', { name: 'Antwort speichern' }).click();
    await expect(fb2.locator('.fb-reply-text')).toHaveText('Behoben (vom Server)');
    await expect(fb2.locator('.fb-reply .fb-item-meta')).toHaveText('03.10.26');
  });
});

test.describe('4.53.0 Feedback-Antwort — Handy-Breite und Barrierefreiheit', () => {
  for (const breite of [390, 320]) {
    test(`A11 ${breite} px: nichts ragt über den Rand, Feld hat 16 px Schrift, Knöpfe sind mindestens 44 px hoch`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 844 });
      await openConnect(page, { user: 'la' });
      await openBoard(page);
      const fb1 = item(page, 'Könnte man Beiträge auch anpinnen?');
      await fb1.getByRole('button', { name: /^Antwort bearbeiten/ }).click();
      await expect(fb1.locator('.fb-reply-textarea')).toBeVisible();

      const m = await page.evaluate(() => {
        const modal = document.querySelector('.fb-board-modal') as HTMLElement;
        const mr = modal.getBoundingClientRect();
        const ragtRaus: string[] = [];
        modal.querySelectorAll('.fb-item, .fb-reply, .fb-reply-editor, .fb-reply-textarea, .fb-reply-actions button, .fb-reply-btn, .fb-status-select').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && (r.right > mr.right + 0.5 || r.left < mr.left - 0.5)) ragtRaus.push((el as HTMLElement).className + ' ' + Math.round(r.left) + '–' + Math.round(r.right));
        });
        return {
          seite: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          schrift: parseFloat(getComputedStyle(document.querySelector('.fb-reply-textarea')!).fontSize),
          hoehen: [...modal.querySelectorAll('.fb-reply-actions button, .fb-reply-btn, .fb-status-select')].map((b) => Math.round(b.getBoundingClientRect().height)),
          zaehlerEinzeilig: (document.querySelector('.fb-reply-count') as HTMLElement).getBoundingClientRect().height < 24,
          // Admin-Zeile: das letzte Bedienelement schließt rechts mit dem Eintrag ab (nicht linksbündig umgebrochen).
          rechts: [...modal.querySelectorAll('.fb-item-admin')].map((z) => {
            const letztes = z.lastElementChild!.getBoundingClientRect();
            const zeile = z.getBoundingClientRect();
            return Math.round(zeile.right - letztes.right);
          }),
          ragtRaus,
        };
      });
      expect(m.seite).toBe(true);
      expect(m.schrift).toBeGreaterThanOrEqual(16);
      expect(m.hoehen.length).toBeGreaterThanOrEqual(8);   // 3 im Editor, 2 „Antworten“ an den anderen Einträgen, 3 Status-Auswahlen
      expect(Math.min(...m.hoehen)).toBeGreaterThanOrEqual(44);
      expect(m.zaehlerEinzeilig).toBe(true);
      expect(m.rechts).toEqual([0, 0, 0]);
      expect(m.ragtRaus).toEqual([]);
    });
  }

  test('A12 axe: Board mit Antwort und offenem Editor ohne kritische oder schwere Verstöße', async ({ connectPage: page }) => {
    await openBoard(page);
    await item(page, 'Könnte man Beiträge auch anpinnen?').getByRole('button', { name: /^Antwort bearbeiten/ }).click();
    await expect(page.locator('.fb-reply-textarea')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include('.fb-board-modal')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const schwer = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(schwer, JSON.stringify(schwer.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target).slice(0, 5) })), null, 2)).toEqual([]);
  });

  test('A13 axe: Mitglieder-Ansicht mit sichtbarer Antwort ohne kritische oder schwere Verstöße', async ({ page }) => {
    await openConnect(page, { user: 'al' });
    await openBoard(page);
    await expect(page.locator('.fb-reply')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include('.fb-board-modal')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const schwer = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(schwer, JSON.stringify(schwer.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target).slice(0, 5) })), null, 2)).toEqual([]);
  });
});
