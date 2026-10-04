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
 * 4.53.1 — Auf Touch-Geräten erscheint die Aktionsleiste erst nach Tipp oder
 * langem Druck auf die Nachricht (in 4.52.4 stand sie dort dauerhaft in jeder
 * Blase). iPad: neben der Blase wie am Rechner. Handy: über der Nachricht.
 * Alle vier Symbole sind SVG-Linien-Symbole.
 *
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
  if (mitMaus) {
    await nachricht.hover();
    await nachricht.getByTestId('msg-react-btn').click();
  } else {
    await nachricht.locator('.chat-bubble').tap({ position: { x: 20, y: 12 } });
    await expect(nachricht.getByTestId('chat-msg-actions')).toHaveClass(/is-selected/);
    await nachricht.getByTestId('msg-react-btn').tap();
  }
  const picker = page.locator('.emoji-picker');
  await expect(picker).toBeVisible({ timeout: 4_000 });
  if (mitMaus) await picker.locator('.emoji-btn').first().click();
  else await picker.locator('.emoji-btn').first().tap();
  await expect(nachricht.getByTestId('msg-reaction-chip').first()).toBeVisible({ timeout: 4_000 });
}

/** Öffnet den ersten Chat, egal ob Spalten-Layout (Rechner, iPad quer) oder Drawer (Handy, iPad hoch). */
async function chatOeffnen(page: Page) {
  await page.waitForTimeout(400);
  const drawerNav = page.locator('[data-testid="drawer-nav-chat"]');
  if (await drawerNav.isVisible()) {
    await drawerNav.click();
    await page.locator('[data-testid="chat-open-list"]').click();
    await expect(page.locator('.conversation-item').first()).toBeVisible({ timeout: 5_000 });
    await page.locator('.conversation-item').first().evaluate((el: HTMLElement) => el.click());
    // Der Drawer bleibt nach der Chat-Wahl offen (bekannt, nicht Teil dieser Änderung).
    const overlay = page.locator('.mobile-overlay.visible');
    if (await overlay.count()) await overlay.first().evaluate((el: HTMLElement) => el.click());
    await expect(page.locator('.sidebar-content.mobile-open')).toHaveCount(0);
  } else {
    await page.getByRole('button', { name: 'Chats' }).first().click();
    await page.locator('.conversation-item').first().click();
  }
  await expect(page.locator('.chat-msg').first()).toBeVisible({ timeout: 5_000 });
}

