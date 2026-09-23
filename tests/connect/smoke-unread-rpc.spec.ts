import { test, expect } from '../fixtures/connect';

/**
 * PERF-02 / O7-Client (v4.40.0) — Unread in einem Roundtrip + Serverzeit-Lesestand.
 *
 * Geprüft wird die DataService-Logik mit einem aufgezeichneten Fake-Supabase-Client
 * (kein Netz, kein Demo-Kurzschluss):
 *  1) Kanäle: genau 1 RPC + 1 Reads-Abgleich, KEINE count-Abfrage pro Kanal.
 *  2) localStorage-Altbestand (Lesestand nur lokal, keine DB-Zeile) wird einzeln nachgezählt.
 *  3) RPC-Fehler → automatischer Fallback auf den alten N-Pfad (Ergebnis bleibt korrekt).
 *  4) Rollback-Flag KRS_UNREAD_N_LEGACY=true → alter N-Pfad, keine RPC.
 *  5) Chats: RPC-Pfad analog.
 *  6) markChannelRead nutzt rpc_mark_channel_read; Upsert nur als Fallback bei Fehler.
 */

const FAKE = `
  window.__makeFakeSb = (opts) => {
    const log = [];
    const builder = (table) => {
      const st = { table, filters: [], head: false };
      const b = {
        select(cols, o) { st.cols = cols; if (o && o.head) st.head = true; return b; },
        eq(c, v) { st.filters.push(['eq', c, v]); return b; },
        neq(c, v) { st.filters.push(['neq', c, v]); return b; },
        is(c, v) { st.filters.push(['is', c, v]); return b; },
        gt(c, v) { st.filters.push(['gt', c, v]); return b; },
        in(c, v) { st.filters.push(['in', c, v]); return b; },
        upsert(row) { log.push({ kind: 'upsert', table, row }); return Promise.resolve({ error: null }); },
        then(res, rej) {
          log.push({ kind: st.head ? 'count' : 'select', table, filters: st.filters });
          let out;
          if (st.head) {
            const idF = st.filters.find(f => f[0] === 'eq');
            out = { count: (opts.counts || {})[table + ':' + idF[2]] ?? 0, error: null };
          } else {
            out = { data: (opts.reads || {})[table] || [], error: null };
          }
          return Promise.resolve(out).then(res, rej);
        },
      };
      return b;
    };
    return {
      log,
      from: (t) => builder(t),
      rpc: (name, args) => {
        log.push({ kind: 'rpc', name, args });
        const r = (opts.rpc || {})[name];
        if (r instanceof Error) return Promise.resolve({ data: null, error: { message: r.message } });
        return Promise.resolve({ data: r || [], error: null });
      },
    };
  };
`;

