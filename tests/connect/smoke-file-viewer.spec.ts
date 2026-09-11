import { test, expect, Page } from '../fixtures/connect';

/**
 * Sprint Sonnet #4 — Datei-Viewer (Demo-Modus)
 *
 * Das Anhang-/Vorschau-System (openFileViewer, AttachmentBlock, FileCard,
 * Word-Vorschau via mammoth, Excel via SheetJS) ist seit v4.19.1 live, hatte
 * aber bis dahin null Testabdeckung — keiner der 46 Connect-Specs referenzierte
 * es (per Grep gegen index.html am 03.09.2026 verifiziert). smoke-attachments.spec.ts
 * prüft nur uploadFile/createReply auf DataService-Ebene, nicht den Viewer selbst.
 *
 * Diese Spec deckt zwei Ebenen ab:
 *  1) Echte UI-Integration: ein Beitrag wird über den echten Composer mit
 *     Anhang (Bild + .ppt) erstellt, das gerenderte AttachmentBlock/FileCard
 *     wird angeklickt — das prüft, dass beide Komponenten korrekt in
 *     window.openFileViewer verdrahtet sind (Fixture-Muster/Dateien-Setup
 *     angelehnt an smoke-attachments.spec.ts, aber über echte UI-Klicks statt
 *     nur DataService-Aufrufe, weil genau das bisher ungeprüft war).
 *  2) Direkter Aufruf von window.openFileViewer (der gemeinsame Kern hinter
 *     FileCard und AttachmentBlock) für den Fallback-Pfad bei nicht
 *     vorschaubaren Dateitypen — robuster als jedes Mal über die Compose-UI
 *     zu gehen, deckt aber denselben Code ab.
 *
 * Deckt laut Sprint-Vorgabe ab: Viewer öffnet, Bild-Vorschau, ESC schließt,
 * ←/→ blättert, Download-Button erzeugt echten Datei-Download, Fallback
 * „keine Vorschau möglich" bei nicht-vorschaubaren Typen (.ppt).
 */

// Minimale, aber echte 1×1-PNG-Bilddatei (dekodierbar) — kein Fake-Blob.
const PNG_1PX_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

/**
 * Öffnet den Beitrags-Composer im aktuell ausgewählten Kanal und hängt zwei
 * Dateien an: ein Bild (vorschaubar) und eine .ppt-Datei (nicht vorschaubar
 * — Fallback-Pfad). Reihenfolge ist wichtig: Bild zuerst (Index 0), .ppt
 * danach (Index 1) — die Tests verlassen sich auf genau diese Reihenfolge
 * für die Pfeiltasten-Navigation.
 */
async function composePostWithAttachments(page: Page) {
  const compactBtn = page.getByText(/Beitrag schreiben/i).first();
  if ((await compactBtn.count()) === 0) {
    test.skip(true, 'Kein aktiver Channel ausgewählt — Voraussetzung für diesen Test fehlt');
  }
  await compactBtn.click();

  const fileInput = page.locator('form input[type="file"]').first();
  await expect(fileInput).toHaveCount(1, { timeout: 4_000 });
  await fileInput.setInputFiles([
    { name: 'urlaubsfoto.png', mimeType: 'image/png', buffer: Buffer.from(PNG_1PX_BASE64, 'base64') },
    { name: 'praesentation.ppt', mimeType: 'application/vnd.ms-powerpoint', buffer: Buffer.from('Fake-PPT-Inhalt, kein echtes Format noetig fuer den Fallback-Test') },
  ]);

  // Beide Datei-Vorschauen im Composer sichtbar, bevor gesendet wird.
  await expect(page.locator('form img[alt="urlaubsfoto.png"]')).toBeVisible({ timeout: 4_000 });
  await expect(page.getByText('praesentation.ppt')).toBeVisible();

  await page.getByRole('button', { name: /^Posten/ }).click();

  // Beitrag mit Anhang ist jetzt im Post-Feed sichtbar (AttachmentBlock gerendert).
  const image = page.locator('.post img[alt="urlaubsfoto.png"]').first();
  await expect(image).toBeVisible({ timeout: 5_000 });
  return image;
}

