import { test, expect, openConnect, waitForAppReady } from '../fixtures/connect';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * VIEWER-01 — „Zurück“ aus der Anhang-Vorschau (Connect 4.52.0)
 *
 * Anlass (Norbert, 02.10.2026, iPhone): Aus der Anhang-Vorschau kam man nur
 * über ein kleines ✕ zurück, das auf dem Handy in der zweiten Knopfzeile stand.
 *
 * Geprüft wird die neue Regel für beide Viewer (Datei-Viewer `.fv-*` und
 * Lightbox `.lightbox-*`): „‹ Zurück“ oben links, ✕ oben rechts, dazu am
 * Handy bei Bildern der Tipp neben das Bild. Außerdem: Dialog-Rolle, Fokus,
 * volle Breite am Handy.
 *
 * Gegenprobe gegen den Stand vor dem Sprint (ohne Git anzufassen):
 *   CONNECT_PATH=/_vor-viewer01.html npx playwright test \
 *     tests/connect/smoke-viewer-zurueck.spec.ts --project=connect
 * Erwartet dort rot: T1, T2, T4, T5, T6, T7, T9, T10, T11. Grün: T3, T8.
 */

const DESKTOP = { width: 1280, height: 800 };
const IPHONE = { width: 390, height: 844 };
const SE = { width: 320, height: 568 };

type Kind = 'img' | 'txt' | 'ppt';
type Rect = { x: number; y: number; w: number; h: number; r: number; b: number };

async function start(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await openConnect(page, { user: 'la' });
  await waitForAppReady(page);
}

/** Öffnet den Datei-Viewer direkt (derselbe Kern wie FileCard/AttachmentBlock). */
async function openViewer(page: Page, kinds: Kind[]) {
  await page.evaluate((list) => {
    const canvas = document.createElement('canvas');
    canvas.width = 200; canvas.height = 200;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#f59e0b'; g.fillRect(0, 0, 200, 200);
    const png = canvas.toDataURL('image/png');
    const make: Record<string, () => any> = {
      img: () => ({ url: png, name: 'urlaubsfoto.png', type: 'image/png', size: 1_900_000 }),
      txt: () => { const b = new Blob(['Kurzer Text'], { type: 'text/plain' }); return { url: URL.createObjectURL(b), name: 'notiz.txt', type: 'text/plain', size: b.size }; },
      ppt: () => { const b = new Blob(['x'], { type: 'application/vnd.ms-powerpoint' }); return { url: URL.createObjectURL(b), name: 'agenda.ppt', type: 'application/vnd.ms-powerpoint', size: b.size }; },
    };
    (window as any).openFileViewer(list.map((k) => make[k]()), 0);
  }, kinds);
  await expect(page.locator('.fv-overlay')).toBeVisible({ timeout: 4_000 });
}

async function rect(page: Page, selector: string): Promise<Rect | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom };
  }, selector);
}

const overlap = (a: Rect, b: Rect) => a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
const midY = (a: Rect) => a.y + a.h / 2;

