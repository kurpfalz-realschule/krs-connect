import { test, expect, openConnect } from '../fixtures/connect';
import type { Page } from '@playwright/test';

/**
 * #11 — Reaktionen auf Chat-Nachrichten
 *
 * Backend ist bereits generisch: reactions(target_type IN ('post','message'))
 * + RPC toggle_reaction. Daher KEINE Migration nötig — nur Frontend + Demo.
 */
test.describe('#11 Nachrichten-Reaktionen — DataService (Demo)', () => {
  test('toggle setzt/entfernt Reaktion, mehrere User zählen korrekt', async ({ page }) => {
    await openConnect(page, { user: 'la' });
    const r = await page.evaluate(async () => {
      const DS = (window as any).DataService;
      const ds = new DS(null);
      const MID = 987654;
      await ds.toggleReaction('message', MID, 1, '👍');
      const a1 = (await ds.getReactions('message', [MID])).get(MID) || [];
      await ds.toggleReaction('message', MID, 1, '👍'); // wieder weg
      const a2 = (await ds.getReactions('message', [MID])).get(MID) || [];
      await ds.toggleReaction('message', MID, 1, '❤️');
      await ds.toggleReaction('message', MID, 2, '❤️');
      const a3 = (await ds.getReactions('message', [MID])).get(MID) || [];
      const heart = a3.find((x: any) => x.emoji === '❤️');
      return {
        a1Count: a1.length, a1Emoji: a1[0]?.emoji, a1Users: a1[0]?.count,
        a2Count: a2.length,
        heartCount: heart?.count, heartUsers: heart?.users?.length,
      };
    });
    expect(r.a1Count).toBe(1);
    expect(r.a1Emoji).toBe('👍');
    expect(r.a1Users).toBe(1);
    expect(r.a2Count).toBe(0);     // Toggle entfernt die letzte Reaktion
    expect(r.heartCount).toBe(2);  // zwei verschiedene User
    expect(r.heartUsers).toBe(2);
  });
});

/**
 * 4.52.4 — „Reagieren“ sitzt in der Aktionsleiste der Nachricht.
 *
 * Vorher hing unter JEDER Blase eine gestrichelte „🙂﹢“-Pille in einer eigenen
 * Zeile. Jetzt: Maus → Leiste neben der Blase beim Überfahren; Touch → Symbol
 * in der Zeile unter der Nachricht. Eine Reaktionszeile gibt es nur noch, wenn
 * jemand reagiert hat; die Kärtchen hängen an der Unterkante der Blase.
 */
async function chatAmRechnerOeffnen(page: Page) {
  const chatNav = page.getByRole('button', { name: 'Chats' }).first();
  await expect(chatNav).toBeVisible({ timeout: 8_000 });
  await chatNav.click();
  await page.locator('.conversation-item').first().click();
  await expect(page.locator('.chat-msg').first()).toBeVisible({ timeout: 5_000 });
}

async function eigeneNachrichtSenden(page: Page, text: string) {
  const vorher = await page.locator('.chat-msg.own').count();
  const feld = page.locator('.chat-input-bar [contenteditable="true"]').first();
  await feld.click();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await expect(page.locator('.chat-msg.own')).toHaveCount(vorher + 1, { timeout: 5_000 });
}

async function reagieren(page: Page, nachricht: ReturnType<Page['locator']>, mitMaus: boolean) {
  if (mitMaus) await nachricht.hover();
  await nachricht.getByTestId('msg-react-btn').click();
  const picker = page.locator('.emoji-picker');
  await expect(picker).toBeVisible({ timeout: 4_000 });
  await picker.locator('.emoji-btn').first().click();
  await expect(nachricht.getByTestId('msg-reaction-chip').first()).toBeVisible({ timeout: 4_000 });
}

const rechteck = (loc: ReturnType<Page['locator']>) =>
  loc.evaluate((el: Element) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; });

