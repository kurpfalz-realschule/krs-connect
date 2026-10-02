import { test, expect } from '../fixtures/connect';

/**
 * DATEI-01 — Team-Dateiablage: Datenschicht (Fundament, Opus 29.09.2026)
 *
 * Geprüft wird NUR die Datenschicht (DataService + Resolver + Typ-Prüfung),
 * die Oberfläche folgt im Sonnet-Sprint (tests/connect/smoke-team-files-ui.spec.ts).
 *  - Demo-Modus: Liste, Ordner, Upload mit Auto-Umbenennung, Umbenennen, Löschen mit Unterbaum
 *  - Fake-Supabase: richtiger Bucket, Pfad <team>/<uuid>.<ext>, Namenskonflikt → „(2)",
 *    Aufräumen bei Fehler, Löschen = erst Zeile, dann Objekte (auch im Unterbaum)
 *  - Resolver: Präfix "team-files/" signiert aus Bucket team-files, Rest weiter aus images
 */

test.describe('DATEI-01 Datenschicht — Typ-Prüfung', () => {
  test('teamFileMime: erlaubt Office/PDF/Bilder/Audio, leitet leeren Typ aus der Endung ab, blockt SVG/HTML/ZIP', async ({ connectPage: page }) => {
    const r = await page.evaluate(() => {
      const m = (window as any).__krsTeamFileMime;
      const f = (name: string, type: string) => m({ name, type });
      return {
        pptxLeer: f('Elternabend.pptx', ''),
        pdfOctet: f('Brief.pdf', 'application/octet-stream'),
        heicLeer: f('Foto.HEIC', ''),
        mdLeer: f('notiz.md', ''),
        m4aAlias: f('Aufnahme.m4a', 'audio/x-m4a'),
        svg: f('logo.svg', 'image/svg+xml'),
        html: f('seite.html', 'text/html'),
        zip: f('archiv.zip', 'application/zip'),
        ohneEndung: f('README', ''),
      };
    });
    expect(r.pptxLeer).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
    expect(r.pdfOctet).toBe('application/pdf');
    expect(r.heicLeer).toBe('image/heic');
    expect(r.mdLeer).toBe('text/markdown');
    expect(r.m4aAlias).toBe('audio/x-m4a');
    expect(r.svg).toBeNull();
    expect(r.html).toBeNull();
    expect(r.zip).toBeNull();
    expect(r.ohneEndung).toBeNull();
  });
});