/** Finger auflegen, halten, abheben — über CDP, weil Playwright nur den kurzen Tipp kennt. */
async function fingerHalten(page: Page, x: number, y: number, ms: number, wischenUm = 0) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  if (wischenUm) {
    await page.waitForTimeout(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + wischenUm }] });
  }
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
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

    // 4.53.1: alle Knöpfe der Leiste sind Linien-Symbole, keine Emoji-Glyphen.
    await eigeneNachrichtSenden(page, 'Symbole prüfen');
    const knoepfe = await page.locator('.chat-msg.own').last().locator('.chat-msg-actions button').evaluateAll(
      (els: Element[]) => els.map(el => ({ svg: !!el.querySelector('svg'), text: (el.textContent || '').trim(), name: el.getAttribute('aria-label') })));
    expect(knoepfe.map(k => k.name)).toEqual(['Auf Nachricht reagieren', 'Auf Nachricht antworten', 'Nachricht bearbeiten', 'Nachricht löschen']);
    for (const k of knoepfe) { expect(k.svg).toBe(true); expect(k.text).toBe(''); }

    // Unsichtbar nimmt die Leiste keine Klicks an; ein Mausklick in die Blase
    // wählt die Nachricht nicht aus (Auswahl per Tipp gibt es nur auf Touch).
    await page.mouse.move(2, 2);
    const leiste = page.locator('.chat-msg.other').first().locator('.chat-msg-actions');
    await expect(leiste).toHaveCSS('pointer-events', 'none');
    await page.locator('.chat-msg.other').first().locator('.chat-bubble').click({ position: { x: 20, y: 12 } });
    await expect(page.locator('.chat-msg-actions.is-selected')).toHaveCount(0);
    await expect(page.getByTestId('chat-tap-hint')).toBeHidden();
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

  test.beforeEach(async ({ connectPage: page }) => {
    const touch = await page.evaluate(() => matchMedia('(hover: none)').matches);
    test.skip(!touch, 'Dieser Browser meldet trotz Touch-Emulation einen Mauszeiger (hover: none trifft nicht)');
    await chatOeffnen(page);
    await eigeneNachrichtSenden(page, 'Ok');
  });

  test('in Ruhe keine Leiste; Tipp zeigt sie an der Nachricht, 44 px groß und im Bild; Tipp daneben schließt sie', async ({ connectPage: page }) => {
    const hinweis = page.getByTestId('chat-tap-hint');
    await expect(hinweis).toBeVisible();

    // In Ruhe: keine Leiste sichtbar oder antippbar, keine Symbole in der Blase.
    const ruhe = await page.locator('.chat-msg-actions').evaluateAll((els: Element[]) =>
      els.map(el => { const cs = getComputedStyle(el); return cs.opacity + '|' + cs.pointerEvents + '|' + cs.position; }));
    expect(ruhe.length).toBeGreaterThan(0);
    for (const r of ruhe) expect(r).toBe('0|none|absolute');

    const eigen = page.locator('.chat-msg.own').last();
    const fremd = page.locator('.chat-msg.other').last();
    const leiste = eigen.getByTestId('chat-msg-actions');

    await eigen.locator('.chat-bubble').tap({ position: { x: 20, y: 12 } });
    await expect(leiste).toHaveClass(/is-selected/);
    await expect(leiste).toHaveCSS('opacity', '1');
    await expect(leiste).toHaveCSS('pointer-events', 'auto');
    await expect(eigen).toHaveClass(/is-selected/);
    await expect(hinweis).toBeHidden();   // Hinweis verschwindet nach dem ersten Tipp

    const blase = await rechteck(eigen.locator('.chat-bubble'));
    const l = await rechteck(leiste);
    expect(l.l).toBeGreaterThanOrEqual(0);
    expect(l.r).toBeLessThanOrEqual(390);
    const spalte = await rechteck(page.locator('.chat-messages'));
    expect(l.t).toBeGreaterThanOrEqual(spalte.t);          // nicht oben abgeschnitten
    expect(l.b).toBeLessThanOrEqual(spalte.b);             // nicht unten abgeschnitten
    // Über der Blase (Normalfall) oder darunter (oberste sichtbare Nachricht), nie mitten darauf.
    expect(l.b <= blase.t + 8 || l.t >= blase.b - 8).toBe(true);
    for (const knopf of await leiste.locator('button').all()) {
      const k = await rechteck(knopf);
      expect(k.w).toBeGreaterThanOrEqual(44);
      expect(k.h).toBeGreaterThanOrEqual(44);
    }

    // Zweiter Tipp auf dieselbe Nachricht schließt.
    await eigen.locator('.chat-bubble').tap({ position: { x: 20, y: 12 } });
    await expect(page.locator('.chat-msg-actions.is-selected')).toHaveCount(0);

    // Tipp auf eine andere Nachricht wechselt die Auswahl (nie zwei Leisten).
    await eigen.locator('.chat-bubble').tap({ position: { x: 20, y: 12 } });
    await fremd.locator('.chat-bubble').tap({ position: { x: 20, y: 12 } });
    await expect(page.locator('.chat-msg-actions.is-selected')).toHaveCount(1);
    await expect(fremd.getByTestId('chat-msg-actions')).toHaveClass(/is-selected/);

    // Tipp daneben schließt.
    await page.locator('.chat-input-bar').tap({ position: { x: 5, y: 5 } });
    await expect(page.locator('.chat-msg-actions.is-selected')).toHaveCount(0);

    const ueberlauf = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(ueberlauf).toBeLessThanOrEqual(0);
  });

  test('Reagieren über die Leiste; Tipp auf das Kärtchen nimmt die Reaktion zurück, ohne die Nachricht auszuwählen', async ({ connectPage: page }) => {
    const eigen = page.locator('.chat-msg.own').last();
    await reagieren(page, eigen, false);
    await expect(page.locator('.chat-msg-actions.is-selected')).toHaveCount(0);   // Leiste ist nach der Wahl wieder zu
    const chip = eigen.getByTestId('msg-reaction-chip').first();
    const c = await rechteck(chip);
    expect(c.h).toBeGreaterThanOrEqual(32);
    expect(c.w).toBeGreaterThanOrEqual(44);
    await chip.tap();
    await expect(eigen.getByTestId('chat-reactions')).toHaveCount(0);
    await expect(page.locator('.chat-msg-actions.is-selected')).toHaveCount(0);
  });

  test('Nachricht höher als der Bildschirm: Die Leiste erscheint beim Finger und bleibt im sichtbaren Bereich', async ({ connectPage: page }) => {
    const satz = 'Diese Nachricht ist absichtlich sehr lang, damit die Blase höher wird als der sichtbare Bereich der Liste. ';
    await eigeneNachrichtSenden(page, satz.repeat(14));
    // Nach dem Senden rollt die Liste weich ans Ende (scrollIntoView, smooth).
    // Erst messen und tippen, wenn sie dort ruht — sonst trifft der Tipp noch
    // die alte Stelle. „Ruht“ = Ende im Bild (bis auf den Innenabstand) und
    // zwei Messungen hintereinander dieselbe Position.
    let letzte = -1;
    await expect.poll(async () => {
      const m = await page.locator('.chat-messages').evaluate((el: Element) =>
        ({ top: Math.round(el.scrollTop), rest: Math.round(el.scrollHeight - el.clientHeight - el.scrollTop) }));
      const ruht = m.rest <= 24 && m.top === letzte;
      letzte = m.top;
      return ruht;
    }, { intervals: [150, 150, 150, 200, 250, 300] }).toBe(true);
    const eigen = page.locator('.chat-msg.own').last();
    const spalte = await rechteck(page.locator('.chat-messages'));
    const blase = await rechteck(eigen.locator('.chat-bubble'));
    expect(blase.h).toBeGreaterThan(spalte.h);   // Voraussetzung des Tests

    // Mitten in den sichtbaren Teil tippen (Viewport-Koordinaten).
    const tx = Math.round(blase.l + 30);
    const ty = Math.round(spalte.t + spalte.h * 0.6);
    await page.touchscreen.tap(tx, ty);
    const leiste = eigen.getByTestId('chat-msg-actions');
    await expect(leiste).toHaveClass(/is-selected/);
    const l = await rechteck(leiste);
    expect(l.t).toBeGreaterThanOrEqual(spalte.t);
    expect(l.b).toBeLessThanOrEqual(spalte.b);
    expect(l.b).toBeLessThanOrEqual(ty);          // über dem Finger, verdeckt die Tippstelle nicht
    expect(ty - l.b).toBeLessThan(60);            // und nahe dabei

    // Tipp auf eine freie Fläche der Liste (kein antippbares Element) schließt.
    const frei = await page.evaluate(() => {
      const box = document.querySelector('.chat-messages')!.getBoundingClientRect();
      const el = document.elementFromPoint(box.left + 6, box.top + box.height / 2) as HTMLElement | null;
      return { x: box.left + 6, y: box.top + box.height / 2, cls: el ? el.className : '' };
    });
    expect(String(frei.cls)).toContain('chat-messages');
    await page.touchscreen.tap(frei.x, frei.y);
    await expect(page.locator('.chat-msg-actions.is-selected')).toHaveCount(0);
  });

  test('langer Druck zeigt die Leiste; Wischen (Scrollen) zeigt sie nicht', async ({ connectPage: page }) => {
    const eigen = page.locator('.chat-msg.own').last();
    const b = await rechteck(eigen.locator('.chat-bubble'));

    await fingerHalten(page, b.l + 20, b.t + 12, 700, 40);   // 40 px gewischt
    await expect(page.locator('.chat-msg-actions.is-selected')).toHaveCount(0);

    const b2 = await rechteck(eigen.locator('.chat-bubble'));
    await fingerHalten(page, b2.l + 20, b2.t + 12, 700);
    await expect(eigen.getByTestId('chat-msg-actions')).toHaveClass(/is-selected/);
    // Das Abheben nach dem langen Druck darf die Auswahl nicht wieder aufheben.
    await page.waitForTimeout(300);
    await expect(eigen.getByTestId('chat-msg-actions')).toHaveClass(/is-selected/);
  });
});