test.describe('#11 Nachrichten-Reaktionen — UI (Demo, Maus)', () => {
  test('Reagieren-Button öffnet Picker und fügt eine Chip-Reaktion hinzu', async ({ connectPage: page }) => {
    await chatAmRechnerOeffnen(page);
    const erste = page.locator('.chat-msg').first();
    await reagieren(page, erste, true);
    await expect(erste).toHaveClass(/has-reactions/);
  });

  test('ohne Reaktion: keine Reaktionszeile, keine gestrichelte Pille, ein Reagieren-Knopf je Nachricht in der Leiste', async ({ connectPage: page }) => {
    await chatAmRechnerOeffnen(page);
    const anzahl = await page.locator('.chat-msg').count();
    expect(anzahl).toBeGreaterThan(0);
    await expect(page.getByTestId('chat-reactions')).toHaveCount(0);
    await expect(page.locator('.chat-msg.has-reactions')).toHaveCount(0);
    await expect(page.getByTestId('msg-react-btn')).toHaveCount(anzahl);
    await expect(page.locator('.chat-msg-actions [data-testid="msg-react-btn"]')).toHaveCount(anzahl);
    const stile = await page.getByTestId('msg-react-btn').first().evaluate((el: Element) => {
      const cs = getComputedStyle(el);
      return { border: cs.borderTopStyle, svg: !!el.querySelector('svg'), text: (el.textContent || '').trim() };
    });
    expect(stile.border).toBe('none');
    expect(stile.svg).toBe(true);
    expect(stile.text).toBe('');
  });

  test('Leiste erscheint erst beim Überfahren, steht neben der Blase und bleibt nach dem Reagieren nicht stehen', async ({ connectPage: page }) => {
    await chatAmRechnerOeffnen(page);
    await eigeneNachrichtSenden(page, 'Klar, mache ich.');
    const fremd = page.locator('.chat-msg.other').first();
    const eigen = page.locator('.chat-msg.own').last();

    for (const nachricht of [fremd, eigen]) {
      const leiste = nachricht.locator('.chat-msg-actions');
      await page.mouse.move(2, 2);
      await expect(leiste).toHaveCSS('opacity', '0');
      await nachricht.hover();
      await expect(leiste).toHaveCSS('opacity', '1');
    }

    // Neben der Blase, nicht darauf: fremde Nachricht rechts, eigene links.
    await fremd.hover();
    const bf = await rechteck(fremd.locator('.chat-bubble'));
    const lf = await rechteck(fremd.locator('.chat-msg-actions'));
    expect(lf.l).toBeGreaterThanOrEqual(bf.r);
    expect(lf.t).toBeGreaterThanOrEqual(bf.t - 1);
    expect(lf.b).toBeLessThanOrEqual(bf.b + 1);

    await eigen.hover();
    const be = await rechteck(eigen.locator('.chat-bubble'));
    const le = await rechteck(eigen.locator('.chat-msg-actions'));
    expect(le.r).toBeLessThanOrEqual(be.l);
    expect(le.l).toBeGreaterThanOrEqual(0);
    // Eigene Nachricht: Reagieren liegt an der Blase, Löschen am weitesten weg.
    const xReagieren = (await rechteck(eigen.getByTestId('msg-react-btn'))).l;
    const xLoeschen = (await rechteck(eigen.getByRole('button', { name: 'Nachricht löschen' }))).l;
    expect(xReagieren).toBeGreaterThan(xLoeschen);

    // Nach Klick + Emoji-Wahl behält der Knopf den Fokus. Die Leiste darf
    // deshalb nicht sichtbar stehen bleiben, wenn die Maus weg ist.
    await reagieren(page, eigen, true);
    await page.mouse.move(2, 2);
    await expect(eigen.locator('.chat-msg-actions')).toHaveCSS('opacity', '0');

    // Tastatur: Per Tab erreicht, wird die Leiste sichtbar.
    await fremd.getByTestId('msg-react-btn').focus();
    await page.keyboard.press('Tab');
    await expect(fremd.locator('.chat-msg-actions')).toHaveCSS('opacity', '1');
  });

  test('Kärtchen hängen an der Unterkante, überdecken die nächste Nachricht nicht, und ein Klick nimmt die eigene Reaktion zurück', async ({ connectPage: page }) => {
    await chatAmRechnerOeffnen(page);
    const erste = page.locator('.chat-msg').nth(0);
    const zweite = page.locator('.chat-msg').nth(1);
    if (await zweite.count() === 0) test.skip(true, 'Demo-Chat hat nur eine Nachricht');

    const hoeheVorher = (await rechteck(erste.locator('.chat-bubble'))).h;
    await reagieren(page, erste, true);
    await page.mouse.move(2, 2);

    const blase = await rechteck(erste.locator('.chat-bubble'));
    const chip = await rechteck(erste.getByTestId('msg-reaction-chip').first());
    const naechste = await rechteck(zweite.locator('.chat-bubble'));
    expect(Math.abs(blase.h - hoeheVorher)).toBeLessThanOrEqual(1); // Blase wird nicht höher
    expect(chip.t).toBeLessThan(blase.b);                            // ragt in die Blase …
    expect(chip.b).toBeGreaterThan(blase.b);                         // … und unten heraus
    expect(naechste.t).toBeGreaterThanOrEqual(chip.b);               // keine Überdeckung
    await expect(erste.getByTestId('msg-reaction-chip').first()).toHaveAttribute('aria-pressed', 'true');

    await erste.getByTestId('msg-reaction-chip').first().click();
    await expect(erste.getByTestId('chat-reactions')).toHaveCount(0);
    await expect(erste).not.toHaveClass(/has-reactions/);
  });
});

