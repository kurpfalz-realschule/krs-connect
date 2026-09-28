import { test, expect, openConnect } from '../fixtures/connect';

/**
 * PERF-05 (4.46.0) — Lesebestätigungen gebündelt schreiben.
 *
 * Vorher: markPostRead() schrieb 1 Upsert PRO Beitrag → beim ersten Öffnen
 * eines Kanals bis zu 50 parallele POSTs auf post_reads (35% der App-DB-Zeit,
 * langsamste Route in den Logs — siehe PERFORMANCE-CHECK-2026-09-28.md).
 * Jetzt: markPostsRead(ids, userId) sammelt in einer Warteschlange, sendet
 * gebündelt mit 1,5s Entprellung; getPostReads bekommt einen FK-Hinweis
 * (Lehre aus Hotfix 0BJ) und einen 60s-Cache pro Kanal.
 *
 * Die ersten vier Tests prüfen die DataService-Logik direkt gegen einen
 * aufgezeichneten Fake-Supabase-Client (kein Netz, kein Demo-Kurzschluss —
 * gleiches Muster wie smoke-unread-rpc.spec.ts). Der fünfte und sechste Test
 * laufen gegen die echte App im Demo-Modus und patchen DataService.prototype
 * VOR dem App-Start (page.addInitScript, bevor `window.DataService = ...`
 * zuweist), um Requests und Timing am echten Kanal "Allgemein" zu beobachten.
 *
 * Ehrlicher Hinweis zur Demo-Testbarkeit: MOCK_POSTS trägt kein `author_id`
 * (nur ein eingebettetes `author`-Objekt), daher greift der "eigene Beiträge
 * nicht markieren"-Filter (post.author_id === user.id) im Demo-Modus nicht —
 * das ist ein bestehendes Verhalten der Demo-Daten, nicht Teil von PERF-05,
 * und wird hier bewusst mitgezählt statt weggefiltert.
 */

test.describe('PERF-05: markPostsRead — gebündelter Upsert (DataService, Fake-Supabase)', () => {
  test('mehrere IDs erzeugen genau EINEN Upsert-Request mit Array (nicht 1 pro Beitrag)', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const w = window as any;
      const log: any[] = [];
      const fakeSb = {
        from(table: string) {
          return {
            upsert(rows: any, opts: any) {
              log.push({ table, rows, opts });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
      const ds = new w.DataService(null);
      ds.isDemo = false; ds.sb = fakeSb;
      const ok = await ds.markPostsRead([101, 102, 103], 7);
      return { ok, log };
    });
    expect(res.ok).toBe(true);
    expect(res.log).toHaveLength(1); // genau 1 Request für 3 Beiträge, nicht 3
    expect(res.log[0].table).toBe('post_reads');
    expect(res.log[0].rows).toEqual([
      { post_id: 101, user_id: 7 }, { post_id: 102, user_id: 7 }, { post_id: 103, user_id: 7 },
    ]);
    expect(res.log[0].opts).toEqual({ onConflict: 'post_id,user_id', ignoreDuplicates: true });
  });

  test('mehr als 100 IDs werden gestückelt (max. 100 pro Request)', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const w = window as any;
      const chunkSizes: number[] = [];
      const fakeSb = {
        from() {
          return {
            upsert(rows: any) { chunkSizes.push(rows.length); return Promise.resolve({ error: null }); },
          };
        },
      };
      const ds = new w.DataService(null); ds.isDemo = false; ds.sb = fakeSb;
      const ids = Array.from({ length: 150 }, (_, i) => i + 1);
      const ok = await ds.markPostsRead(ids, 7);
      return { ok, chunkSizes };
    });
    expect(res.ok).toBe(true);
    expect(res.chunkSizes).toEqual([100, 50]);
  });

  test('markPostRead (Einzel) bleibt als dünne Hülle rückwärtskompatibel', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const w = window as any;
      const log: any[] = [];
      const fakeSb = {
        from() {
          return { upsert(rows: any, opts: any) { log.push({ rows, opts }); return Promise.resolve({ error: null }); } };
        },
      };
      const ds = new w.DataService(null); ds.isDemo = false; ds.sb = fakeSb;
      const ok = await ds.markPostRead(55, 7);
      return { ok, log };
    });
    expect(res.ok).toBe(true);
    expect(res.log).toHaveLength(1);
    expect(res.log[0].rows).toEqual([{ post_id: 55, user_id: 7 }]);
  });

  test('Fehlerfall (z.B. 42501/Netz): kein Wurf, Rückgabe false statt Exception', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const w = window as any;
      const fakeSb = { from() { return { upsert() { return Promise.resolve({ error: { message: 'RLS' } }); } }; } };
      const ds = new w.DataService(null); ds.isDemo = false; ds.sb = fakeSb;
      let threw = false;
      let ok;
      try { ok = await ds.markPostsRead([1, 2], 7); } catch (e) { threw = true; }
      return { ok, threw };
    });
    expect(res.threw).toBe(false);
    expect(res.ok).toBe(false);
  });
});

