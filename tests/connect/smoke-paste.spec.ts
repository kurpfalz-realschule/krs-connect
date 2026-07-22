import { test, expect, openConnect } from '../fixtures/connect.ts';

/**
 * smoke-paste.spec.ts
 * Prüft Paste-Verhalten im WYSIWYG-Feld (contentEditable ".rich-editor"):
 * Fett, Links, Plaintext, aggressive Word/Outlook-Bereinigung + Bild-Paste im Chat.
 */

// Öffnet den Beitrags-Editor und liefert das contentEditable-Feld zurück (oder null).
async function openPostEditor(page: any) {
  const newPostBtn = page.locator('button[aria-label="Neuer Beitrag"], button:has-text("Neuer Beitrag"), button:has-text("Beitrag erstellen")').first();
  if (!await newPostBtn.isVisible().catch(() => false)) return null;
  await newPostBtn.click();
  const editor = page.locator('.rich-editor').first();
  if (!await editor.isVisible({ timeout: 3000 }).catch(() => false)) return null;
  await editor.click();
  return editor;
}

// Feuert ein Paste-Event mit text/html (+ text/plain) auf das fokussierte .rich-editor.
async function pasteHtml(page: any, html: string, plain: string) {
  await page.evaluate(({ h, p }) => {
    const el = document.querySelector('.rich-editor') as HTMLElement | null;
    if (!el) return;
    el.focus();
    const dt = new DataTransfer();
    dt.setData('text/html', h);
    dt.setData('text/plain', p);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, { h: html, p: plain });
}

test.describe('Paste-Formatierung im Beitrags-Editor (WYSIWYG)', () => {

  test('HTML-Paste übernimmt Fett-Formatierung', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    const editor = await openPostEditor(page);
    if (!editor) { test.skip(true, 'Kein Beitrags-Editor sichtbar — UI-Variante'); return; }

    await pasteHtml(page, '<p>Das ist <strong>fetter</strong> Text</p>', 'Das ist fetter Text');

    const html = await editor.evaluate((el: HTMLElement) => el.innerHTML);
    expect(html).toMatch(/<(b|strong)>fetter<\/(b|strong)>/i);
    expect(html).toContain('fetter');
  });

  test('HTML-Paste übernimmt Links', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    const editor = await openPostEditor(page);
    if (!editor) { test.skip(true, 'Kein Beitrags-Editor'); return; }

    await pasteHtml(page, '<a href="https://example.com">Beispiel</a>', 'Beispiel');

    const html = await editor.evaluate((el: HTMLElement) => el.innerHTML);
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('Beispiel');
  });

  test('Plaintext-Paste bleibt einfacher Text', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    const editor = await openPostEditor(page);
    if (!editor) { test.skip(true, 'Kein Beitrags-Editor'); return; }

    await pasteHtml(page, '', 'Hallo Welt');
    const text = await editor.evaluate((el: HTMLElement) => el.textContent || '');
    expect(text).toContain('Hallo Welt');
  });

  test('Word/Outlook-Paste wird zu sauberem HTML bereinigt', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    const editor = await openPostEditor(page);
    if (!editor) { test.skip(true, 'Kein Beitrags-Editor'); return; }

    // Typischer Outlook-Auszug: tief verschachtelte leere Spans, font-weight:400,
    // color:windowtext/black, color:red, verschachtelte Liste, Link.
    const wordHtml = '<p style="font-style: normal; font-weight: 400"><span><span><span><b><span>FAQ Schulwoche 34</span></b></span></span></span></p>'
      + '<ul style="font-style: normal; font-weight: 400">'
      + '<li style="color: windowtext"><span><span><span style="color: black">Termin A</span></span></span></li>'
      + '<li style="color: red"><span><span>Wichtiger Termin</span></span></li></ul>'
      + '<ul><li><span>Wichtig:</span><ul><li><span>Bis Donnerstag</span></li></ul></li></ul>'
      + '<p><a style="color: purple; text-decoration: underline" href="mailto:x@y.de"><span style="color: blue">x@y.de</span></a></p>';

    await pasteHtml(page, wordHtml, 'FAQ Schulwoche 34 Termin A Wichtiger Termin');

    const html = await editor.evaluate((el: HTMLElement) => el.innerHTML);
    // Word-Müll ist weg
    expect(html).not.toMatch(/<span><\/span>/);
    expect(html).not.toMatch(/font-weight:\s*400/i);
    expect(html).not.toMatch(/font-style:\s*normal/i);
    expect(html).not.toMatch(/windowtext/i);
    expect(html).not.toMatch(/<span><span><span>/);
    // Sinnvolle Formatierung + Struktur erhalten
    expect(html).toMatch(/<(b|strong)>FAQ Schulwoche 34<\/(b|strong)>/i);
    expect(html).toMatch(/color:\s*red/i);
    expect(html).toMatch(/<ul>[\s\S]*<ul>/i);     // verschachtelte Liste
    expect(html).toContain('href="mailto:x@y.de"');
  });

});

test.describe('Chat: WYSIWYG-Eingabe + Bild-Paste', () => {

  async function openFirstChat(page: any) {
    const chatNav = page.locator('button[aria-label="Chats"], button:has-text("Chat")').first();
    if (await chatNav.isVisible().catch(() => false)) await chatNav.click();
    const chatItem = page.locator('.conversation-item, [data-testid="conversation-item"]').first();
    if (!await chatItem.isVisible({ timeout: 2000 }).catch(() => false)) return false;
    await chatItem.click();
    return true;
  }

  test('Chat-Eingabe ist ein WYSIWYG-Feld (contentEditable)', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    if (!await openFirstChat(page)) { test.skip(true, 'Kein Chat sichtbar — Demo-Variante'); return; }

    const editor = page.locator('.chat-input-bar .rich-editor').first();
    await expect(editor).toBeVisible({ timeout: 3000 });
    const isCE = await editor.evaluate((el: HTMLElement) => el.getAttribute('contenteditable'));
    expect(isCE).toBe('true');
  });

  test('Bild-Paste im Chat hängt Datei an (Toast)', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    if (!await openFirstChat(page)) { test.skip(true, 'Kein Chat sichtbar — Demo-Variante'); return; }

    const editor = page.locator('.chat-input-bar .rich-editor').first();
    await expect(editor).toBeVisible({ timeout: 3000 });
    await editor.click();

    await page.evaluate(() => {
      const el = document.querySelector('.chat-input-bar .rich-editor') as HTMLElement | null;
      if (!el) return;
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const byteChars = atob(b64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      const file = new File([new Blob([bytes], { type: 'image/png' })], 'test.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });

    await expect(page.locator('.toast, [role="status"]').filter({ hasText: /bild/i }))
      .toBeVisible({ timeout: 3000 });
  });

});
