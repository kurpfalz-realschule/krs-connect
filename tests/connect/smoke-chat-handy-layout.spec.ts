import { test, expect } from '../fixtures/connect';

/**
 * S17 (22.09.2026, P0, R18) — „chats immer noch nicht auf iphone lesbar wegen
 * halber bildschirm" (Norbert, wörtlich).
 *
 * Befund (siehe HANDOVER.md Abschnitt 0AF): `.app-layout` bekommt im
 * Mobil-Media-Query `flex-direction: column`, `.main` (das eigentliche
 * `<main>`-Element mit Team-/Chat-Inhalt) nicht — und blieb `flex-direction:
 * row`. Die Kopfzeile der Chat-Ansicht (`.mobile-view-header`) ist ein Kind
 * von `.main`, kippte dadurch zu einer senkrechten Spalte links (gemessen
 * 179 von 393 px), und der Chat quetschte sich auf den Rest. Nur die
 * Chat-Ansicht hat eine `.mobile-view-header` direkt in `.main` — Teams-Ansicht
 * hat keine, die Merkliste bringt ihren eigenen Spalten-Wrapper mit (eigenes
 * `flexDirection: 'column'` per Inline-Style, MerklisteView ist zudem das
 * EINZIGE Kind von `.main`, Zeilen-/Spaltenrichtung ist bei einem einzelnen
 * Flex-Kind ohnehin wirkungslos) — deshalb blieben beide von dem Fehler
 * unberührt und ein früherer Test (21.09.) konnte ihn nicht auslösen.
 *
 * Fix (eine Regel): `.main { flex-direction: column; min-width: 0; }` im
 * selben Mobil-Media-Query wie `.app-layout`.
 *
 * Aufgabe 4 (doppelte Namenszeile): Mit dem Fix steht der Name jetzt zweimal
 * (`.mobile-view-header` + `.chat-header`). Nur `.chat-header-name` wird
 * ausgeblendet — NICHT die ganze `.chat-header`, denn darin steckt bei
 * Gruppenchats „Mitglieder · verwalten" (data-testid group-members-btn) und
 * bei Einzelchats der Online-Punkt; beides bleibt auf dem Handy der einzige
 * Weg dorthin.
 */

test.describe('S17: Chat auf dem Handy — .main bekommt flex-direction: column (393 px)', () => {
  test.use({ viewport: { width: 393, height: 852 } });

  async function chatOeffnen(page) {
    // Demo-Zustand kurz setzen lassen (Posts/Conversations laden asynchron;
    // ohne diese Pause wurde .content vereinzelt mit Breite 0 gemessen).
    await page.waitForTimeout(400);
    await page.locator('[data-testid="drawer-nav-chat"]').click();
    await page.locator('[data-testid="chat-open-list"]').click();
    await expect(page.locator('.sidebar-content.mobile-open')).toHaveCount(1, { timeout: 5_000 });
    await expect(page.locator('.conversation-item').first()).toBeVisible({ timeout: 5_000 });
  }

  async function unterhaltungWaehlen(page, filterText?: string) {
    const loc = filterText
      ? page.locator('.conversation-item').filter({ hasText: filterText })
      : page.locator('.conversation-item').first();
    // Fixed-Drawer: Playwright-Click meldet oft „outside of the viewport".
    await loc.first().evaluate((el: HTMLElement) => el.click());
  }

  test('a–d) Chat-Ansicht steht gerade: volle Breite, normale Eingabezeile, kein Überlauf', async ({ connectPage: page }) => {
    await chatOeffnen(page);
    await unterhaltungWaehlen(page);

    const m = await page.evaluate(() => {
      const rect = (el: Element | null) => el ? el.getBoundingClientRect() : null;
      return {
        chatPanel: rect(document.querySelector('.chat-panel')),
        chatInputBar: rect(document.querySelector('.chat-input-bar')),
        mobileViewHeader: rect(document.querySelector('.mobile-view-header')),
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    });

    // a) .chat-panel beginnt bei x=0 und ist so breit wie innerWidth
    expect(m.chatPanel!.x).toBeLessThan(1);
    expect(Math.abs(m.chatPanel!.width - m.innerWidth)).toBeLessThan(2);
    // b) .chat-input-bar breiter als 300px UND flacher als 200px (beides
    // zusammen, sonst ließe die reine Breitenprüfung den senkrechten Kollaps durch)
    expect(m.chatInputBar!.width).toBeGreaterThan(300);
    expect(m.chatInputBar!.height).toBeLessThan(200);
    // c) .mobile-view-header ist breiter als hoch (Zeile, keine Spalte)
    expect(m.mobileViewHeader!.width).toBeGreaterThan(m.mobileViewHeader!.height);
    // d) kein waagerechter Überlauf
    expect(m.scrollWidth).toBeLessThanOrEqual(m.innerWidth);
  });

  test('Aufgabe 4: doppelte Namenszeile — nur der Name ist ausgeblendet, „Mitglieder · verwalten" bleibt (Gruppenchat)', async ({ connectPage: page }) => {
    await chatOeffnen(page);
    await unterhaltungWaehlen(page, 'Musik-Fachschaft');

    const info = await page.evaluate(() => {
      const name = document.querySelector('.chat-header-name');
      const gmb = document.querySelector('[data-testid="group-members-btn"]') as HTMLElement | null;
      return {
        nameHidden: name ? getComputedStyle(name).display === 'none' : null,
        membersBtnVisible: !!gmb && getComputedStyle(gmb).display !== 'none' && gmb.offsetParent !== null,
      };
    });
    expect(info.nameHidden).toBe(true);
    expect(info.membersBtnVisible).toBe(true);
  });

  test('Gegenprobe Aufgabe 2: Teams-Ansicht bei 393 px unverändert (volle Breite)', async ({ connectPage: page }) => {
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => {
      const rect = document.querySelector('.content')!.getBoundingClientRect();
      return { x: rect.x, width: rect.width, innerWidth: window.innerWidth };
    });
    expect(info.x).toBeLessThan(1);
    expect(Math.abs(info.width - info.innerWidth)).toBeLessThan(2);
  });

  test('Gegenprobe Aufgabe 2: Merkliste bei 393 px unverändert (eigener Spalten-Wrapper)', async ({ connectPage: page }) => {
    await chatOeffnen(page);
    await page.locator('.saved-section-btn').click();
    await page.waitForTimeout(300);
    const info = await page.evaluate(() => {
      // MerklisteView ist das einzige Kind von <main id="main"> — eigener
      // Inline-flexDirection:'column', unabhängig von .main.
      const rect = document.querySelector('#main > div')!.getBoundingClientRect();
      return { x: rect.x, width: rect.width, innerWidth: window.innerWidth };
    });
    expect(info.x).toBeLessThan(1);
    expect(Math.abs(info.width - info.innerWidth)).toBeLessThan(2);
  });
});

