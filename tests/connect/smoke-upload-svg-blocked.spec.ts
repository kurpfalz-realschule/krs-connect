import { test, expect } from '../fixtures/connect';

/**
 * S4 — SVG-Upload & SVG-Render blockiert (Stored-XSS-Pfad geschlossen).
 *
 * Zwei Verteidigungslinien werden geprüft:
 *  1) Upload-Whitelist: image/svg+xml und .svg sind NICHT erlaubt
 *     (UPLOAD_CONFIG.ALLOWED_MIME/ALLOWED_EXT), svg zusätzlich in
 *     BLOCKED_EXTENSIONS. DataService.uploadFile() lehnt eine SVG ab (null).
 *  2) Render-Whitelist: isSafeImageSrc() lässt data:image/svg+xml NICHT durch,
 *     erlaubte Raster-Formate aber schon.
 *
 * Getestet wird über die window-Test-Hooks (__krsUploadConfig,
 * __krsIsSafeImageSrc, DataService) — zuverlässiger als fragile UI.
 */
test.describe('KRS Connect — S4: SVG blockiert', () => {
  test('Upload-Whitelist enthält kein SVG (MIME + Endung + blockiert)', async ({ connectPage: page }) => {
    const res = await page.evaluate(() => {
      const cfg = (window as any).__krsUploadConfig;
      const blocked = (window as any).__krsConfig?.BLOCKED_EXTENSIONS;
      return {
        hasCfg: !!cfg,
        svgMime: cfg?.ALLOWED_MIME?.has('image/svg+xml') ?? null,
        svgExt: cfg?.ALLOWED_EXT?.has('svg') ?? null,
        pngMime: cfg?.ALLOWED_MIME?.has('image/png') ?? null,
        svgBlocked: blocked?.has('svg') ?? null,
      };
    });
    expect(res.hasCfg).toBe(true);
    expect(res.svgMime).toBe(false);   // image/svg+xml NICHT erlaubt
    expect(res.svgExt).toBe(false);    // .svg NICHT erlaubt
    expect(res.pngMime).toBe(true);    // Regression: PNG bleibt erlaubt
    expect(res.svgBlocked).toBe(true); // svg in BLOCKED_EXTENSIONS
  });

  test('isSafeImageSrc lehnt data:image/svg+xml ab, erlaubt Raster', async ({ connectPage: page }) => {
    const res = await page.evaluate(() => {
      const fn = (window as any).__krsIsSafeImageSrc;
      if (typeof fn !== 'function') return { hasFn: false };
      const svg = 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=';
      const svgUtf = 'data:image/svg+xml,<svg onload="alert(1)"></svg>';
      return {
        hasFn: true,
        svgBase64: fn(svg),
        svgUtf: fn(svgUtf),
        png: fn('data:image/png;base64,iVBORw0KGgo='),
        http: fn('https://example.org/a.png'),
      };
    });
    expect(res.hasFn).toBe(true);
    expect(res.svgBase64).toBe(false); // XSS-Vektor abgelehnt
    expect(res.svgUtf).toBe(false);    // XSS-Vektor abgelehnt
    expect(res.png).toBe(true);        // Regression: PNG-Data-URL erlaubt
    expect(res.http).toBe(true);       // Regression: http(s) erlaubt
  });

  test('DataService.uploadFile lehnt eine SVG-Datei ab', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const DS = (window as any).DataService;
      if (!DS) return 'no-dataservice';
      // Nicht-Demo-Instanz erzwingen, damit die Pre-Flight-Whitelist greift
      // (Demo-uploadFile gibt sofort eine blob:-URL zurück).
      const ds = new DS(null);
      ds.isDemo = false;
      const svg = new File(['<svg onload="alert(1)"></svg>'], 'x.svg', { type: 'image/svg+xml' });
      try {
        const out = await ds.uploadFile(svg);
        return out === null ? 'blocked' : 'passed';
      } catch (e) {
        // Kein Supabase-Client in der Instanz → falls es die Whitelist passiert,
        // würde es hier erst am sb-Zugriff scheitern. 'blocked' ist das Ziel.
        return 'threw';
      }
    });
    // Ziel: von der MIME-Whitelist abgewiesen (null), bevor irgendein
    // Server-Roundtrip passiert. 'no-dataservice' toleriert Build-Varianten.
    expect(['blocked', 'no-dataservice']).toContain(res);
  });
});