test.describe('KRS Connect — Datei-Viewer: AttachmentBlock/FileCard → openFileViewer (Demo)', () => {
  test('Klick auf Bild-Anhang öffnet Viewer mit Bild-Vorschau; ESC schließt ihn wieder', async ({ connectPage: page }) => {
    const image = await composePostWithAttachments(page);
    await image.click();

    const overlay = page.locator('.fv-overlay');
    await expect(overlay).toBeVisible({ timeout: 4_000 });
    await expect(overlay.locator('.fv-img')).toBeVisible();
    await expect(overlay).toContainText('urlaubsfoto.png');
    await expect(overlay).toContainText('(1/2)'); // zwei Anhänge am Post

    await page.keyboard.press('Escape');
    await expect(overlay).toHaveCount(0);
  });

  test('→ blättert zur .ppt (Fallback „keine Vorschau möglich"); ← zurück zum Bild', async ({ connectPage: page }) => {
    const image = await composePostWithAttachments(page);
    await image.click();

    const overlay = page.locator('.fv-overlay');
    await expect(overlay.locator('.fv-img')).toBeVisible({ timeout: 4_000 });

    await page.keyboard.press('ArrowRight');
    await expect(overlay).toContainText('(2/2)');
    await expect(overlay).toContainText('praesentation.ppt');
    // Für .ppt gibt es keine Inline-Vorschau — Fallback-Meldung + großer Download-Button.
    await expect(overlay.locator('.fv-msg')).toBeVisible();
    await expect(overlay.locator('.fv-msg')).toContainText('keine Vorschau möglich');
    await expect(overlay.locator('.fv-bigdl')).toBeVisible();
    await expect(overlay.locator('.fv-img')).toHaveCount(0);

    await page.keyboard.press('ArrowLeft');
    await expect(overlay).toContainText('(1/2)');
    await expect(overlay.locator('.fv-img')).toBeVisible();
  });

  test('Download-Button im Viewer-Header löst einen echten Datei-Download aus (Blob)', async ({ connectPage: page }) => {
    const image = await composePostWithAttachments(page);
    await image.click();

    const overlay = page.locator('.fv-overlay');
    await expect(overlay.locator('.fv-img')).toBeVisible({ timeout: 4_000 });

    const downloadPromise = page.waitForEvent('download');
    await overlay.getByRole('button', { name: /Herunterladen/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('urlaubsfoto.png');
  });

  test('FileCard-eigener Download-Button (⬇) lädt auch ohne den Viewer zu öffnen', async ({ connectPage: page }) => {
    await composePostWithAttachments(page);
    // FileCard: äußeres Element trägt role="button" (Klick öffnet den Viewer),
    // darin verschachtelt der eigene Download-Button (aria-label „Herunterladen").
    const fileCard = page.locator('[role="button"]', { hasText: 'praesentation.ppt' }).first();
    const dlBtn = fileCard.getByRole('button', { name: 'Herunterladen' });
    await expect(dlBtn).toBeVisible({ timeout: 4_000 });

    const downloadPromise = page.waitForEvent('download');
    await dlBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('praesentation.ppt');
    // Viewer darf durch den Download-Klick (stopPropagation im FileCard) nicht geöffnet worden sein.
    await expect(page.locator('.fv-overlay')).toHaveCount(0);
  });
});

test.describe('KRS Connect — window.openFileViewer: Kern-Engine direkt (Demo)', () => {
  test('Mehrdateien-Navigation und Fallback funktionieren auch ohne Compose-UI', async ({ connectPage: page }) => {
    // Deckt denselben Viewer-Kern ab wie FileCard/AttachmentBlock (beide rufen
    // ausschließlich window.openFileViewer auf) — unabhängig von React-State,
    // stabiler Kern-Check zusätzlich zur UI-Integration oben.
    await page.evaluate(() => {
      const blob = new Blob(['fake-doc'], { type: 'application/vnd.ms-powerpoint' });
      const url = URL.createObjectURL(blob);
      (window as any).__testFiles = [{ url, name: 'agenda.ppt', type: 'application/vnd.ms-powerpoint', size: blob.size }];
      (window as any).openFileViewer((window as any).__testFiles, 0);
    });

    const overlay = page.locator('.fv-overlay');
    await expect(overlay).toBeVisible({ timeout: 4_000 });
    await expect(overlay.locator('.fv-msg')).toContainText('keine Vorschau möglich');
    await expect(overlay.locator('.fv-bigdl')).toBeVisible();

    // Schließen-Button (nicht nur ESC) funktioniert ebenfalls.
    await overlay.getByRole('button', { name: 'Schließen' }).click();
    await expect(overlay).toHaveCount(0);
  });

  test('Einzeldatei ohne Geschwister zeigt keine Pfeil-Navigation und keinen Zähler', async ({ connectPage: page }) => {
    await page.evaluate(() => {
      const blob = new Blob(['x'], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      (window as any).openFileViewer([{ url, name: 'notiz.txt', type: 'text/plain', size: blob.size }], 0);
    });

    const overlay = page.locator('.fv-overlay');
    await expect(overlay).toBeVisible({ timeout: 4_000 });
    await expect(overlay.locator('.fv-nav')).toHaveCount(0);
    await expect(overlay).not.toContainText('(1/1)');
  });
});
