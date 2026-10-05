import { test, expect, openConnect } from '../fixtures/connect.ts';

/**
 * M1a: PDF.js 6.3.289 ohne Eval, SheetJS CE 0.20.3 mit Größengrenze,
 * DOMPurify 3.4.16. Die Vorschau-Bibliotheken liegen versioniert unter vendor/.
 */

const TINY_PDF = Uint8Array.from(atob(
  'JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1szIDAgUl0+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCAyMDAgMjAwXS9Db250ZW50cyA0IDAgUj4+CmVuZG9iago0IDAgb2JqCjw8L0xlbmd0aCA0ND4+CnN0cmVhbQpCVCAvRjEgMjQgVGYgNzIgMTAwIFRkIChPaykgVGogRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyMDQgMDAwMDAgbiAKdHJhaWxlcjw8L1NpemUgNS9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjI5NwolJUVPRg=='
), c => c.charCodeAt(0));

test.describe('M1 Bibliotheken', () => {
  test.beforeEach(async ({ page }) => {
    await openConnect(page, { user: 'la' });
    await page.waitForFunction(
      () => !!(window as any).DOMPurify && !!(window as any).__krsFilePreview,
      null,
      { timeout: 10_000 }
    );
  });

  test('DOMPurify 3.4.16 entfernt Skripte, fehlt sie, bleibt nur Text', async ({ page }) => {
    const out = await page.evaluate(() => {
      const dirty = '<p>Hallo</p><script>alert(1)</script><img src=x onerror=alert(1)>';
      const clean = (window as any).DOMPurify.sanitize(dirty);
      const saved = (window as any).DOMPurify;
      (window as any).DOMPurify = undefined;
      let plain = '';
      try { plain = (window as any).__krsSanitizeHtml(dirty); }
      finally { (window as any).DOMPurify = saved; }
      return {
        version: saved.version,
        clean,
        plain,
      };
    });
    expect(out.version).toBe('3.4.16');
    expect(out.clean).not.toContain('<script');
    expect(out.clean).not.toContain('onerror');
    expect(out.plain).not.toMatch(/<script/i);
    expect(out.plain).toContain('&lt;script');
  });

  test('Vorschau nennt die geprüften Stände', async ({ page }) => {
    const libs = await page.evaluate(() => (window as any).__krsFilePreview);
    expect(libs).toEqual({
      pdfJsVersion: '6.3.289',
      xlsxVersion: '0.20.3',
      mammothVersion: '1.13.0',
      xlsxMaxBytes: 2 * 1024 * 1024,
    });
  });

  test('eigene PDF.js-Datei rendert eine kleine gültige PDF und lehnt Datenmüll ab', async ({ page }) => {
    const pdfBytes = Array.from(TINY_PDF);
    const result = await page.evaluate(async (bytes) => {
      const base = new URL('vendor/pdfjs-6.3.289/pdf.min.mjs', document.baseURI);
      const lib = await import(base.href);
      lib.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', base).href;
      const data = new Uint8Array(bytes);
      const doc = await lib.getDocument({ data, isEvalSupported: false }).promise;
      const pdfPage = await doc.getPage(1);
      const viewport = pdfPage.getViewport({ scale: 1 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await pdfPage.render({ canvasContext: ctx, canvas: null, viewport }).promise;
      let rejected = false;
      try {
        await lib.getDocument({ data: new Uint8Array([1, 2, 3, 4]), isEvalSupported: false }).promise;
      } catch (e) {
        rejected = true;
      }
      return { pages: doc.numPages, width: canvas.width, rejected };
    }, pdfBytes);
    expect(result.pages).toBe(1);
    expect(result.width).toBeGreaterThan(0);
    expect(result.rejected).toBe(true);
  });

  test('eigene SheetJS-Datei liest eine kleine Tabelle, Datenmüll wird kein Skript', async ({ page }) => {
    const out = await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'vendor/xlsx-0.20.3.full.min.js';
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('xlsx'));
        document.head.appendChild(s);
      });
      const XLSX = (window as any).XLSX;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Klasse', '7a']]), 'Plan');
      const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const back = XLSX.read(bytes, { type: 'array', sheetRows: 200, cellFormula: false, cellHTML: false });
      const html = XLSX.utils.sheet_to_html(back.Sheets.Plan);
      let junk = '';
      try {
        const bad = XLSX.read(new Uint8Array([1, 2, 3, 4]), { type: 'array', sheetRows: 200, cellFormula: false, cellHTML: false });
        junk = (bad.SheetNames || []).map((name: string) => XLSX.utils.sheet_to_html(bad.Sheets[name] || {})).join('');
      } catch (e) {
        junk = 'rejected';
      }
      return { version: XLSX.version, html, junk };
    });
    expect(out.version).toBe('0.20.3');
    expect(out.html).toContain('7a');
    expect(out.junk).not.toMatch(/<script/i);
  });
});