test.describe('#11 Nachrichten-Reaktionen — UI (Demo, Touch 390 px)', () => {
  test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });

  test('Reagieren steht ohne Überfahren unter der Nachricht, 44 px groß, nichts ragt aus dem Bild', async ({ connectPage: page }) => {
    const touch = await page.evaluate(() => matchMedia('(hover: none)').matches);
    test.skip(!touch, 'Dieser Browser meldet trotz Touch-Emulation einen Mauszeiger (hover: none trifft nicht)');

    await page.waitForTimeout(400);
    await page.locator('[data-testid="drawer-nav-chat"]').click();
    await page.locator('[data-testid="chat-open-list"]').click();
    await expect(page.locator('.conversation-item').first()).toBeVisible({ timeout: 5_000 });
    await page.locator('.conversation-item').first().evaluate((el: HTMLElement) => el.click());
    // Der Drawer bleibt nach der Chat-Wahl offen (bekannt, nicht Teil dieser Änderung).
    const overlay = page.locator('.mobile-overlay.visible');
    if (await overlay.count()) await overlay.first().evaluate((el: HTMLElement) => el.click());
    await expect(page.locator('.sidebar-content.mobile-open')).toHaveCount(0);
    await expect(page.locator('.chat-msg').first()).toBeVisible({ timeout: 5_000 });
    await eigeneNachrichtSenden(page, 'Ok');

    for (const nachricht of [page.locator('.chat-msg.other').first(), page.locator('.chat-msg.own').last()]) {
      await nachricht.scrollIntoViewIfNeeded();
      const leiste = nachricht.locator('.chat-msg-actions');
      await expect(leiste).toHaveCSS('opacity', '1');
      await expect(leiste).toHaveCSS('position', 'static');
      const blase = await rechteck(nachricht.locator('.chat-bubble'));
      for (const knopf of await leiste.locator('button').all()) {
        const k = await rechteck(knopf);
        expect(k.w).toBeGreaterThanOrEqual(44);
        expect(k.h).toBeGreaterThanOrEqual(44);
        expect(k.l).toBeGreaterThanOrEqual(blase.l - 1);
        expect(k.r).toBeLessThanOrEqual(blase.r + 1);
        expect(k.b).toBeLessThanOrEqual(blase.b + 1);
      }
    }

    const eigen = page.locator('.chat-msg.own').last();
    await reagieren(page, eigen, false);
    const chip = await rechteck(eigen.getByTestId('msg-reaction-chip').first());
    expect(chip.h).toBeGreaterThanOrEqual(32);
    expect(chip.w).toBeGreaterThanOrEqual(44);

    const ueberlauf = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(ueberlauf).toBeLessThanOrEqual(0);
  });
});
