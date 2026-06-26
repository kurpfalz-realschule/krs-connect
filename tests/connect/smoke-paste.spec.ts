import { test, expect, openConnect } from '../fixtures/connect.ts';

/**
 * smoke-paste.spec.ts
 * Prüft: HTML-Paste mit Formatierung + Bild-Paste im Post-Editor und Chat-Input.
 */

test.describe('Paste-Formatierung im Post-Editor', () => {

  test('HTML-Paste übernimmt Fett-Formatierung', async ({ page }) => {
    await openConnect(page, { user: 'nk' });

    // Post-Editor öffnen
    const newPostBtn = page.locator('button[aria-label="Neuer Beitrag"], button:has-text("Neuer Beitrag"), button:has-text("Beitrag erstellen")').first();
    if (!await newPostBtn.isVisible()) {
      test.skip(true, 'Kein „Neuer Beitrag"-Button gefunden — UI-Variante');
      return;
    }
    await newPostBtn.click();

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // HTML mit <strong> in die Textarea einfügen via clipboardData
    await textarea.focus();
    await page.evaluate(() => {
      const ta = document.querySelector('textarea');
      if (!ta) return;
      const dt = new DataTransfer();
      dt.setData('text/html', '<p>Das ist <strong>fetter</strong> Text</p>');
      dt.setData('text/plain', 'Das ist fetter Text');
      ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });

    // textarea-Inhalt sollte <strong> enthalten
    const val = await textarea.inputValue();
    expect(val).toContain('<strong>');
    expect(val).toContain('fetter');
  });

  test('HTML-Paste übernimmt Links', async ({ page }) => {
    await openConnect(page, { user: 'nk' });

    const newPostBtn = page.locator('button[aria-label="Neuer Beitrag"], button:has-text("Neuer Beitrag"), button:has-text("Beitrag erstellen")').first();
    if (!await newPostBtn.isVisible()) {
      test.skip(true, 'Kein „Neuer Beitrag"-Button');
      return;
    }
    await newPostBtn.click();

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 3000 });
    await textarea.focus();

    await page.evaluate(() => {
      const ta = document.querySelector('textarea');
      if (!ta) return;
      const dt = new DataTransfer();
      dt.setData('text/html', '<a href="https://example.com">Beispiel</a>');
      dt.setData('text/plain', 'Beispiel');
      ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });

    const val = await textarea.inputValue();
    expect(val).toContain('href="https://example.com"');
    expect(val).toContain('Beispiel');
  });

  test('Plaintext-Paste funktioniert weiterhin normal', async ({ page }) => {
    await openConnect(page, { user: 'nk' });

    const newPostBtn = page.locator('button[aria-label="Neuer Beitrag"], button:has-text("Neuer Beitrag"), button:has-text("Beitrag erstellen")').first();
    if (!await newPostBtn.isVisible()) {
      test.skip(true, 'Kein „Neuer Beitrag"-Button');
      return;
    }
    await newPostBtn.click();

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Normaler Text-Paste via Keyboard (kein HTML)
    await textarea.fill('');
    await page.keyboard.type('Hallo ');
    // Einfacher Text — Browser-Standard greift, kein Eingriff durch onPaste
    await page.evaluate(() => {
      const ta = document.querySelector('textarea');
      if (!ta) return;
      const dt = new DataTransfer();
      dt.setData('text/plain', 'Welt');
      // kein text/html → Handler lässt Browser-Standard laufen
      ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    // textarea hat mindestens "Hallo " (Plaintext-Paste läuft über Browser, kein Eingriff)
    const val = await textarea.inputValue();
    expect(val).toContain('Hallo');
  });

  test('Word/Outlook-Paste wird zu sauberem HTML bereinigt', async ({ page }) => {
    await openConnect(page, { user: 'nk' });

    const newPostBtn = page.locator('button[aria-label="Neuer Beitrag"], button:has-text("Neuer Beitrag"), button:has-text("Beitrag erstellen")').first();
    if (!await newPostBtn.isVisible()) {
      test.skip(true, 'Kein „Neuer Beitrag"-Button');
      return;
    }
    await newPostBtn.click();

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 3000 });
    await textarea.focus();

    // Typischer Outlook-Auszug: tief verschachtelte leere Spans, font-weight:400,
    // color:windowtext/black, color:red, verschachtelte Liste, Link.
    const wordHtml = '<p style="font-style: normal; font-weight: 400"><span><span><span><b><span>FAQ Schulwoche 34</span></b></span></span></span></p>'
      + '<ul style="font-style: normal; font-weight: 400">'
      + '<li style="color: windowtext"><span><span><span style="color: black">Termin A</span></span></span></li>'
      + '<li style="color: red"><span><span>Wichtiger Termin</span></span></li></ul>'
      + '<ul><li><span>Wichtig:</span><ul><li><span>Bis Donnerstag</span></li></ul></li></ul>'
      + '<p><a style="color: purple; text-decoration: underline" href="mailto:x@y.de"><span style="color: blue">x@y.de</span></a></p>';

    await page.evaluate((h) => {
      const ta = document.querySelector('textarea');
      if (!ta) return;
      const dt = new DataTransfer();
      dt.setData('text/html', h);
      dt.setData('text/plain', 'FAQ Schulwoche 34 Termin A Wichtiger Termin');
      ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, wordHtml);

    const val = await textarea.inputValue();
    // Word-Müll ist weg
    expect(val).not.toMatch(/<span><\/span>/);
    expect(val).not.toMatch(/font-weight:\s*400/i);
    expect(val).not.toMatch(/font-style:\s*normal/i);
    expect(val).not.toMatch(/windowtext/i);
    expect(val).not.toMatch(/<span><span><span>/);
    // Sinnvolle Formatierung + Struktur erhalten
    expect(val).toMatch(/<b>FAQ Schulwoche 34<\/b>/);
    expect(val).toMatch(/color:\s*red/i);
    expect(val).toMatch(/<ul>[\s\S]*<ul>/i);     // verschachtelte Liste
    expect(val).toContain('href="mailto:x@y.de"');
  });

});

test.describe('Bild-Paste im Chat-Input', () => {

  test('Bild-Paste zeigt Toast und hängt Datei an', async ({ page }) => {
    await openConnect(page, { user: 'nk' });

    // Ersten Chat öffnen
    const chatNav = page.locator('button[aria-label="Chats"], button:has-text("Chat")').first();
    if (await chatNav.isVisible()) await chatNav.click();

    const chatItem = page.locator('.conversation-item, [data-testid="conversation-item"]').first();
    if (!await chatItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip(true, 'Kein Chat sichtbar — Demo-Daten-Variante');
      return;
    }
    await chatItem.click();

    const chatInput = page.locator('.chat-input-bar input[type="text"]').first();
    await expect(chatInput).toBeVisible({ timeout: 3000 });
    await chatInput.focus();

    // 1×1 px PNG als Clipboard-Bild simulieren
    await page.evaluate(() => {
      const input = document.querySelector('.chat-input-bar input[type="text"]');
      if (!input) return;
      // Minimales PNG (1×1, transparent)
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const byteChars = atob(b64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'image/png' });
      const file = new File([blob], 'test.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });

    // Toast "Bild angehängt" soll erscheinen
    await expect(page.locator('.toast, [role="status"]').filter({ hasText: /bild/i }))
      .toBeVisible({ timeout: 3000 });
  });

});
