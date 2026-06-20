import { test, expect } from '../fixtures/connect';

/**
 * Fix #6 — Forenbeitrag bearbeiten (robust).
 *
 * DataService.updatePost im Demo-Modus: ändert Inhalt/Titel und setzt edited_at
 * (Grundlage für das "(bearbeitet)"-Label). Die Live-Variante speichert
 * notfalls ohne edited_at, falls die Spalte fehlt — hier wird der Demo-Pfad
 * (Spalte vorhanden) geprüft.
 */
test.describe('KRS Connect — Beitrag bearbeiten', () => {
  test('updatePost ändert Inhalt/Titel und setzt edited_at', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const DS = (window as any).DataService;
      if (!DS) return { ds: false };
      const ds = new DS(null);
      const ch = 'e2e-ch-' + Date.now();
      const post = await ds.createPost(ch, 1, '<p>Original</p>', 'Alter Titel');
      if (!post || !post.id) return { ds: true, created: false };
      const upd = await ds.updatePost(post.id, '<p>Bearbeitet</p>', 'Neuer Titel');
      return {
        ds: true,
        created: true,
        content: upd && upd.content,
        title: upd && upd.title,
        hasEditedAt: !!(upd && upd.edited_at),
      };
    });
    test.skip(res.ds === false, 'window.DataService nicht verfügbar');
    expect(res.created).toBe(true);
    expect(res.content).toContain('Bearbeitet');
    expect(res.title).toBe('Neuer Titel');
    expect(res.hasEditedAt).toBe(true);
  });
});
