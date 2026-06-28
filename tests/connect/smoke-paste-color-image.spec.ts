import { test, expect, openConnect } from '../fixtures/connect.ts';

/**
 * smoke-paste-color-image.spec.ts
 * Prüft, dass beim Einfügen Farben UND Bilder erhalten bleiben — sowohl im
 * Paste-Simplifier (Editor) als auch im Render-Sanitizer (Anzeige des Beitrags).
 *
 * Getestet über die exponierten Logik-Hooks window.__krsSimplifyPastedHtml /
 * window.__krsSanitizeHtml (hermetisch, unabhängig von der UI-Variante).
 */

test.describe('Paste/Render: Farben & Bilder bleiben erhalten', () => {

  test.beforeEach(async ({ page }) => {
    await openConnect(page, { user: 'nk' });
    // DOMPurify muss geladen sein, sonst degradieren die Funktionen auf Plaintext
    await page.waitForFunction(
      () => !!(window as any).DOMPurify
        && typeof (window as any).__krsSanitizeHtml === 'function'
        && typeof (window as any).__krsSimplifyPastedHtml === 'function',
      null, { timeout: 10_000 }
    );
  });

  test('Paste-Simplifier behält Textfarbe', async ({ page }) => {
    const out = await page.evaluate(() =>
      (window as any).__krsSimplifyPastedHtml('<p><span style="color: #C0392B">Achtung</span></p>')
    );
    expect(out).toMatch(/color:\s*#c0392b/i);
    expect(out).toContain('Achtung');
  });

  test('Render-Sanitizer behält Textfarbe (Anzeige)', async ({ page }) => {
    const out = await page.evaluate(() =>
      (window as any).__krsSanitizeHtml('<span style="color: #C0392B">Achtung</span>')
    );
    expect(out).toMatch(/color:\s*#c0392b/i);
  });

  test('Render-Sanitizer wirft gefährliche Styles weg, Farbe bleibt', async ({ page }) => {
    const out = await page.evaluate(() =>
      (window as any).__krsSanitizeHtml('<span style="color: green; position: fixed; background: url(javascript:alert(1))">x</span>')
    );
    expect(out).toMatch(/color:\s*green/i);
    expect(out).not.toMatch(/position/i);
    expect(out).not.toMatch(/javascript/i);
    expect(out).not.toMatch(/url\(/i);
  });

  test('Paste-Simplifier behält Inline-Bild (https)', async ({ page }) => {
    const out = await page.evaluate(() =>
      (window as any).__krsSimplifyPastedHtml('<p>Foto: <img src="https://example.com/bild.png" alt="Bild"></p>')
    );
    expect(out).toMatch(/<img[^>]+src="https:\/\/example\.com\/bild\.png"/i);
    expect(out).toMatch(/referrerpolicy="no-referrer"/i);
  });

  test('Render-Sanitizer behält Inline-Bild (data:image)', async ({ page }) => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const out = await page.evaluate((u) =>
      (window as any).__krsSanitizeHtml('<img src="' + u + '" alt="px">'), dataUri
    );
    expect(out).toMatch(/<img/i);
    expect(out).toContain('data:image/png;base64,');
  });

  test('Render-Sanitizer entfernt unsichere Bild-Quelle', async ({ page }) => {
    const out = await page.evaluate(() =>
      (window as any).__krsSanitizeHtml('<img src="javascript:alert(1)"> <img src="data:text/html;base64,PHNjcmlwdD4=">')
    );
    expect(out).not.toMatch(/<img/i);
    expect(out).not.toMatch(/javascript/i);
    expect(out).not.toMatch(/text\/html/i);
  });

});