test.describe('VIEWER-01 — Datei-Viewer: Zurück oben links, ✕ oben rechts', () => {
  test('T1 Rechner: Kopf in einer Zeile (Zurück, Titel, Aktionen, ✕), Fokus auf „Zurück“', async ({ page }) => {
    await start(page, DESKTOP);
    await openViewer(page, ['img', 'ppt']);

    const kinder = await page.evaluate(() => Array.from(document.querySelector('.fv-head')!.children).map((e) => e.className));
    expect(kinder).toEqual(['fv-btn fv-back', 'fv-title', 'fv-tools', 'fv-btn fv-close']);

    const back = (await rect(page, '.fv-back'))!, title = (await rect(page, '.fv-title'))!;
    const tools = (await rect(page, '.fv-tools'))!, close = (await rect(page, '.fv-close'))!;
    expect(Math.abs(midY(back) - midY(close))).toBeLessThan(4);
    expect(Math.abs(midY(back) - midY(tools))).toBeLessThan(4);
    expect(back.r).toBeLessThanOrEqual(title.x + 1);
    expect(title.r).toBeLessThanOrEqual(tools.x + 1);
    expect(tools.r).toBeLessThanOrEqual(close.x + 1);

    const zurueck = page.getByTestId('fv-back');
    await expect(zurueck).toHaveAccessibleName('Zurück');
    await expect(zurueck).toBeFocused();
  });

  test('T2 „Zurück“ schließt und gibt den Fokus an den Auslöser zurück', async ({ page }) => {
    await start(page, DESKTOP);
    await page.evaluate(() => {
      const t = Array.from(document.querySelectorAll<HTMLButtonElement>('.app-layout button')).find((e) => e.offsetWidth > 0 && !e.disabled)!;
      t.setAttribute('data-probe', 'ausloeser');
      t.focus();
    });
    const ausloeser = page.locator('[data-probe="ausloeser"]');
    await expect(ausloeser).toBeFocused();

    await openViewer(page, ['img']);
    await expect(page.getByTestId('fv-back')).toBeFocused();
    await page.getByTestId('fv-back').click();

    await expect(page.locator('.fv-overlay')).toHaveCount(0);
    await expect(ausloeser).toBeFocused();
    // Der Hintergrund darf nach dem Schließen nicht gesperrt bleiben.
    expect(await page.locator('[inert]').count()).toBe(0);
  });

  test('T3 ✕, Esc und der dunkle Rand schließen weiterhin', async ({ page }) => {
    await start(page, DESKTOP);
    const overlay = page.locator('.fv-overlay');

    await openViewer(page, ['img']);
    await overlay.getByRole('button', { name: 'Schließen' }).click();
    await expect(overlay).toHaveCount(0);

    await openViewer(page, ['img']);
    await page.keyboard.press('Escape');
    await expect(overlay).toHaveCount(0);

    await openViewer(page, ['img']);
    await page.mouse.click(6, 6); // dunkler Rand außerhalb der Box
    await expect(overlay).toHaveCount(0);
  });

  test('T4 Handy: „Zurück“ oben links, ✕ oben rechts, Aktionen in einer Zeile darunter (alle ≥ 44 px)', async ({ page }) => {
    await start(page, IPHONE);
    await openViewer(page, ['img', 'ppt']);

    const box = (await rect(page, '.fv-box'))!;
    const back = await rect(page, '.fv-back');
    const close = (await rect(page, '.fv-close'))!;
    expect(back, '„Zurück“-Knopf fehlt').not.toBeNull();
    expect(back!.x - box.x).toBeLessThanOrEqual(12);
    expect(back!.y - box.y).toBeLessThanOrEqual(12);
    expect(back!.w).toBeGreaterThanOrEqual(44);
    expect(back!.h).toBeGreaterThanOrEqual(44);
    expect(box.r - close.r).toBeLessThanOrEqual(12);
    expect(close.w).toBeGreaterThanOrEqual(44);
    expect(close.h).toBeGreaterThanOrEqual(44);
    expect(Math.abs(midY(back!) - midY(close))).toBeLessThan(4);

    const aktionen = await page.evaluate(() => Array.from(document.querySelectorAll('.fv-tools .fv-btn')).map((e) => {
      const r = e.getBoundingClientRect();
      return { y: Math.round(r.y), h: r.height };
    }));
    expect(aktionen.length).toBe(3); // Herunterladen, Weiterleiten, Neuer Tab
    expect(new Set(aktionen.map((a) => a.y)).size).toBe(1);
    for (const a of aktionen) expect(a.h).toBeGreaterThanOrEqual(44);
    expect(aktionen[0].y).toBeGreaterThanOrEqual(back!.b - 1);
  });

  test('T5 Handy: Vorschau nutzt die volle Breite, kein seitlicher Überlauf', async ({ page }) => {
    await start(page, IPHONE);
    await openViewer(page, ['img']);
    const box = (await rect(page, '.fv-box'))!;
    expect(Math.round(box.x)).toBe(0);
    expect(Math.round(box.w)).toBe(IPHONE.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('T6 320 px: kein Überlauf, nichts überlappt, Zähler sichtbar', async ({ page }) => {
    await start(page, SE);
    await openViewer(page, ['img', 'ppt']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const back = await rect(page, '.fv-back');
    expect(back, '„Zurück“-Knopf fehlt').not.toBeNull();
    const title = (await rect(page, '.fv-title'))!, close = (await rect(page, '.fv-close'))!;
    expect(overlap(back!, title)).toBe(false);
    expect(overlap(title, close)).toBe(false);
    expect(overlap(back!, close)).toBe(false);
    await expect(page.locator('.fv-count')).toBeVisible();
    await expect(page.locator('.fv-count')).toHaveText('(1/2)');
  });

  test('T7 Handy, Bild: Tipp neben das Bild schließt, Tipp auf das Bild nicht', async ({ page }) => {
    await start(page, IPHONE);
    await openViewer(page, ['img']);
    await expect(page.locator('.fv-img')).toBeVisible();

    await page.locator('.fv-img').click();
    await expect(page.locator('.fv-overlay')).toHaveCount(1);

    await page.locator('.fv-body').click({ position: { x: 8, y: 8 } });
    await expect(page.locator('.fv-overlay')).toHaveCount(0);
  });

  test('T8 Freie Fläche schließt NICHT bei Text (Handy) und nicht am Rechner', async ({ page }) => {
    await start(page, IPHONE);
    await openViewer(page, ['txt']);
    await expect(page.locator('.fv-text')).toBeVisible();
    const body = (await rect(page, '.fv-body'))!;
    await page.mouse.click(body.x + body.w / 2, body.b - 10);
    await expect(page.locator('.fv-overlay')).toHaveCount(1);
    await page.keyboard.press('Escape');

    await page.setViewportSize(DESKTOP);
    await openViewer(page, ['img']);
    await expect(page.locator('.fv-img')).toBeVisible();
    await page.locator('.fv-body').click({ position: { x: 8, y: 8 } });
    await expect(page.locator('.fv-overlay')).toHaveCount(1);
  });

  test('T9 Blättern hält den Fokus auf ›; „Zurück“ schließt die Vorschau ganz', async ({ page }) => {
    await start(page, DESKTOP);
    await openViewer(page, ['img', 'ppt']);
    await page.locator('.fv-navnext').click();

    await expect(page.locator('.fv-overlay')).toHaveCount(1);
    await expect(page.locator('.fv-count')).toHaveText('(2/2)');
    await expect(page.locator('.fv-navnext')).toBeFocused();

    await page.getByTestId('fv-back').click();
    await expect(page.locator('.fv-overlay')).toHaveCount(0);
  });

  for (const [name, viewport] of [['Handy', IPHONE], ['Rechner', DESKTOP]] as const) {
    test(`T10 ${name}: Dialog-Rolle, Fokus bleibt in der Vorschau, axe ohne kritische Verstöße`, async ({ page }) => {
      await start(page, viewport);
      await openViewer(page, ['img', 'ppt']);
      await expect(page.locator('.fv-img')).toBeVisible();

      const overlay = page.locator('.fv-overlay');
      await expect(overlay).toHaveAttribute('role', 'dialog');
      await expect(overlay).toHaveAttribute('aria-modal', 'true');
      await expect(overlay).toHaveAttribute('aria-label', /urlaubsfoto\.png/);
      await expect.poll(() => page.evaluate(() => {
        const trap = (window as any).__krsFocusTrap;
        return !!trap && trap.active === document.querySelector('.fv-overlay');
      })).toBe(true);

      // Tab darf die Vorschau nicht verlassen.
      for (let i = 0; i < 9; i++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => !!document.activeElement?.closest('.fv-overlay'))).toBe(true);
      }

      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
    });
  }
});

test.describe('VIEWER-01 — Lightbox: dieselbe Regel', () => {
  for (const [name, viewport] of [['390 px', IPHONE], ['320 px', SE]] as const) {
    test(`T11 ${name}: „Zurück“ oben links schließt, ✕ bleibt, nichts überlappt`, async ({ page }) => {
      await start(page, viewport);
      const openLightbox = () => page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 300; c.height = 200;
        c.getContext('2d')!.fillRect(0, 0, 300, 200);
        (window as any).openLightbox([{ url: c.toDataURL('image/png'), name: 'bild.png' }], 0);
      });

      await openLightbox();
      const lightbox = page.locator('.lightbox-overlay');
      await expect(lightbox).toBeVisible();

      const back = await rect(page, '[data-testid="lb-back"]');
      expect(back, '„Zurück“-Knopf fehlt').not.toBeNull();
      const close = (await rect(page, '.lightbox-close'))!;
      const hint = await rect(page, '.lightbox-zoomhint'); // nur beim ersten Öffnen der Sitzung
      expect(back!.x).toBeLessThanOrEqual(12);
      expect(back!.y).toBeLessThanOrEqual(12);
      expect(back!.h).toBeGreaterThanOrEqual(44);
      expect(close.w).toBeGreaterThanOrEqual(44);
      expect(close.h).toBeGreaterThanOrEqual(44);
      expect(overlap(back!, close)).toBe(false);
      expect(hint, 'Zoom-Hinweis sollte beim ersten Öffnen sichtbar sein').not.toBeNull();
      expect(overlap(back!, hint!)).toBe(false);
      expect(overlap(close, hint!)).toBe(false);

      await expect(page.getByTestId('lb-back')).toHaveAccessibleName('Zurück');
      await page.getByTestId('lb-back').click();
      await expect(lightbox).toHaveCount(0);

      await openLightbox();
      await page.locator('.lightbox-close').click();
      await expect(lightbox).toHaveCount(0);
    });
  }
});
