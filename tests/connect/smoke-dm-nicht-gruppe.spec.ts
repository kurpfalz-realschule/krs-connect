import { test, expect } from '../fixtures/connect';

/**
 * O1 (R8 Franziska Mersi 18.09.2026, R11 Norbert 21.09.2026) —
 * „Will Norbert schreiben, landet aber immer in der Musikfachschaft."
 *
 * Ursache in v4.30.0: createConversation() suchte eine *gemeinsame*
 * Konversation der beiden Personen, ohne auf is_group=false zu filtern und
 * ohne die Mitgliederzahl zu prüfen. Waren beide in derselben Gruppe, kam
 * DIESE GRUPPE zurück — und wurde als is_group:false etikettiert, also als
 * Einzelchat dargestellt. Wer glaubte, privat zu schreiben, schrieb an alle.
 *
 * Seit v4.31.0 entscheidet das die RPC get_or_create_dm() auf dem Server.
 * Dieser Test hält drei Dinge fest, die nicht zurückfallen dürfen:
 *   1. Es wird die RPC gerufen, mit der Gegenperson als Argument.
 *   2. Für Direktnachrichten wird conversation_members NICHT mehr direkt
 *      abgefragt — genau diese Abfrage war die Heuristik.
 *   3. is_group kommt aus der Antwort und wird nicht auf false geraten.
 */
test.describe('KRS Connect — Direktnachricht landet nicht im Gruppenchat (O1)', () => {

  test('createConversation ruft get_or_create_dm und fasst conversation_members nicht an', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const DS = (window as any).DataService;
      if (!DS) return { ds: false } as any;
      const rpcCalls: any[] = [];
      const fromCalls: string[] = [];
      const fakeSb = {
        rpc: (name: string, args: any) => {
          rpcCalls.push({ name, args });
          return Promise.resolve({ data: [{ conversation_id: 4711, is_group: false }], error: null });
        },
        from: (t: string) => { fromCalls.push(t); throw new Error('from(' + t + ') fuer DM nicht erlaubt'); },
        channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
        removeChannel: () => {}
      };
      const ds = new DS(fakeSb);
      const conv = await ds.createConversation(1, 38);
      return { ds: true, conv, rpcCalls, fromCalls };
    });

    test.skip(res.ds === false, 'window.DataService nicht verfügbar');
    expect(res.rpcCalls).toHaveLength(1);
    expect(res.rpcCalls[0].name).toBe('get_or_create_dm');
    expect(res.rpcCalls[0].args).toEqual({ p_other_user_id: 38 });
    expect(res.fromCalls).toEqual([]);
    expect(res.conv).toEqual({ id: 4711, is_group: false });
  });

  test('is_group wird aus der Antwort übernommen, nicht geraten', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const DS = (window as any).DataService;
      if (!DS) return { ds: false } as any;
      const fakeSb = {
        rpc: () => Promise.resolve({ data: [{ conversation_id: 58, is_group: true }], error: null }),
        from: () => { throw new Error('nicht erlaubt'); },
        channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
        removeChannel: () => {}
      };
      const ds = new DS(fakeSb);
      return { ds: true, conv: await ds.createConversation(1, 38) };
    });
    test.skip(res.ds === false, 'window.DataService nicht verfügbar');
    // Der alte Code hätte hier hart is_group:false geliefert und die Gruppe
    // als Einzelchat dargestellt. Genau das darf nicht wieder passieren.
    expect(res.conv.is_group).toBe(true);
  });

  test('Fehlschlag ist sichtbar und liefert keinen Schein-Chat', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const DS = (window as any).DataService;
      if (!DS) return { ds: false } as any;
      const toasts: string[] = [];
      const alterToast = (window as any).showToast;
      (window as any).showToast = (m: string) => { toasts.push(m); };
      const fakeSb = {
        rpc: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
        from: () => { throw new Error('nicht erlaubt'); },
        channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
        removeChannel: () => {}
      };
      const ds = new DS(fakeSb);
      const conv = await ds.createConversation(1, 38);
      (window as any).showToast = alterToast;
      return { ds: true, conv, toasts };
    });
    test.skip(res.ds === false, 'window.DataService nicht verfügbar');
    expect(res.conv).toBeNull();
    expect(res.toasts.length).toBe(1);
  });

  test('Demo-Modus bleibt unverändert', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const DS = (window as any).DataService;
      if (!DS) return { ds: false } as any;
      const ds = new DS(null);
      const conv = await ds.createConversation(1, 2);
      return { ds: true, ok: !!(conv && conv.id), is_group: conv && conv.is_group };
    });
    test.skip(res.ds === false, 'window.DataService nicht verfügbar');
    expect(res.ok).toBe(true);
    expect(res.is_group).toBe(false);
  });
});
