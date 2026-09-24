import { test, expect } from '../fixtures/connect';

/**
 * Paket B (Connect 4.42.0) — Datenverlust stoppen + Tempo.
 * UI-Tests im Demo-Modus; Fehler werden simuliert, indem die DataService-Methode
 * auf dem Prototyp kurz durch eine fehlschlagende Variante ersetzt wird.
 */
async function failOn(page, method: string) {
  await page.evaluate((m) => {
    const P = (window as any).DataService.prototype;
    P['__orig_' + m] = P[m];
    P[m] = async function () { return null; };
  }, method);
}

async function createOwnPost(page, text: string) {
  const neu = page.getByRole('button', { name: /Neuer Beitrag|Beitrag schreiben|Neuen Beitrag/i }).first();
  await neu.click();
  const editor = page.locator('form [contenteditable="true"]').first();
  await editor.click();
  await editor.type(text);
  await page.locator('form button[type="submit"]').first().click();
  await expect(page.locator('.post', { hasText: text }).first()).toBeVisible({ timeout: 5_000 });
  return page.locator('.post', { hasText: text }).first();
}

test.describe('KRS Connect — Paket B (4.42.0)', () => {
  test('B1: Antwort-Fehler → Text bleibt im Feld', async ({ connectPage: page }) => {
    const knopf = page.locator('.post-footer button').first();
    await expect(knopf).toBeVisible({ timeout: 10_000 });
    await knopf.click();
    const editor = page.locator('.thread-panel [contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 5_000 });
    await failOn(page, 'createReply');
    await editor.click();
    await editor.type('Wichtige Rückfrage B1');
    await page.locator('.thread-panel button:has-text("Senden"), .thread-panel button[type="submit"]').first().click();
    await page.waitForTimeout(400);
    await expect(editor).toContainText('Wichtige Rückfrage B1');
  });

  test('B2: Bearbeiten-Fehler → Editor bleibt offen, Text bleibt', async ({ connectPage: page }) => {
    const own = await createOwnPost(page, 'Eigener Beitrag B2');
    const edit = own.locator('[aria-label="Post bearbeiten"]').first();
    await edit.dispatchEvent('click');
    await failOn(page, 'updatePost');
    const saveBtn = page.getByRole('button', { name: /^Speichern$/ }).first();
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });
    const editor = page.locator('.post [contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.press('End');
    await editor.type(' ergänzt B2');
    await saveBtn.click();
    await page.waitForTimeout(400);
    await expect(saveBtn).toBeVisible();
    await expect(editor).toContainText('ergänzt B2');
  });

  test('B3: „Abbrechen" im Composer fragt bei Text nach', async ({ connectPage: page }) => {
    const neu = page.getByRole('button', { name: /Neuer Beitrag|Beitrag schreiben|Neuen Beitrag/i }).first();
    test.skip(await neu.count() === 0, 'Composer-Knopf nicht gefunden');
    await neu.click();
    const editor = page.locator('form [contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 5_000 });
    await editor.click();
    await editor.type('Langer Text, der nicht verloren gehen darf');
    let dialogText = '';
    page.once('dialog', async d => { dialogText = d.message(); await d.dismiss(); });
    await page.locator('form button:has-text("Abbrechen")').first().click();
    await page.waitForTimeout(200);
    expect(dialogText).toMatch(/verwerfen/i);
    await expect(editor).toContainText('nicht verloren');   // abgelehnt → bleibt offen
  });

  test('B5: Tippen im Composer sanitisiert die Beiträge nicht erneut', async ({ connectPage: page }) => {
    const neu = page.getByRole('button', { name: /Neuer Beitrag|Beitrag schreiben|Neuen Beitrag/i }).first();
    test.skip(await neu.count() === 0, 'Composer-Knopf nicht gefunden');
    await expect(page.locator('.post-content').first()).toBeVisible({ timeout: 10_000 });
    await neu.click();
    const editor = page.locator('form [contenteditable="true"]').first();
    await editor.click();
    await editor.type('a');
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => ({ ...(window as any).__krsSanitizeStats }));
    await editor.type('bcdefghij');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ ...(window as any).__krsSanitizeStats }));
    expect(after.calls).toBeGreaterThan(before.calls);          // Liste rendert weiter …
    expect(after.misses - before.misses).toBeLessThanOrEqual(1); // … aber ohne neues DOMPurify
  });

  test('B6: Update-Check nutzt version.json (nicht die ganze index.html)', async ({ page }) => {
    const hits: string[] = [];
    await page.route('**/version.json*', async route => { hits.push('version.json'); await route.fulfill({ status: 200, contentType: 'application/json', body: '{"version":"9.9.9"}' }); });
    await page.route('**/index.html?_=*', async route => { hits.push('index.html'); await route.fulfill({ status: 200, body: "window.KRS_VERSION = '9.9.9';" }); });
    await page.goto('/index.html');      // Live-Modus-Boot (ohne forceMode) → UpdateBanner aktiv
    await expect.poll(() => hits.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(hits[0]).toBe('version.json');
    expect(hits).not.toContain('index.html');
  });

  test('B8: Realtime-Autor kommt aus dem Cache statt users-Abfrage', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const w = window as any;
      let calls = 0;
      const sb = { from: () => { calls++; return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 99 } }) }), order: async () => ({ data: [{ id: 7, display_name: 'X' }], error: null }) }) }; } };
      const ds = new w.DataService(null); ds.isDemo = false; ds.sb = sb;
      await ds.getUsers();                 // füllt Cache (1 Abfrage)
      const a = await ds._lookupUser(7);   // Cache-Treffer
      const b = await ds._lookupUser(99);  // Fehlschlag → 1 Abfrage
      const c = await ds._lookupUser(99);  // jetzt Cache
      return { calls, a: a && a.id, b: b && b.id, c: c && c.id };
    });
    expect(res).toEqual({ calls: 2, a: 7, b: 99, c: 99 });
  });

  test('B14: Lösch-Rückfrage nennt die Zahl der Antworten', async ({ connectPage: page }) => {
    const own = await createOwnPost(page, 'Eigener Beitrag B14');
    await own.locator('.post-actions-more').dispatchEvent('click');
    const menuDel = own.locator('.post-actions-popover button.danger');
    await expect(menuDel).toBeAttached({ timeout: 3_000 });
    let msg = '';
    page.once('dialog', async d => { msg = d.message(); await d.dismiss(); });
    await menuDel.dispatchEvent('click');
    await page.waitForTimeout(200);
    expect(msg).toMatch(/Beitrag wirklich l/);
    expect(msg).not.toMatch(/Antwort/);   // neuer Beitrag hat keine Antworten
  });
});
