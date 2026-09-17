import { test, expect, openConnect } from '../fixtures/connect';

/**
 * v4.23.1 — Beitrag wirklich löschen.
 *
 * PostgREST liefert bei einer durch RLS herausgefilterten DELETE-Anfrage keinen
 * Fehler, sondern keine Zeile. deletePost muss das unterscheiden, damit die UI
 * nicht fälschlich „Beitrag gelöscht" meldet.
 */
test.describe('KRS Connect — Beitrag löschen', () => {
  test('DataService meldet nur dann Erfolg, wenn die Datenbank eine Zeile zurückgibt', async ({ page }) => {
    await openConnect(page, { user: 'la' });

    const result = await page.evaluate(async () => {
      const DS = (window as any).DataService;

      const client = (parentResult: any) => ({
        from: () => ({
          delete: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => parentResult,
              }),
            }),
          }),
        }),
      });

      const allowed = new DS(client({ data: { id: 118 }, error: null }));
      const denied = new DS(client({ data: null, error: null }));

      return {
        allowed: await allowed.deletePost(118),
        denied: await denied.deletePost(118),
      };
    });

    expect(result.allowed).toBe(true);
    expect(result.denied).toBe(false);
  });

  test('eigener Demo-Beitrag wird tatsächlich aus dem Store gelöscht', async ({ page }) => {
    await openConnect(page, { user: 'la' });

    const created = await page.evaluate(async () => {
      const DS = (window as any).DataService;
      const ds = new DS(null);
      const post = await ds.createPost(1, 1, 'Löschtest ' + Date.now(), 'Löschtest');
      const before = await ds.getPosts(1);
      const deleted = await ds.deletePost(post.id);
      const after = await ds.getPosts(1);
      return {
        deleted,
        beforeHadPost: before.some((p: any) => p.id === post.id),
        afterHasPost: after.some((p: any) => p.id === post.id),
      };
    });

    expect(created.beforeHadPost).toBe(true);
    expect(created.deleted).toBe(true);
    expect(created.afterHasPost).toBe(false);
  });
});