test.describe('S17: Gegenprobe Aufgabe 3 — Rechner/iPad quer behalten Zeilenrichtung', () => {
  test('e) 1280 px: Teams-Spalte und Inhalt liegen nebeneinander (gleiches y, verschiedenes x)', async ({ connectPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => {
      const sc = document.querySelector('.sidebar-content')!.getBoundingClientRect();
      const content = document.querySelector('.content')!.getBoundingClientRect();
      return { scY: sc.y, contentY: content.y, scX: sc.x, contentX: content.x };
    });
    expect(info.scY).toBe(info.contentY);
    expect(info.scX).not.toBe(info.contentX);
  });

  test('1024 px quer (Landschaft): .main bleibt row, Seitenleiste und Inhalt nebeneinander', async ({ connectPage: page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => {
      const main = document.querySelector('.main')!;
      const sc = document.querySelector('.sidebar-content')!.getBoundingClientRect();
      const content = document.querySelector('.content')!.getBoundingClientRect();
      return { mainFlexDir: getComputedStyle(main).flexDirection, scY: sc.y, contentY: content.y };
    });
    expect(info.mainFlexDir).toBe('row');
    expect(info.scY).toBe(info.contentY);
  });
});

test.describe('S17 Aufgabe 6: zusätzliche Handy-Breiten (iPhone SE / Pro Max)', () => {
  for (const width of [320, 430]) {
    test(`${width} px: Eingabezeile > 250px breit, kein waagerechter Überlauf`, async ({ connectPage: page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(400);
      await page.locator('[data-testid="drawer-nav-chat"]').click();
      await page.locator('[data-testid="chat-open-list"]').click();
      await expect(page.locator('.sidebar-content.mobile-open')).toHaveCount(1, { timeout: 5_000 });
      await expect(page.locator('.conversation-item').first()).toBeVisible({ timeout: 5_000 });
      await page.locator('.conversation-item').first().evaluate((el: HTMLElement) => el.click());

      const m = await page.evaluate(() => ({
        cibWidth: document.querySelector('.chat-input-bar')!.getBoundingClientRect().width,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(m.cibWidth).toBeGreaterThan(250);
      expect(m.scrollWidth).toBeLessThanOrEqual(m.innerWidth);
    });
  }
});
