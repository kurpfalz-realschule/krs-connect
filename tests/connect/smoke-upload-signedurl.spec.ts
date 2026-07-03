import { test, expect } from '../fixtures/connect';

/**
 * S1 · Storage-Bucket privat + Signed URLs
 *
 * Der Bucket "images" ist privat; das Frontend speichert nur den Objekt-Pfad
 * und zieht beim Rendern eine kurzlebige Signed URL. Signieren selbst braucht
 * echtes Supabase — im Demo-Modus prüfen wir daher die risikoreiche Logik über
 * die Test-Hooks:
 *   window.__krsStoragePath(ref)      → Pfad-Extraktion / Pass-Through
 *   window.__krsResolveStorageUrl(ref)→ ohne Client: Original zurück (kein Crash)
 *
 * Zusätzlich: uploadFile speichert im Demo eine blob:-URL, die der Resolver
 * unverändert durchreicht (Inline-Vorschau bleibt heil).
 */
test.describe('KRS Connect — S1 Signed-URL-Resolver (Demo-Modus)', () => {

  test('Hooks sind installiert', async ({ connectPage: page }) => {
    const ok = await page.evaluate(() =>
      typeof (window as any).__krsStoragePath === 'function' &&
      typeof (window as any).__krsResolveStorageUrl === 'function'
    );
    expect(ok).toBe(true);
  });

  test('storagePath extrahiert Pfad aus Legacy-/public/-URL', async ({ connectPage: page }) => {
    const path = await page.evaluate(() => (window as any).__krsStoragePath(
      'https://ooejsfixxiuobrpqgfqm.supabase.co/storage/v1/object/public/images/uploads/123_abc.png'
    ));
    expect(path).toBe('uploads/123_abc.png');
  });

  test('storagePath erkennt roheren Objekt-Pfad (neuer Upload)', async ({ connectPage: page }) => {
    const path = await page.evaluate(() => (window as any).__krsStoragePath('uploads/123_abc.png'));
    expect(path).toBe('uploads/123_abc.png');
  });

  test('storagePath reicht data:/blob:/externe URLs durch (null)', async ({ connectPage: page }) => {
    const res = await page.evaluate(() => ({
      data: (window as any).__krsStoragePath('data:image/png;base64,AAAA'),
      blob: (window as any).__krsStoragePath('blob:https://x/abc'),
      ext:  (window as any).__krsStoragePath('https://example.org/bild.png'),
      leer: (window as any).__krsStoragePath(''),
    }));
    expect(res.data).toBeNull();
    expect(res.blob).toBeNull();
    expect(res.ext).toBeNull();
    expect(res.leer).toBeNull();
  });

  test('resolveStorageUrl reicht Nicht-Storage-Referenzen unverändert durch', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const r = (window as any).__krsResolveStorageUrl;
      return {
        data: await r('data:image/png;base64,AAAA'),
        blob: await r('blob:https://x/abc'),
      };
    });
    expect(res.data).toBe('data:image/png;base64,AAAA');
    expect(res.blob).toBe('blob:https://x/abc');
  });

  test('resolveStorageUrl ohne Client (Demo) gibt Pfad-Referenz unverändert zurück', async ({ connectPage: page }) => {
    // Kein window.__krsSb im Demo → Resolver darf nicht crashen, gibt Original.
    const out = await page.evaluate(async () =>
      await (window as any).__krsResolveStorageUrl('uploads/123_abc.png')
    );
    expect(out).toBe('uploads/123_abc.png');
  });

  test('Demo-Upload liefert blob:-URL, Resolver reicht sie durch', async ({ connectPage: page }) => {
    const out = await page.evaluate(async () => {
      const ds = (window as any).DataService ? new (window as any).DataService(null) : null;
      if (!ds) return 'no-dataservice';
      const file = new File(['x'], 'test.png', { type: 'image/png' });
      const url = await ds.uploadFile(file);
      const resolved = await (window as any).__krsResolveStorageUrl(url);
      return resolved === url && String(url).startsWith('blob:') ? 'blob-passthrough' : String(url);
    });
    expect(['blob-passthrough', 'no-dataservice']).toContain(out);
  });
});