test.describe('PERF-05: getPostReads — FK-Hinweis + 60s-Kanal-Cache (DataService, Fake-Supabase)', () => {
  test('Embedding-Query trägt den FK-Hinweis (Lehre aus Hotfix 0BJ)', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const w = window as any;
      const log: any[] = [];
      const fakeSb = {
        from(table: string) {
          const b: any = {
            select(cols: string) { log.push({ table, cols }); return b; },
            in() { return b; },
            then(res: any, rej: any) { return Promise.resolve({ data: [], error: null }).then(res, rej); },
          };
          return b;
        },
      };
      const ds = new w.DataService(null); ds.isDemo = false; ds.sb = fakeSb;
      await ds.getPostReads([1, 2]);
      return log;
    });
    expect(res).toHaveLength(1);
    expect(res[0].cols).toContain('post_reads_user_id_fkey');
  });

  test('zweiter Aufruf für denselben Kanal innerhalb von 60s kommt aus dem Cache', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const w = window as any;
      let calls = 0;
      const fakeSb = {
        from() {
          const b: any = {
            select() { return b; },
            in() { return b; },
            then(res: any, rej: any) {
              calls++;
              return Promise.resolve({
                data: [{ post_id: 1, user_id: 9, read_at: '2026-09-28T00:00:00Z', users: { display_name: 'X' } }],
                error: null,
              }).then(res, rej);
            },
          };
          return b;
        },
      };
      const ds = new w.DataService(null); ds.isDemo = false; ds.sb = fakeSb;
      const m1 = await ds.getPostReads([1], 42);
      const m2 = await ds.getPostReads([1], 42); // gleicher Kanal, < 60s → Cache
      const m3 = await ds.getPostReads([1], 43); // anderer Kanal → neuer Request
      return { calls, m1: [...m1.entries()], m2: [...m2.entries()] };
    });
    expect(res.calls).toBe(2); // Kanal 42 (1x), Kanal 43 (1x) — Kanal-42-Wiederholung kam aus dem Cache
    expect(res.m2).toEqual(res.m1);
  });
});

test.describe('PERF-05: Entprellung + Batch am echten Kanal (Demo-App)', () => {
  test('Kanal öffnen: KEIN sofortiger Request, nach ~1,5s genau 1 gebündelter Aufruf', async ({ page }) => {
    // DataService.prototype patchen, BEVOR die App ihn zuweist (window.DataService
    // = DataService steht in index.html direkt nach der Klassendefinition) —
    // so wird garantiert kein Aufruf verpasst.
    await page.addInitScript(() => {
      (window as any).__markPostsReadCalls = [];
      let _DS: any;
      Object.defineProperty(window, 'DataService', {
        configurable: true,
        get() { return _DS; },
        set(cls: any) {
          _DS = cls;
          const orig = cls.prototype.markPostsRead;
          cls.prototype.markPostsRead = function (ids: any, userId: any) {
            (window as any).__markPostsReadCalls.push({ ids: Array.isArray(ids) ? ids.slice() : ids, userId, t: Date.now() });
            return orig.apply(this, arguments);
          };
        },
      });
    });
    // Lesebestätigungen sind DSGVO-Opt-in (Standard: aus) — für diesen Test
    // aktivieren, sonst läuft der Effekt gar nicht erst los.
    await page.addInitScript(() => {
      try { localStorage.setItem('krs-read-receipts', 'enabled'); } catch (e) {}
    });
    await openConnect(page, { user: 'la' });

    // Kanal "Allgemein" (Team "Kollegium", automatisch ausgewählt) öffnen.
    const kanalSpalte = page.locator('.sidebar-channels .sidebar-list');
    const allgemein = kanalSpalte.locator('button').filter({ hasText: 'Allgemein' }).first();
    await expect(allgemein).toBeVisible({ timeout: 8_000 });
    await allgemein.click();

    // Warten bis Beiträge sichtbar sind (Effekt hat jetzt die Warteschlange gefüllt).
    await expect(page.getByText('Klassenbücher', { exact: false })).toBeVisible({ timeout: 8_000 });

    // Sofort danach darf NOCH KEIN Request raus sein — das ist die 1,5s-
    // Entprellung, kein sofortiger Versand pro Beitrag.
    let calls = await page.evaluate(() => (window as any).__markPostsReadCalls);
    expect(calls).toHaveLength(0);
    await page.waitForTimeout(700); // deutlich unter 1,5s
    calls = await page.evaluate(() => (window as any).__markPostsReadCalls);
    expect(calls).toHaveLength(0);

    // Nach der Entprellung: genau EIN gebündelter Aufruf mit allen 3 sichtbaren
    // Beiträgen des Kanals (IDs 3, 4, 6 laut MOCK_POSTS[1]) statt 3 Einzelaufrufen.
    await page.waitForFunction(() => (window as any).__markPostsReadCalls.length > 0, null, { timeout: 3_000 });
    calls = await page.evaluate(() => (window as any).__markPostsReadCalls);
    expect(calls).toHaveLength(1);
    expect([...calls[0].ids].sort((a: number, b: number) => a - b)).toEqual([3, 4, 6]);
    expect(calls[0].userId).toBe(1);
  });

  test('Fehlschlag beim Senden: kein Toast', async ({ page }) => {
    await page.addInitScript(() => {
      let _DS: any;
      Object.defineProperty(window, 'DataService', {
        configurable: true,
        get() { return _DS; },
        set(cls: any) {
          _DS = cls;
          cls.prototype.markPostsRead = async function () { return false; }; // simulierter Fehlschlag
        },
      });
    });
    await page.addInitScript(() => {
      try { localStorage.setItem('krs-read-receipts', 'enabled'); } catch (e) {}
    });
    await openConnect(page, { user: 'la' });

    const kanalSpalte = page.locator('.sidebar-channels .sidebar-list');
    await kanalSpalte.locator('button').filter({ hasText: 'Allgemein' }).first().click();
    await expect(page.getByText('Klassenbücher', { exact: false })).toBeVisible({ timeout: 8_000 });

    await page.waitForTimeout(2_000); // Entprellung abwarten, "Request" schlägt fehl
    await expect(page.locator('.toast')).toHaveCount(0);
  });
});