test.describe('DATEI-01 Datenschicht — Demo-Modus', () => {
  test('getTeamFiles liefert den Demo-Baum normalisiert (Ordner + Dateien mit url)', async ({ connectPage: page }) => {
    const list = await page.evaluate(async () => {
      const ds = new (window as any).DataService(null);
      return await ds.getTeamFiles(1);
    });
    const ordner = list.find((e: any) => e.kind === 'folder' && e.name === 'Elternabend 2026');
    expect(ordner).toBeTruthy();
    const kind = list.find((e: any) => e.parent_id === ordner.id);
    expect(kind.kind).toBe('file');
    expect(kind.url).toMatch(/^data:text\/plain/);
    expect(typeof kind.size_bytes).toBe('number');
  });

  test('Ordner anlegen, Doppelname abgelehnt, Upload mit Auto-Umbenennung, zu groß/SVG werfen', async ({ connectPage: page }) => {
    const r = await page.evaluate(async () => {
      const ds = new (window as any).DataService(null);
      const f = await ds.createTeamFolder(7, null, '  Klasse 5 ', 1);
      const doppelt = await ds.createTeamFolder(7, null, 'klasse 5', 1, { quiet: true });
      const datei = new File(['hallo'], 'Elternabend.pptx', { type: '' });
      const a = await ds.uploadTeamFile(7, f.id, datei, 1);
      const b = await ds.uploadTeamFile(7, f.id, datei, 1);
      let gross = '', svg = '';
      const big = new File([''], 'riesig.pdf', { type: 'application/pdf' });
      Object.defineProperty(big, 'size', { value: 60 * 1024 * 1024 });
      try { await ds.uploadTeamFile(7, f.id, big, 1); } catch (e: any) { gross = e.message; }
      try { await ds.uploadTeamFile(7, f.id, new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }), 1); } catch (e: any) { svg = e.message; }
      return { f, doppelt, a, b, gross, svg, anzahl: (await ds.getTeamFiles(7)).length };
    });
    expect(r.f.name).toBe('Klasse 5');
    expect(r.f.created_by).toBe(1);
    expect(r.doppelt).toBeNull();
    expect(r.a.name).toBe('Elternabend.pptx');
    expect(r.a.mime_type).toContain('presentationml');
    expect(r.a.url).toMatch(/^blob:/);
    expect(r.b.name).toBe('Elternabend (2).pptx');
    expect(r.gross).toContain('50 MB');
    expect(r.svg).toContain('nicht erlaubt');
    expect(r.anzahl).toBe(3);
  });

  test('Umbenennen (auch Konflikt) und Löschen eines Ordners samt Unterbaum', async ({ connectPage: page }) => {
    const r = await page.evaluate(async () => {
      const ds = new (window as any).DataService(null);
      const o = await ds.createTeamFolder(8, null, 'Oben', 1);
      const u = await ds.createTeamFolder(8, o.id, 'Unten', 1);
      await ds.uploadTeamFile(8, u.id, new File(['x'], 'a.txt', { type: 'text/plain' }), 1);
      await ds.uploadTeamFile(8, null, new File(['x'], 'bleibt.txt', { type: 'text/plain' }), 1);
      const umb = await ds.renameTeamFile(u.id, 'Unterordner');
      const konflikt = await ds.renameTeamFile(u.id, 'unterordner '); // gleicher Name (Groß/klein) → erlaubt? nein: gleicher Eintrag
      const andere = await ds.createTeamFolder(8, o.id, 'Zweiter', 1);
      const konflikt2 = await ds.renameTeamFile(andere.id, 'UNTERORDNER');
      const all = await ds.getTeamFiles(8);
      const del = await ds.deleteTeamEntry(all.find((e: any) => e.id === o.id), all);
      const rest = await ds.getTeamFiles(8);
      return { umb, konflikt, konflikt2, del, rest: rest.map((e: any) => e.name) };
    });
    expect(r.umb.name).toBe('Unterordner');
    expect(r.konflikt.name).toBe('unterordner'); // eigener Eintrag: nur Schreibweise geändert
    expect(r.konflikt2).toBeNull();
    expect(r.del.ok).toBe(true);
    expect(r.del.removed).toBe(4); // Oben, Unterordner, a.txt, Zweiter
    expect(r.rest).toEqual(['bleibt.txt']);
  });
});

test.describe('DATEI-01 Datenschicht — Endungs-Pflicht (Server-Constraint team_files_ext_chk)', () => {
  test('Upload ohne Endung bekommt sie aus dem Typ; Umbenennen auf .exe/ohne Endung wird abgelehnt', async ({ connectPage: page }) => {
    const r = await page.evaluate(async () => {
      const ds = new (window as any).DataService(null);
      const a = await ds.uploadTeamFile(9, null, new File(['x'], 'README', { type: 'text/plain' }), 1);
      const exe = await ds.renameTeamFile(a.id, 'Zeugnisse.exe');
      const ohne = await ds.renameTeamFile(a.id, 'Zeugnisse');
      const ok = await ds.renameTeamFile(a.id, 'Zeugnisse.txt');
      const ordner = await ds.createTeamFolder(9, null, 'Ordner ohne Endung', 1);
      const ordnerUmb = await ds.renameTeamFile(ordner.id, 'Auch.ohne');
      return { a: a.name, exe, ohne, ok: ok && ok.name, ordnerUmb: ordnerUmb && ordnerUmb.name };
    });
    expect(r.a).toBe('README.txt');
    expect(r.exe).toBeNull();
    expect(r.ohne).toBeNull();
    expect(r.ok).toBe('Zeugnisse.txt');
    expect(r.ordnerUmb).toBe('Auch.ohne'); // Ordner brauchen keine Endung
  });
});

