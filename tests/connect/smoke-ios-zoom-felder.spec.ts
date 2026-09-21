import { test, expect, openConnect } from '../fixtures/connect';

/**
 * v4.29.0 — iOS-Auto-Zoom verhindern (die verrutschten Ränder)
 *
 * Rückmeldung Norbert, 21.09.2026 (iPhone-Screenshots): Überschriften und Tabs
 * waren links angeschnitten, die Seite ließ sich seitlich zurechtschieben.
 * Ursache: iOS Safari zoomt die ganze Seite hinein, sobald ein Textfeld mit
 * weniger als 16px Schrift den Fokus bekommt — danach bleibt die Ansicht
 * verschoben. Die frühere Einzelregel zielte auf `.chat-input-bar textarea`,
 * dort steht aber ein <input>: sie griff nie.
 */
const KEIN_TEXTFELD = ['checkbox', 'radio', 'range', 'color', 'submit', 'button', 'file', 'hidden'];


test.describe('Keine Felder unter 16px auf dem Handy (Demo)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Hauptansicht: alle Textfelder mindestens 16px', async ({ connectPage: page }) => {
    await expect(page.locator('.app-layout, aside').first()).toBeVisible({ timeout: 8_000 });
    const klein = await page.evaluate((kein) => {
      const out: any[] = [];
      document.querySelectorAll('input,textarea,select,[contenteditable="true"],.rich-editor').forEach((el: any) => {
        const typ = (el.getAttribute('type') || '').toLowerCase();
        if (kein.includes(typ)) return;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 16) out.push({ tag: el.tagName, typ, klasse: String(el.className).slice(0, 40), fs });
      });
      return out;
    }, KEIN_TEXTFELD);
    expect(klein, 'Felder unter 16px lösen auf iOS den Auto-Zoom aus: ' + JSON.stringify(klein)).toEqual([]);
  });

  test('Dialog „Neues Team": auch dort keine Felder unter 16px', async ({ connectPage: page }) => {
    await page.locator('.mobile-menu-btn').first().click();
    const plus = page.getByRole('button', { name: 'Neues Team erstellen' }).first();
    await plus.click();
    await expect(page.locator('input, textarea').first()).toBeVisible({ timeout: 8_000 });
    const klein = await page.evaluate((kein) => {
      const out: any[] = [];
      document.querySelectorAll('input,textarea,select,[contenteditable="true"],.rich-editor').forEach((el: any) => {
        const typ = (el.getAttribute('type') || '').toLowerCase();
        if (kein.includes(typ)) return;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 16) out.push({ tag: el.tagName, typ, klasse: String(el.className).slice(0, 40), fs });
      });
      return out;
    }, KEIN_TEXTFELD);
    expect(klein, 'Felder unter 16px im Dialog: ' + JSON.stringify(klein)).toEqual([]);
  });

  test('Seite ist nicht breiter als der Bildschirm', async ({ connectPage: page }) => {
    await expect(page.locator('.app-layout, aside').first()).toBeVisible({ timeout: 8_000 });
    const mass = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      sichtbar: document.documentElement.clientWidth,
    }));
    expect(mass.scroll).toBeLessThanOrEqual(mass.sichtbar);
  });
});

test.describe('Viewport-Meta (Demo)', () => {
  test('meta viewport enthält viewport-fit=cover (Notch-Ränder)', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    const inhalt = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(inhalt).toContain('viewport-fit=cover');
    // Zoomen bleibt erlaubt (WCAG 1.4.4) — kein user-scalable=no, kein maximum-scale.
    expect(inhalt).not.toContain('user-scalable=no');
    expect(inhalt).not.toContain('maximum-scale');
  });
});