test.describe('#11 Nachrichten-Reaktionen — UI (Demo, Touch iPad quer 1180 px)', () => {
  test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true });

  test('Tipp zeigt die Leiste neben der Blase und innerhalb der Chat-Spalte', async ({ connectPage: page }) => {
    const touch = await page.evaluate(() => matchMedia('(hover: none)').matches);
    test.skip(!touch, 'Dieser Browser meldet trotz Touch-Emulation einen Mauszeiger (hover: none trifft nicht)');
    await chatOeffnen(page);
    await eigeneNachrichtSenden(page, 'Das ist eine lange eigene Nachricht, die sicher über mehrere Zeilen läuft und die Blase bis an die größte erlaubte Breite bringt, damit links daneben am wenigsten Platz für die Leiste bleibt. Noch ein Satz, damit sie wirklich umbricht und hoch genug wird.');
    const spalte = await rechteck(page.locator('.chat-messages'));

    const eigen = page.locator('.chat-msg.own').last();
    await eigen.locator('.chat-bubble').tap({ position: { x: 40, y: 30 } });
    const le = eigen.getByTestId('chat-msg-actions');
    await expect(le).toHaveClass(/is-selected/);
    const be = await rechteck(eigen.locator('.chat-bubble'));
    const re = await rechteck(le);
    expect(re.r).toBeLessThanOrEqual(be.l);            // links neben der eigenen Blase
    expect(re.l).toBeGreaterThanOrEqual(spalte.l);     // nicht aus der Spalte
    expect(re.t).toBeGreaterThanOrEqual(be.t - 1);     // auf Höhe der Blase
    expect(re.b).toBeLessThanOrEqual(be.b + 1);
    expect(await le.locator('button').count()).toBe(4);
    for (const knopf of await le.locator('button').all()) {
      const k = await rechteck(knopf);
      expect(k.w).toBeGreaterThanOrEqual(44);
      expect(k.h).toBeGreaterThanOrEqual(44);
    }

    const fremd = page.locator('.chat-msg.other').first();
    await fremd.locator('.chat-bubble').tap({ position: { x: 20, y: 12 } });
    const lf = fremd.getByTestId('chat-msg-actions');
    await expect(lf).toHaveClass(/is-selected/);
    await expect(page.locator('.chat-msg-actions.is-selected')).toHaveCount(1);
    const bf = await rechteck(fremd.locator('.chat-bubble'));
    const rf = await rechteck(lf);
    expect(rf.l).toBeGreaterThanOrEqual(bf.r);          // rechts neben der fremden Blase
    expect(rf.r).toBeLessThanOrEqual(spalte.r);

    // Antworten über die Leiste setzt den Bezug und schließt die Leiste.
    await fremd.getByTestId('chat-reply-btn').tap();
    await expect(page.locator('.chat-reply-bar')).toBeVisible();
    await expect(page.locator('.chat-msg-actions.is-selected')).toHaveCount(0);
  });
});
