import { test, expect } from '../fixtures/connect';

/**
 * S14 (22.09.2026, R17) — Monika Schrödl, Feedback #43:
 * „Ich habe in einem Post eine Datei hochgeladen. Es ist nicht möglich,
 * dann später NUR die Datei zu löschen."
 *
 * Fix: DataService.updatePost() bekommt einen optionalen vierten Parameter
 * `imageUrl`. Bleibt er `undefined` (Standardfall bei reiner Textbearbeitung),
 * rührt das Update die Anhänge nicht an — nur bei explizit übergebenem Wert
 * (auch `null`) wird `image_url` ersetzt. Im Bearbeiten-Dialog entfernt ein
 * ✕ je Anhang (mit Rückfrage) nur die Verknüpfung aus der bearbeitbaren Kopie
 * (`editAttachments`); beim Speichern wird daraus ein neues `image_url`
 * gebaut. Die Datei selbst bleibt im Storage-Bucket (kann von anderen
 * Beiträgen/Weiterleitungen noch referenziert sein) — bewusste Entscheidung,
 * siehe sprint sonnet teams 2.0.md Abschnitt „S14".
 *
 * Getestet auf DataService-Ebene (Muster wie smoke-attachments.spec.ts /
 * smoke-post-delete.spec.ts) — robuster als ein UI-Dialog-Confirm-Test und
 * konsistent mit der bestehenden Test-Konvention dieses Repos.
 */
test.describe('S14: Nur den Anhang aus einem Beitrag entfernen', () => {
  test('updatePost mit imageUrl ersetzt die Anhänge — Text/Titel bleiben unverändert', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const DS = (window as any).DataService;
      const ds = new DS(null);
      const ch = 'e2e-ch-s14a-' + Date.now();
      const zweiAnhaenge = JSON.stringify([
        { url: 'blob:demo-anhang-1', name: 'anhang1.png', type: 'image/png' },
        { url: 'blob:demo-anhang-2', name: 'anhang2.pdf', type: 'application/pdf' },
      ]);
      const post = await ds.createPost(ch, 1, '<p>Originaltext</p>', 'Originaltitel', zweiAnhaenge);
      const nurNochEiner = JSON.stringify([{ url: 'blob:demo-anhang-1', name: 'anhang1.png', type: 'image/png' }]);
      const updated = await ds.updatePost(post.id, '<p>Originaltext</p>', 'Originaltitel', nurNochEiner);
      const posts = await ds.getPosts(ch);
      const fresh = posts.find((p: any) => p.id === post.id);
      return {
        createdCount: JSON.parse(post.image_url).length,
        updatedCount: JSON.parse(updated.image_url).length,
        contentUnchanged: updated.content === '<p>Originaltext</p>',
        titleUnchanged: updated.title === 'Originaltitel',
        freshCount: fresh ? JSON.parse(fresh.image_url).length : -1,
      };
    });
    expect(res.createdCount).toBe(2);
    expect(res.updatedCount).toBe(1);
    expect(res.contentUnchanged).toBe(true);
    expect(res.titleUnchanged).toBe(true);
    expect(res.freshCount).toBe(1);
  });

  test('updatePost ohne imageUrl-Parameter lässt Anhänge unangetastet (reine Textbearbeitung)', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const DS = (window as any).DataService;
      const ds = new DS(null);
      const ch = 'e2e-ch-s14b-' + Date.now();
      const anhang = JSON.stringify([{ url: 'blob:demo-anhang', name: 'datei.pdf', type: 'application/pdf' }]);
      const post = await ds.createPost(ch, 1, '<p>Alt</p>', 'Alt', anhang);
      // Nur Text/Titel ändern — wie handleSaveEdit es vor S14 schon tat, und
      // wie es weiterhin funktionieren muss, wenn niemand einen Anhang anfasst.
      const updated = await ds.updatePost(post.id, '<p>Neu</p>', 'Neu');
      return {
        imageUrlUnchanged: updated.image_url === anhang,
        contentChanged: updated.content === '<p>Neu</p>',
      };
    });
    expect(res.imageUrlUnchanged).toBe(true);
    expect(res.contentChanged).toBe(true);
  });

  test('updatePost mit imageUrl=null entfernt alle Anhänge (letzter Anhang entfernt)', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const DS = (window as any).DataService;
      const ds = new DS(null);
      const ch = 'e2e-ch-s14c-' + Date.now();
      const anhang = JSON.stringify([{ url: 'blob:demo-anhang', name: 'datei.pdf', type: 'application/pdf' }]);
      const post = await ds.createPost(ch, 1, '<p>Text bleibt</p>', null, anhang);
      const updated = await ds.updatePost(post.id, '<p>Text bleibt</p>', null, null);
      const posts = await ds.getPosts(ch);
      const fresh = posts.find((p: any) => p.id === post.id);
      return {
        imageUrlNull: updated.image_url === null,
        contentUnchanged: updated.content === '<p>Text bleibt</p>',
        freshImageUrlNull: fresh ? fresh.image_url === null : false,
      };
    });
    expect(res.imageUrlNull).toBe(true);
    expect(res.contentUnchanged).toBe(true);
    expect(res.freshImageUrlNull).toBe(true);
  });

  // Kein UI-Durchklick-Test: DataService.createPost() setzt im Demo-Modus nie
  // `post.author_id` (nur das volle `author`-Objekt, siehe index.html
  // ~Z. 3587) — dadurch ist `isAuthor` für JEDEN im Demo-Modus über die
  // Oberfläche erstellten Beitrag `false`, und der Bearbeiten-Knopf erscheint
  // nie. Das ist ein vorbestehender Demo-Harness-Zustand, unabhängig von S14
  // (mit einem echten Test verifiziert, siehe Commit-Historie dieser Datei),
  // und derselbe Grund, aus dem auch `smoke-post-edit.spec.ts` ausschließlich
  // auf DataService-Ebene testet statt über die Oberfläche. Die drei Tests
  // oben decken die eigentliche S14-Logik (updatePost mit/ohne imageUrl,
  // inkl. Löschen des letzten Anhangs) vollständig ab; der Render-/Klickpfad
  // (editAttachments-State, ✕-Knopf, Rückfrage) ist Code-geprüft.
});