test.describe('DATEI-01 Datenschicht — Fake-Supabase (Server-Pfad)', () => {
  test('Upload: Bucket team-files, Pfad <team>/<uuid>.<ext>, Namenskonflikt → „(2)"', async ({ connectPage: page }) => {
    const r = await page.evaluate(async () => {
      const w = window as any;
      const log: any[] = [];
      let inserts = 0;
      const fakeSb = {
        storage: { from: (bucket: string) => ({
          upload: (path: string, body: any, opts: any) => { log.push({ op: 'upload', bucket, path, type: opts.contentType, upsert: opts.upsert }); return Promise.resolve({ data: { path }, error: null }); },
          remove: (paths: string[]) => { log.push({ op: 'remove', bucket, paths }); return Promise.resolve({ error: null }); },
        }) },
        from: (table: string) => ({
          insert: (row: any) => ({ select: () => ({ single: () => {
            inserts++;
            log.push({ op: 'insert', table, name: row.name, path: row.storage_path });
            if (inserts === 1) return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "team_files_name_uq"' } });
            return Promise.resolve({ data: { id: 'neu', kind: 'file', ...row }, error: null });
          } }) }),
        }),
      };
      const ds = new w.DataService(null); ds.isDemo = false; ds.sb = fakeSb;
      const e = await ds.uploadTeamFile(12, 'ordner-1', new File(['x'], 'Präsentation Klasse 5.pptx', { type: '' }), 3);
      return { e, log };
    });
    const up = r.log[0];
    expect(up.op).toBe('upload');
    expect(up.bucket).toBe('team-files');
    expect(up.path).toMatch(/^12\/[0-9a-z-]+\.pptx$/);
    expect(up.type).toContain('presentationml');
    expect(up.upsert).toBe(false);
    expect(r.log[1]).toMatchObject({ op: 'insert', table: 'team_files', name: 'Präsentation Klasse 5.pptx' });
    expect(r.log[2]).toMatchObject({ op: 'insert', name: 'Präsentation Klasse 5 (2).pptx', path: up.path });
    expect(r.e.name).toBe('Präsentation Klasse 5 (2).pptx');
    expect(r.e.url).toBe('team-files/' + up.path);
    expect(r.log.some((x: any) => x.op === 'remove')).toBe(false);
  });

  test('Upload: Eintrag scheitert (keine Berechtigung) → Objekt wird wieder entfernt, verständliche Meldung', async ({ connectPage: page }) => {
    const r = await page.evaluate(async () => {
      const w = window as any;
      const log: any[] = [];
      const fakeSb = {
        storage: { from: (bucket: string) => ({
          upload: (path: string) => { log.push({ op: 'upload', path }); return Promise.resolve({ data: { path }, error: null }); },
          remove: (paths: string[]) => { log.push({ op: 'remove', bucket, paths }); return Promise.resolve({ error: null }); },
        }) },
        from: () => ({ insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '42501', message: 'new row violates row-level security policy' } }) }) }) }),
      };
      const ds = new w.DataService(null); ds.isDemo = false; ds.sb = fakeSb;
      let msg = '';
      try { await ds.uploadTeamFile(12, null, new File(['x'], 'a.pdf', { type: 'application/pdf' }), 3); } catch (e: any) { msg = e.message; }
      return { msg, log };
    });
    expect(r.msg).toBe('Keine Berechtigung für diese Aktion.');
    const rm = r.log.find((x: any) => x.op === 'remove');
    expect(rm.bucket).toBe('team-files');
    expect(rm.paths).toEqual([r.log[0].path]);
  });

  test('Löschen: erst die Zeile, dann alle Objekte des Unterbaums; keine Berechtigung → nichts entfernt', async ({ connectPage: page }) => {
    const r = await page.evaluate(async () => {
      const w = window as any;
      const mk = (deleted: boolean, log: any[]) => ({
        storage: { from: (bucket: string) => ({ remove: (paths: string[]) => { log.push({ op: 'remove', bucket, paths }); return Promise.resolve({ error: null }); } }) },
        from: (table: string) => ({ delete: () => ({ in: (col: string, vals: any[]) => ({ select: () => { log.push({ op: 'delete', table, col, vals }); return Promise.resolve({ data: deleted ? vals.map((v: any) => ({ id: v })) : [], error: null }); } }) }) }),
      });
      const all = [
        { id: 'o', team_id: 12, parent_id: null, kind: 'folder', name: 'Oben' },
        { id: 'u', team_id: 12, parent_id: 'o', kind: 'folder', name: 'Unten' },
        { id: 'd1', team_id: 12, parent_id: 'o', kind: 'file', name: 'a.pdf', storage_path: '12/a.pdf' },
        { id: 'd2', team_id: 12, parent_id: 'u', kind: 'file', name: 'b.pdf', storage_path: '12/b.pdf' },
        { id: 'd3', team_id: 12, parent_id: null, kind: 'file', name: 'c.pdf', storage_path: '12/c.pdf' },
      ];
      const logOk: any[] = [], logNo: any[] = [];
      const ds = new w.DataService(null); ds.isDemo = false;
      ds.sb = mk(true, logOk);
      const ok = await ds.deleteTeamEntry(all[0], all);
      ds.sb = mk(false, logNo);
      const no = await ds.deleteTeamEntry(all[0], all);
      return { ok, logOk, no, logNo };
    });
    // Seit 4.51.0: erst alle Dateien (ein Aufruf), dann die Ordner von unten nach oben, zuletzt die Speicher-Objekte.
    expect(r.ok.ok).toBe(true);
    expect(r.ok.removed).toBe(4);
    expect([...r.ok.deletedIds].sort()).toEqual(['d1', 'd2', 'o', 'u']);
    expect(r.logOk[0]).toMatchObject({ op: 'delete', table: 'team_files', col: 'id' });
    expect([...r.logOk[0].vals].sort()).toEqual(['d1', 'd2']);
    expect(r.logOk[1]).toMatchObject({ op: 'delete', vals: ['u'] });
    expect(r.logOk[2]).toMatchObject({ op: 'delete', vals: ['o'] });
    expect(r.logOk[3].bucket).toBe('team-files');
    expect([...r.logOk[3].paths].sort()).toEqual(['12/a.pdf', '12/b.pdf']);
    expect(r.no.ok).toBe(false);
    expect(r.logNo.some((x: any) => x.op === 'remove')).toBe(false);
  });
});

test.describe('DATEI-01 Datenschicht — Resolver', () => {
  test('"team-files/…" signiert aus Bucket team-files, "uploads/…" weiter aus images', async ({ connectPage: page }) => {
    const r = await page.evaluate(async () => {
      const calls: any[] = [];
      (window as any).__krsSb = { storage: { from: (bucket: string) => ({
        createSignedUrl: (path: string) => { calls.push({ bucket, path }); return Promise.resolve({ data: { signedUrl: 'https://x.example/' + bucket + '/' + path + '?token=t' }, error: null }); },
      }) } };
      const a = await (window as any).__krsResolveStorageUrl('team-files/12/abc.pdf');
      const b = await (window as any).__krsResolveStorageUrl('uploads/123_x.png');
      return { a, b, calls };
    });
    expect(r.calls).toEqual([{ bucket: 'team-files', path: '12/abc.pdf' }, { bucket: 'images', path: 'uploads/123_x.png' }]);
    expect(r.a).toContain('/team-files/12/abc.pdf');
    expect(r.b).toContain('/images/uploads/123_x.png');
  });
});
