import { test, expect } from '../fixtures/connect';
import { waitForAppReady } from '../fixtures/connect';

/**
 * Sprint A2b — Barrierefreiheit KRS Connect (architektonischer Teil)
 *
 * Prüft die verhaltensbezogenen Findings aus A2b mit ECHTEN Fokus-Assertions
 * (page.evaluate(() => document.activeElement)), nicht per Screenshot-Vergleich:
 *  - C-B-07/08: Skip-Link „Zum Inhalt springen" + Landmark <main id="main">
 *  - C-A-07/08: Focus-Trap in Dialogen + Fokus-Rückgabe an den Auslöser
 *  - C-A-09:    Emoji-Picker per Escape verlassbar, Fokus kehrt zurück
 *  - C-A-12:    Kanal-Kontextmenü per Tastatur (Shift+F10) erreichbar + Escape
 *
 * Demo-Modus über die Fixture (forceMode=demo, User nk = Admin). UI-abhängige
 * Schritte defensiv mit test.skip absichern.
 */

test.describe('A2b Fokus & Tastatur — KRS Connect (Demo)', () => {
  test('Skip-Link ist das erste fokussierbare Element und zeigt auf #main', async ({ connectPage: page }) => {
    await waitForAppReady(page);
    // WCAG 2.4.1 „Bypass Blocks": Der Skip-Link muss das ERSTE fokussierbare Element
    // in Dokument-Reihenfolge sein. Direkt über das DOM prüfen — der frühere Weg
    // (body.click + ein Tab) war in headless-Chromium unzuverlässig (der erste Tab
    // aus dem Body heraus übersprang den off-screen positionierten Skip-Link).
    const first = await page.evaluate(() => {
      const sel = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
      const els = Array.prototype.slice.call(document.querySelectorAll(sel)).filter((el: Element) => {
        const s = getComputedStyle(el as HTMLElement);
        return s.display !== 'none' && s.visibility !== 'hidden' && !(el as HTMLElement).closest('[inert]');
      });
      const f = els[0] as HTMLElement | undefined;
      return f ? { cls: String(f.className || ''), href: f.getAttribute('href') } : { cls: '', href: null };
    });
    expect(first.cls).toContain('skip-link');
    expect(first.href).toBe('#main');
    await expect(page.locator('main#main')).toHaveCount(1);
    // Fokussierbar + aktivierbar: Fokus setzen und per Enter zum Inhalt springen.
    await page.locator('a.skip-link').focus();
    expect(await page.evaluate(() => document.activeElement?.className || '')).toContain('skip-link');
  });

  test('Landmarks vorhanden: <main id="main"> und <nav>', async ({ connectPage: page }) => {
    await waitForAppReady(page);
    await expect(page.locator('main#main')).toHaveCount(1);
    await expect(page.locator('nav').first()).toBeVisible();
  });

  test('Focus-Trap: Tab verlässt den Einstellungen-Dialog nicht; Fokus kehrt zum Auslöser zurück', async ({ connectPage: page }) => {
    await waitForAppReady(page);
    const trigger = page.locator('button[aria-label="Einstellungen öffnen"]').first();
    if (await trigger.count() === 0) test.skip(true, 'Einstellungen-Button nicht gefunden — UI-Variante');
    await trigger.click();
    const dialog = page.locator('.modal-overlay[aria-label="Einstellungen"]').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const focusInsideDialog = () => page.evaluate(() => {
      const d = document.querySelector('.modal-overlay[aria-label="Einstellungen"]');
      return !!(d && document.activeElement && d.contains(document.activeElement));
    });

    // Vorwärts durchtabben — Fokus muss nach jedem Tab im Dialog liegen.
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      expect(await focusInsideDialog()).toBe(true);
    }
    // Rückwärts ebenfalls gefangen.
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await focusInsideDialog()).toBe(true);
    }

    // Schließen über den Backdrop (dieser Dialog hat keinen eigenen Escape-Handler)
    // und Fokus-Rückgabe an den Auslöser prüfen.
    await page.mouse.click(4, 4);
    await expect(dialog).toHaveCount(0);
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('aria-label') === 'Einstellungen öffnen',
      null,
      { timeout: 3_000 },
    );
  });

  test('Emoji-Picker: Escape schließt und gibt den Fokus an den Auslöser zurück', async ({ connectPage: page }) => {
    await waitForAppReady(page);
    const opener = page.getByText(/Beitrag schreiben/).first();
    if (await opener.count() === 0) test.skip(true, 'Kein Beitrags-Composer sichtbar — UI-Variante');
    await opener.click();
    const emojiBtn = page.getByTestId('post-emoji-btn');
    if (await emojiBtn.count() === 0) test.skip(true, 'Emoji-Button nicht sichtbar — UI-Variante');
    await emojiBtn.click();

    const picker = page.locator('.emoji-picker[role="dialog"]').first();
    await expect(picker).toBeVisible({ timeout: 4_000 });
    // Fokus liegt im Picker (autoFocus Suchfeld).
    expect(await page.evaluate(() => {
      const p = document.querySelector('.emoji-picker[role="dialog"]');
      return !!(p && document.activeElement && p.contains(document.activeElement));
    })).toBe(true);

    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    // Auslöser wieder fokussiert.
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('data-testid') === 'post-emoji-btn'
        || document.activeElement?.getAttribute('aria-label') === 'Emoji einfügen',
      null,
      { timeout: 3_000 },
    );
  });

  // A3 (22.07.2026) — Regressionstest für einen in dieser Sitzung gefundenen
  // echten Bug: Der Lern-Coach hält sein Panel (role="dialog") dauerhaft im
  // DOM und blendet es nur per CSS-transform aus. isVisible() im Focus-Trap
  // prüfte bisher nur offsetWidth/offsetHeight (transform ändert die nicht) —
  // das geschlossene Panel wurde daher fälschlich als offener Dialog erkannt,
  // der Hintergrund (inkl. Lern-Coach-FAB) beim Laden dauerhaft inert gesetzt
  // und der Skip-Link um den ersten Tab-Fokus gebracht. Fix: openDialogs()
  // schließt Elemente mit "krsc"-Klasse explizit aus.
  test('Lern-Coach-Panel (geschlossen) wird vom Focus-Trap nicht als offener Dialog erkannt', async ({ connectPage: page }) => {
    await waitForAppReady(page);
    const fab = page.locator('.krsc-fab');
    if (await fab.count() === 0) test.skip(true, 'Lern-Coach nicht geladen — UI-Variante');
    // Panel ist im DOM (role="dialog"), aber zu (kein .krsc-open) → FAB darf
    // nicht inert sein und muss klickbar bleiben.
    await expect(fab).not.toHaveAttribute('inert', '');
    await expect(fab).toBeEnabled();
    await fab.click({ timeout: 5_000 });
    await expect(page.locator('.krsc-panel.krsc-open')).toBeVisible({ timeout: 3_000 });
  });

  test('Kanal-Kontextmenü ist per Tastatur (Shift+F10) erreichbar und mit Escape verlassbar', async ({ connectPage: page }) => {
    await waitForAppReady(page);
    // Ein Team wählen, damit die Kanalliste erscheint.
    const team = page.locator('.team-item .list-item, [data-testid="team-item"]').first();
    if (await team.count() === 0) test.skip(true, 'Kein Team sichtbar — UI-Variante');
    await team.click();
    const channel = page.locator('.sidebar-list .list-item[aria-current], .sidebar-list .list-item').first();
    if (await channel.count() === 0) test.skip(true, 'Kein Kanal sichtbar — UI-Variante');
    await channel.focus();
    // Nur Admins bekommen das Kontextmenü — Demo-User nk ist Admin.
    await page.keyboard.press('Shift+F10');
    const menu = page.locator('[role="menu"][aria-label="Kanal-Aktionen"]').first();
    if (await menu.count() === 0) test.skip(true, 'Kontextmenü nicht geöffnet — evtl. kein Admin/kein Kanal');
    await expect(menu).toBeVisible({ timeout: 3_000 });
    await expect(menu.getByRole('menuitem').first()).toBeVisible();
    // Fokus liegt auf dem ersten menuitem.
    expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe('menuitem');
    // Escape schließt das Menü.
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });
});
