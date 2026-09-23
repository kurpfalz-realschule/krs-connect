import { test, expect, openConnect } from '../fixtures/connect';

/**
 * Paket A (Connect 4.41.0) — Sicherheit & Datenschutz, Client-Teil.
 *  A2  Gespeicherter XSS über den Editor (Entwurf/Bearbeiten) wird entschärft.
 *  A4  Umfrage-Stimme läuft über RPC vote_poll (kein UPDATE auf posts).
 *  A5  Entwürfe pro Person; Abmelden räumt persönliche Browser-Daten ab.
 *  A7  Fremd-Bilder werden zu Links, eigener Storage bleibt Bild.
 */
const PAYLOAD = '<p>Hallo</p><img src="x" onerror="window.__xss=1"><script>window.__xss=2</script>'
  + '<a href="javascript:window.__xss=3">k</a><svg onload="window.__xss=4"></svg>';

test.describe('KRS Connect — Paket A (4.41.0)', () => {
  test('A2: sanitizeForEditor entfernt Event-Handler, Script, javascript:-Links', async ({ connectPage: page }) => {
    const out = await page.evaluate((p) => (window as any).__krsSanitizeForEditor(p), PAYLOAD);
    expect(out).toContain('Hallo');
    expect(out).not.toMatch(/onerror|onload|<script|javascript:|<svg/i);
    // keine Mention-Spans/target (Text bleibt beim Speichern unverändert)
    expect(await page.evaluate(() => (window as any).__krsSanitizeForEditor('<p>@Lehrkraft A</p>'))).toBe('<p>@Lehrkraft A</p>');
  });

  test('A2: präparierter Entwurf im Composer führt keinen Code aus (UI)', async ({ page }) => {
    await page.addInitScript((p) => {
      try {
        localStorage.setItem('krs-draft-u1-channel-1', JSON.stringify({ title: '', content: p, savedAt: Date.now() }));
      } catch (e) {}
    }, PAYLOAD);
    await openConnect(page, { user: 'la' });
    const editor = page.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 10_000 });
    await expect(editor).toContainText('Hallo', { timeout: 10_000 });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
    const html = await editor.innerHTML();
    expect(html).not.toMatch(/onerror|<script|javascript:/i);
  });

  test('A5: Entwurfsschlüssel enthält die Nutzer-ID', async ({ connectPage: page }) => {
    // Demo-User la = id 1; ein Entwurf ohne Nutzer-ID (alter Schlüssel) wird NICHT mehr geladen
    expect(await page.evaluate(() => (window as any).__krsDraftUid)).toBe(1);
  });

  test('A5: Abmelden löscht persönliche krs-/sb-Schlüssel, behält Geräte-Flags', async ({ connectPage: page }) => {
    const left = await page.evaluate(() => {
      localStorage.setItem('krs-draft-u1-channel-9', '{"content":"x","savedAt":1}');
      localStorage.setItem('krs-lastread-ch-9', 'x');
      localStorage.setItem('krs-muted-9', '1');
      localStorage.setItem('sb-test-auth-token', 'x');
      localStorage.setItem('krs-embedded', '1');
      localStorage.setItem('KRS_UNREAD_N_LEGACY', 'false');
      sessionStorage.setItem('krs-recovery', '1');
      (window as any).__krsClearPersonalStorage();
      return {
        ls: Object.keys(localStorage).sort(),
        ss: Object.keys(sessionStorage).filter(k => k.startsWith('krs-')),
      };
    });
    expect(left.ls).toContain('krs-embedded');
    expect(left.ls).toContain('KRS_UNREAD_N_LEGACY');
    expect(left.ls.filter((k: string) => k.startsWith('krs-') && k !== 'krs-embedded')).toEqual([]);
    expect(left.ls.filter((k: string) => k.startsWith('sb-'))).toEqual([]);
    expect(left.ss).toEqual([]);
  });

  test('A5: Abmelden-Knopf ruft die Aufräumfunktion auf (UI)', async ({ connectPage: page }) => {
    await page.evaluate(() => localStorage.setItem('krs-draft-u1-channel-9', '{"content":"x","savedAt":1}'));
    // Sidebar-Knopf „Abmelden" (liegt je nach Viewport unter einem Overlay) per DOM-Klick
    const n = await page.evaluate(() => {
      const b = document.querySelector('button[aria-label="Abmelden"]') as HTMLButtonElement | null;
      if (b) b.click();
      return b ? 1 : 0;
    });
    expect(n).toBe(1);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('krs-draft-u1-channel-9'))).toBeNull();
  });

  test('A4: votePoll nutzt RPC vote_poll statt UPDATE auf posts', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const w = window as any;
      const log: any[] = [];
      const sb = {
        from: (t: string) => { log.push({ kind: 'from', t }); throw new Error('kein direkter Tabellenzugriff erwartet'); },
        rpc: (name: string, args: any) => {
          log.push({ kind: 'rpc', name, args });
          return Promise.resolve({ data: { question: 'q', options: [{ id: 0, votes: [] }, { id: 1, votes: [7] }], totalVotes: 1 }, error: null });
        },
      };
      const ds = new w.DataService(null); ds.isDemo = false; ds.sb = sb;
      const r = await ds.votePoll(42, 1, 7);
      return { r, log };
    });
    expect(res.log).toEqual([{ kind: 'rpc', name: 'vote_poll', args: { p_post_id: 42, p_option_id: 1 } }]);
    expect(res.r.id).toBe(42);
    expect(res.r.poll_data.totalVotes).toBe(1);
  });

  test('A7: Fremd-Bild wird Link, data:image und eigener Storage bleiben Bild', async ({ connectPage: page }) => {
    const res = await page.evaluate(() => {
      const w = window as any;
      const own = (w.T ? w.T('supabase.url', '') : '') + '/storage/v1/object/sign/images/uploads/a.png?token=x';
      return {
        ext: w.__krsSanitizeHtml('<p><img src="https://tracker.example/p.gif"></p>'),
        own: w.__krsIsSafeImageSrc(own),
        ownHasUrl: !!(w.T && w.T('supabase.url', '')),
        httpOther: w.__krsIsSafeImageSrc('https://tracker.example/p.gif'),
        data: w.__krsIsSafeImageSrc('data:image/png;base64,iVBORw0KGgo='),
      };
    });
    expect(res.ext).not.toMatch(/<img/i);
    expect(res.ext).toMatch(/<a[^>]+href="https:\/\/tracker\.example\/p\.gif"/i);
    expect(res.httpOther).toBe(false);
    expect(res.data).toBe(true);
    if (res.ownHasUrl) expect(res.own).toBe(true);
  });

  test('A3: DOMPurify ≥ 3.2.4 geladen', async ({ connectPage: page }) => {
    const v = await page.evaluate(() => (window as any).DOMPurify && (window as any).DOMPurify.version);
    expect(v).toBeTruthy();
    const [a, b, c] = String(v).split('.').map(Number);
    expect(a * 10000 + b * 100 + c).toBeGreaterThanOrEqual(30204);
  });
});
