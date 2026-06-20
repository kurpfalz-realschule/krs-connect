import { test, expect } from '../fixtures/connect';

/**
 * Fix #7 + #12 — Anhänge in Antworten & Bild-Upload (Demo-Modus).
 *
 *  - uploadFile gibt im Demo eine blob:-URL zurück (kein Server-Roundtrip)
 *  - createReply trägt image_url; getReplies liefert den Anhang sichtbar zurück
 *    (= "Anhang in Antworten + im Thread sichtbar")
 *  - sendMessage trägt image_url (Bild in Direktnachricht)
 */
test.describe('KRS Connect — Anhänge & Upload', () => {
  test('uploadFile liefert im Demo eine blob-URL', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const DS = (window as any).DataService;
      if (!DS) return { ds: false };
      const ds = new DS(null);
      const file = new File(['x'], 'bild.png', { type: 'image/png' });
      const url = await ds.uploadFile(file);
      return { ds: true, isBlob: typeof url === 'string' && url.startsWith('blob:') };
    });
    test.skip(res.ds === false, 'window.DataService nicht verfügbar');
    expect(res.isBlob).toBe(true);
  });

  test('Antwort mit Anhang ist im Thread sichtbar (createReply → getReplies)', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const DS = (window as any).DataService;
      if (!DS) return { ds: false };
      const ds = new DS(null);
      const ch = 'e2e-ch-r-' + Date.now();
      const post = await ds.createPost(ch, 1, '<p>Wurzel</p>', 'Thread');
      const reply = await ds.createReply(post.id, ch, 1, 'Antwort mit Bild', 'blob:demo-anhang');
      const replies = await ds.getReplies(post.id);
      const found = Array.isArray(replies)
        && replies.some((r: any) => r.id === reply.id && r.image_url === 'blob:demo-anhang');
      return {
        ds: true,
        replyHasImage: !!(reply && reply.image_url === 'blob:demo-anhang'),
        found,
      };
    });
    test.skip(res.ds === false, 'window.DataService nicht verfügbar');
    expect(res.replyHasImage).toBe(true);
    expect(res.found).toBe(true);
  });

  test('Bild in Direktnachricht (sendMessage trägt image_url)', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const DS = (window as any).DataService;
      if (!DS) return { ds: false };
      const ds = new DS(null);
      const msg = await ds.sendMessage('e2e-conv-img-' + Date.now(), 1, 'Bild anbei', 'blob:demo-bild');
      return { ds: true, hasImage: !!(msg && msg.image_url === 'blob:demo-bild') };
    });
    test.skip(res.ds === false, 'window.DataService nicht verfügbar');
    expect(res.hasImage).toBe(true);
  });
});