test.describe('KRS Connect — PERF-02 Unread-RPC (v4.40.0)', () => {
  test.beforeEach(async ({ connectPage: page }) => {
    await page.evaluate(FAKE);
    await page.evaluate(() => {
      try {
        localStorage.removeItem('KRS_UNREAD_N_LEGACY');
        Object.keys(localStorage).filter(k => k.startsWith('krs-lastread-')).forEach(k => localStorage.removeItem(k));
      } catch (e) {}
    });
  });

  test('Kanäle: 1 RPC + 1 Reads-Abgleich, keine count-Stürme', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const w = window as any;
      const sb = w.__makeFakeSb({
        rpc: { rpc_unread_channel_counts: [
          { channel_id: 11, unread_count: 3 }, { channel_id: 12, unread_count: 0 }, { channel_id: 13, unread_count: 1 },
        ] },
        reads: { channel_reads: [{ channel_id: 11 }, { channel_id: 12 }, { channel_id: 13 }] },
      });
      const ds = new w.DataService(null); ds.isDemo = false; ds.sb = sb;
      const m = await ds.getChannelUnreadCounts([11, 12, 13], 7);
      return { map: [...m.entries()], log: sb.log };
    });
    expect(res.map).toEqual([[11, 3], [13, 1]]);
    const rpcs = res.log.filter((l: any) => l.kind === 'rpc');
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0].name).toBe('rpc_unread_channel_counts');
    expect(rpcs[0].args).toEqual({ p_channel_ids: [11, 12, 13] });
    expect(res.log.filter((l: any) => l.kind === 'count')).toHaveLength(0);
    expect(res.log.filter((l: any) => l.kind === 'select')).toHaveLength(1);
  });

  test('localStorage-Altbestand ohne DB-Zeile wird einzeln nachgezählt', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const w = window as any;
      localStorage.setItem('krs-lastread-ch-12', '2026-09-20T10:00:00.000Z');
      const sb = w.__makeFakeSb({
        rpc: { rpc_unread_channel_counts: [
          { channel_id: 11, unread_count: 2 }, { channel_id: 12, unread_count: 40 }, // 40 = "alles ungelesen" laut Server
        ] },
        reads: { channel_reads: [{ channel_id: 11 }] }, // 12 hat keine DB-Zeile
        counts: { 'posts:12': 0 },                        // lokal: alles gelesen
      });
      const ds = new w.DataService(null); ds.isDemo = false; ds.sb = sb;
      const m = await ds.getChannelUnreadCounts([11, 12], 7);
      return { map: [...m.entries()], counts: sb.log.filter((l: any) => l.kind === 'count') };
    });
    expect(res.map).toEqual([[11, 2]]); // kein Unread-Blitz für 12
    expect(res.counts).toHaveLength(1);
    expect(res.counts[0].filters).toContainEqual(['eq', 'channel_id', 12]);
    expect(res.counts[0].filters).toContainEqual(['is', 'parent_id', null]);
  });

  test('RPC-Fehler → automatischer N-Fallback', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const w = window as any;
      const sb = w.__makeFakeSb({
        rpc: { rpc_unread_channel_counts: new Error('function does not exist') },
        counts: { 'posts:11': 4, 'posts:12': 0 },
      });
      const ds = new w.DataService(null); ds.isDemo = false; ds.sb = sb;
      const m = await ds.getChannelUnreadCounts([11, 12], 7);
      return { map: [...m.entries()], counts: sb.log.filter((l: any) => l.kind === 'count').length };
    });
    expect(res.map).toEqual([[11, 4]]);
    expect(res.counts).toBe(2);
  });

  test('Rollback-Flag KRS_UNREAD_N_LEGACY=true → keine RPC', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const w = window as any;
      localStorage.setItem('KRS_UNREAD_N_LEGACY', 'true');
      const sb = w.__makeFakeSb({ counts: { 'posts:11': 1 } });
      const ds = new w.DataService(null); ds.isDemo = false; ds.sb = sb;
      const m = await ds.getChannelUnreadCounts([11], 7);
      localStorage.removeItem('KRS_UNREAD_N_LEGACY');
      return { map: [...m.entries()], rpcs: sb.log.filter((l: any) => l.kind === 'rpc').length };
    });
    expect(res.map).toEqual([[11, 1]]);
    expect(res.rpcs).toBe(0);
  });

  test('Chats: RPC-Pfad liefert Map, keine count-Stürme', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const w = window as any;
      const sb = w.__makeFakeSb({
        rpc: { rpc_unread_conversation_counts: [
          { conversation_id: 5, unread_count: 2 }, { conversation_id: 6, unread_count: 0 },
        ] },
        reads: { conversation_reads: [{ conversation_id: 5 }, { conversation_id: 6 }] },
      });
      const ds = new w.DataService(null); ds.isDemo = false; ds.sb = sb;
      const m = await ds.getConversationUnreadCounts([{ id: 5 }, { id: 6 }], 7);
      return { map: [...m.entries()], log: sb.log };
    });
    expect(res.map).toEqual([[5, 2]]);
    const rpc = res.log.find((l: any) => l.kind === 'rpc');
    expect(rpc.args).toEqual({ p_conversation_ids: [5, 6] });
    expect(res.log.filter((l: any) => l.kind === 'count')).toHaveLength(0);
  });

  test('markChannelRead: Serverzeit-RPC, Upsert nur bei Fehler', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const w = window as any;
      const ok = w.__makeFakeSb({ rpc: { rpc_mark_channel_read: '2026-09-23T12:00:00Z' } });
      const ds1 = new w.DataService(null); ds1.isDemo = false; ds1.sb = ok;
      ds1.markChannelRead(11, 7);
      ds1.markConversationRead(5, 7);
      const bad = w.__makeFakeSb({ rpc: { rpc_mark_channel_read: new Error('Kein Zugriff') } });
      const ds2 = new w.DataService(null); ds2.isDemo = false; ds2.sb = bad;
      ds2.markChannelRead(11, 7);
      await new Promise(r => setTimeout(r, 50));
      return { ok: ok.log, bad: bad.log };
    });
    expect(res.ok.map((l: any) => l.kind + ':' + (l.name || l.table))).toEqual([
      'rpc:rpc_mark_channel_read', 'rpc:rpc_mark_conversation_read',
    ]);
    expect(res.ok[0].args).toEqual({ p_channel_id: 11 });
    expect(res.bad.map((l: any) => l.kind + ':' + (l.name || l.table))).toEqual([
      'rpc:rpc_mark_channel_read', 'upsert:channel_reads',
    ]);
  });
});
