import { test, expect, openConnect, waitForAppReady, CONNECT_PATH } from '../fixtures/connect';
import type { Page, Frame } from '@playwright/test';

/**
 * VIEWER-02 — „↗ Neuer Tab“ in der Anhang-Vorschau (Connect 4.52.1)
 *
 * Anlass (Norbert, 02.10.2026):
 *   1. iPhone, Hub-App: Ein Tipp auf „↗ Neuer Tab“ zeigte nur „Popup blockiert —
 *      Datei konnte nicht in neuem Tab geöffnet werden.“
 *   2. Browser: Es öffnete sich nur ein leerer Tab.
 *
 * Der Knopf reserviert im Klick ein leeres Fenster (window.open('')) und reicht
 * die signierte Adresse nach. Das scheiterte an zwei Stellen:
 *   1. In der iOS-App (WKWebView) gibt es kein zweites Fenster, window.open('')
 *      liefert dort immer null. Die App hat dafür die Brücke
 *      KRSNative.openExternal(url) (krs-native-client.js → Hub → Capacitor
 *      Browser). Die nutzte der Knopf nicht.
 *   2. Im Hub läuft Connect in einem iframe mit sandbox. Ein solcher Rahmen darf
 *      ein Fenster nur navigieren, solange er dessen opener ist. Der Code setzte
 *      opener gleich nach dem Reservieren auf null, das Fenster blieb leer.
 *      Jetzt: erst navigieren, dann trennen.
 * Die übrigen Connect-Tests laden Connect ohne Hub und ohne sandbox. Darum fiel
 * beides nie auf. N9 bis N11 laden Connect deshalb im iframe mit der sandbox
 * des Live-Hubs.
 *
 * Gegenprobe gegen den Stand vor dem Fix (4.52.0, ohne Git anzufassen):
 *   CONNECT_PATH=/_vor-neuertab.html npx playwright test \
 *     tests/connect/smoke-viewer-neuer-tab.spec.ts --project=connect
 * Erwartet dort rot: N1 bis N4, N6 bis N11 (mit N8b). Grün: N5, denn die
 * Fehlermeldung beim Signieren gab es schon.
 *
 * Meldungen werden über einen Mitschnitt von window.showToast geprüft, nicht
 * über das DOM: Ein Toast verschwindet nach 4 s, und toHaveCount(0) würde
 * einfach so lange warten.
 */

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
// .test ist eine reservierte Endung, es geht nichts ins Netz (siehe Route unten).
const SIGNED = (bucket: string, path: string) => `https://storage.test/storage/v1/object/sign/${bucket}/${path}?token=t`;
const BILD = { url: 'uploads/2026/plan.png', name: 'plan.png', type: 'image/png', size: 1900 };

type Ziel = Page | Frame;

async function netzAttrappe(page: Page) {
  await page.context().route(/^https:\/\/(storage|extern)\.test\//, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: PNG })
  );
}

/** Signieren wie im Live-Betrieb (privater Bucket), aber ohne Supabase. */
async function signierAttrappe(ziel: Ziel) {
  await ziel.evaluate(() => {
    (window as any).__krsSb = {
      storage: {
        from: (bucket: string) => ({
          createSignedUrl: async (path: string) => {
            if ((window as any).__signFail) return { data: null, error: { message: 'kaputt' } };
            return { data: { signedUrl: 'https://storage.test/storage/v1/object/sign/' + bucket + '/' + path + '?token=t' }, error: null };
          },
        }),
      },
    };
  });
}

/** Schneidet jede Meldung mit, die die App zeigt. */
async function meldungenMitschneiden(ziel: Ziel) {
  await ziel.evaluate(() => {
    const liste: { text: string; art: string }[] = [];
    (window as any).__meldungen = liste;
    const original = (window as any).showToast;
    (window as any).showToast = (text: any, art?: string, aktion?: any) => {
      liste.push({ text: String(text), art: art || 'error' });
      return original(text, art, aktion);
    };
  });
}
const meldungen = (ziel: Ziel) => ziel.evaluate(() => (window as any).__meldungen as { text: string; art: string }[]);
/** Kurz warten (Signieren und Übergabe sind dann durch), dann darf nichts gemeldet sein. */
async function keineMeldung(ziel: Ziel) {
  await ziel.waitForTimeout(250);
  expect(await meldungen(ziel)).toEqual([]);
}

async function start(page: Page) {
  await netzAttrappe(page);
  await openConnect(page, { user: 'la' });
  await waitForAppReady(page);
  await signierAttrappe(page);
  await meldungenMitschneiden(page);
}

/**
 * Stellt die Lage in der iOS-App nach, so wie krs-native-client.js sie nach dem
 * Handschlag herstellt (interceptExternalLinks): KRSNative ist verfügbar,
 * window.open reicht http(s)-Adressen an die Brücke und liefert sonst null
 * (WKWebView öffnet kein Fenster), Links mit http(s)-Adresse und
 * target="_blank" gehen in der Capture-Phase an die Brücke.
 */
async function alsIosApp(page: Page) {
  await page.evaluate(() => {
    const ext: string[] = [];
    (window as any).__ext = ext;
    const nat = (window as any).KRSNative;
    nat.available = true;
    nat.platform = 'ios';
    nat.openExternal = (url: string) => { ext.push(String(url)); return Promise.resolve(true); };
    window.open = ((url?: string) => {
      if (url && /^https?:/i.test(String(url))) { nat.openExternal(String(url)); return null; }
      return null;
    }) as any;
    document.addEventListener('click', (ev) => {
      const a = (ev.target as Element)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (!/^https?:/i.test(href)) return;
      if (a.target !== '_blank' && href.indexOf(location.origin) === 0) return;
      ev.preventDefault();
      nat.openExternal(href);
    }, true);
  });
}

async function oeffne(ziel: Ziel, datei: Record<string, unknown>) {
  await ziel.evaluate((f) => (window as any).openFileViewer([f], 0), datei);
  await expect(ziel.locator('.fv-overlay')).toBeVisible({ timeout: 4_000 });
}

const neuerTab = (ziel: Ziel) => ziel.locator('.fv-tools a.fv-btn');
const uebergaben = (page: Page) => page.evaluate(() => (window as any).__ext as string[]);

test.describe('VIEWER-02 — „Neuer Tab“ in der iOS-App', () => {
  test('N1 App: die signierte Adresse geht an den Browser der App, keine Fehlermeldung', async ({ page }) => {
    await start(page);
    await alsIosApp(page);
    await oeffne(page, BILD);

    await neuerTab(page).click();

    await expect.poll(() => uebergaben(page)).toEqual([SIGNED('images', 'uploads/2026/plan.png')]);
    await keineMeldung(page);
    await expect(page.locator('.fv-overlay')).toBeVisible(); // Vorschau bleibt offen
  });

  test('N2 App, alter Beitrag mit /public/-Adresse: genau eine Übergabe, und die ist signiert', async ({ page }) => {
    await start(page);
    await alsIosApp(page);
    await oeffne(page, { ...BILD, url: 'https://storage.test/storage/v1/object/public/images/uploads/alt.png', name: 'alt.png' });

    await neuerTab(page).click();

    await expect.poll(() => uebergaben(page)).toEqual([SIGNED('images', 'uploads/alt.png')]);
    await keineMeldung(page);
    expect(await uebergaben(page)).toHaveLength(1);
  });

  test('N3 App, fremde https-Adresse: genau eine Übergabe, keine Fehlermeldung', async ({ page }) => {
    await start(page);
    await alsIosApp(page);
    await oeffne(page, { url: 'https://extern.test/material.zip', name: 'material.zip', type: 'application/zip', size: 10 });

    await neuerTab(page).click();

    await expect.poll(() => uebergaben(page)).toEqual(['https://extern.test/material.zip']);
    await keineMeldung(page);
    expect(await uebergaben(page)).toHaveLength(1); // ein zweiter Aufruf käme nach dem Signieren
  });

  test('N4 App, Datei aus der Team-Dateiablage: richtiger Bucket', async ({ page }) => {
    await start(page);
    await alsIosApp(page);
    await oeffne(page, { ...BILD, url: 'team-files/t1/plan.png', noForward: true });

    await neuerTab(page).click();

    await expect.poll(() => uebergaben(page)).toEqual([SIGNED('team-files', 't1/plan.png')]);
    await keineMeldung(page);
  });

  test('N5 App, Signieren schlägt fehl: Fehlermeldung, nichts wird übergeben', async ({ page }) => {
    await start(page);
    await alsIosApp(page);
    await page.evaluate(() => { (window as any).__signFail = true; });
    await oeffne(page, { ...BILD, url: 'uploads/2026/kaputt.png' });

    await neuerTab(page).click();

    await expect.poll(() => meldungen(page)).toEqual([{ text: 'Datei konnte nicht geöffnet werden.', art: 'error' }]);
    expect(await uebergaben(page)).toEqual([]);
  });

  test('N6 App, Datei ohne Netz-Adresse (blob:): Hinweis auf „Herunterladen“, kein „blockiert“', async ({ page }) => {
    await start(page);
    await alsIosApp(page);
    const url = await page.evaluate(() => URL.createObjectURL(new Blob(['x'], { type: 'application/zip' })));
    await oeffne(page, { url, name: 'lokal.zip', type: 'application/zip', size: 1 });

    await neuerTab(page).click();

    await expect.poll(() => meldungen(page)).toHaveLength(1);
    const [m] = await meldungen(page);
    expect(m.art).toBe('info');
    expect(m.text).toContain('„Herunterladen“');
    expect(m.text).not.toContain('blockiert');
    expect(await uebergaben(page)).toEqual([]);
  });
});

test.describe('VIEWER-02 — „Neuer Tab“ im Browser', () => {
  test('N7 Browser ohne Blocker: Fenster wird im Klick reserviert, bekommt die Adresse und wird ERST DANACH vom Öffner getrennt', async ({ page }) => {
    await start(page);
    await page.evaluate(() => {
      const ziele: { url: string; openerNochDa: boolean }[] = [];
      (window as any).__ziele = ziele;
      (window as any).__open = 0;
      window.open = (() => {
        (window as any).__open += 1;
        const fake: any = { opener: {}, close() {} };
        // Ein sandboxed iframe darf nur navigieren, solange es der opener ist.
        Object.defineProperty(fake, 'location', { set(v) { ziele.push({ url: String(v), openerNochDa: fake.opener !== null }); }, get() { return ''; } });
        (window as any).__fenster = fake;
        return fake;
      }) as any;
    });
    await oeffne(page, BILD);

    await neuerTab(page).click();

    await expect.poll(() => page.evaluate(() => (window as any).__ziele))
      .toEqual([{ url: SIGNED('images', 'uploads/2026/plan.png'), openerNochDa: true }]);
    expect(await page.evaluate(() => (window as any).__open)).toBe(1);
    expect(await page.evaluate(() => (window as any).__fenster.opener)).toBeNull(); // die Zielseite sieht keinen opener
    await keineMeldung(page);
  });

  test('N8 Browser blockiert das Fenster: Hinweis mit Knopf „Jetzt öffnen“, der einen echten Link auslöst', async ({ page }) => {
    await start(page);
    await page.evaluate(() => { window.open = (() => null) as any; });
    await oeffne(page, BILD);
    const link = neuerTab(page);

    await link.click();
    await expect.poll(() => meldungen(page)).toHaveLength(1);
    const [m] = await meldungen(page);
    expect(m.art).toBe('info');
    expect(m.text).toContain('noch einmal auf „Neuer Tab“ tippen');
    // Ab jetzt ist der Knopf ein echter Link auf die signierte Adresse.
    await expect(link).toHaveAttribute('href', SIGNED('images', 'uploads/2026/plan.png'));

    // Die Meldung liegt bei dieser Breite über dem Knopf. Sie bringt deshalb ihren
    // eigenen Knopf mit. Kein window.open mehr: Der Browser folgt dem Link selbst.
    const popup = page.waitForEvent('popup');
    await page.locator('.toast .toast-action', { hasText: 'Jetzt öffnen' }).click();
    expect((await popup).url()).toBe(SIGNED('images', 'uploads/2026/plan.png'));
    expect(await meldungen(page)).toHaveLength(1); // keine zweite Meldung
  });

  test('N8b Nach blockiertem Fenster öffnet auch der zweite Tipp auf „Neuer Tab“ die Datei', async ({ page }) => {
    await start(page);
    await page.evaluate(() => { window.open = (() => null) as any; });
    await oeffne(page, BILD);
    const link = neuerTab(page);
    await link.click();
    await expect(link).toHaveAttribute('href', SIGNED('images', 'uploads/2026/plan.png'));
    await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove())); // Meldung weg, Knopf frei

    const popup = page.waitForEvent('popup');
    await link.click();
    expect((await popup).url()).toBe(SIGNED('images', 'uploads/2026/plan.png'));
    expect(await meldungen(page)).toHaveLength(1);
  });
});

/**
 * Connect so, wie es wirklich läuft: als iframe unter der Live-Origin des Hubs,
 * mit derselben sandbox wie im Live-Hub (krs-hub/index.html, ModuleFrames).
 * Die Dateien kommen vom lokalen Testserver.
 */
const HUB = 'https://kurpfalz-realschule.github.io';
const HUB_SANDBOX = 'allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads';
/** `nativ`: Die Attrappe antwortet wie krs-native.js in der iOS-App (Handschlag, RPC). */
const hubSeite = (nativ: boolean) => `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Hub (Attrappe)</title>
<script>
  window.__rpc = [];
  if (${nativ}) window.addEventListener('message', function (ev) {
    var m = ev.data; if (!m || ev.origin !== location.origin) return;
    if (m.type === 'KRS_NATIVE_HELLO') ev.source.postMessage({ type: 'KRS_NATIVE_READY', platform: 'ios', version: 'test' }, ev.origin);
    if (m.type === 'KRS_NATIVE_RPC') {
      window.__rpc.push({ method: m.method, args: m.args });
      ev.source.postMessage({ type: 'KRS_NATIVE_RPC_RESULT', id: m.id, ok: true, value: m.method === 'capabilities' ? { downloadFile: false } : true }, ev.origin);
    }
  });
</script></head>
<body style="margin:0"><iframe id="connect" title="Connect" sandbox="${HUB_SANDBOX}" src="/krs-connect/index.html?forceMode=demo&forceUser=la" style="width:100vw;height:100vh;border:0"></iframe></body></html>`;

async function connectImHub(page: Page, baseURL: string | undefined, nativ: boolean): Promise<Frame> {
  await netzAttrappe(page);
  await page.addInitScript((istApp) => {
    try { localStorage.setItem('krs_onboarding_done', '1'); } catch (e) {}
    if (istApp) window.open = (() => null) as any; // WKWebView: kein zweites Fenster
  }, nativ);
  await page.context().route(HUB + '/**', async (route) => {
    const pfad = new URL(route.request().url()).pathname;
    if (pfad === '/krs-hub/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: hubSeite(nativ) });
    if (pfad.startsWith('/krs-connect/')) {
      const rel = pfad.slice('/krs-connect/'.length);
      const lokal = rel === 'index.html' ? CONNECT_PATH : '/' + rel;
      const antwort = await page.request.get(baseURL + lokal, { failOnStatusCode: false });
      return route.fulfill({ response: antwort });
    }
    return route.fulfill({ status: 404, body: '' });
  });

  await page.goto(HUB + '/krs-hub/');
  await expect.poll(() => page.frame({ url: /\/krs-connect\/index\.html/ }), { timeout: 10_000 }).not.toBeNull();
  const frame = page.frame({ url: /\/krs-connect\/index\.html/ })!;
  await frame.waitForFunction(() => typeof (window as any).KRS_VERSION === 'string', null, { timeout: 15_000 });
  // krs-native-client.js entscheidet per Handschlag (Zeitlimit 1,2 s), ob es in der App läuft.
  await expect.poll(() => frame.evaluate(() => (window as any).KRSNative.ready.then((n: boolean) => n))).toBe(nativ);
  await signierAttrappe(frame);
  await meldungenMitschneiden(frame);
  return frame;
}

test.describe('VIEWER-02 — Connect im Hub-iframe mit der sandbox des Live-Hubs', () => {
  test('N9 App: Handschlag, Tipp auf „Neuer Tab“, RPC openExternal mit signierter Adresse', async ({ page, baseURL }) => {
    const frame = await connectImHub(page, baseURL, true);
    await expect(frame.locator('html')).toHaveAttribute('data-krs-native', 'ios');
    await oeffne(frame, BILD);

    await neuerTab(frame).click();

    await expect
      .poll(() => page.evaluate(() => (window as any).__rpc.filter((r: any) => r.method === 'openExternal')))
      .toEqual([{ method: 'openExternal', args: { url: SIGNED('images', 'uploads/2026/plan.png') } }]);
    await keineMeldung(frame);
  });

  test('N10 Browser: der neue Tab bleibt nicht leer, er zeigt die Datei und kennt keinen opener', async ({ page, baseURL }) => {
    const frame = await connectImHub(page, baseURL, false);
    await oeffne(frame, BILD);

    const fenster = page.context().waitForEvent('page');
    await neuerTab(frame).click(); // echtes window.open, nichts nachgestellt
    const tab = await fenster;

    await expect.poll(() => tab.url()).toBe(SIGNED('images', 'uploads/2026/plan.png'));
    expect(await tab.evaluate(() => window.opener)).toBeNull();
    await keineMeldung(frame);
  });

  test('N11 Browser, iPhone-Safari ohne Teilen: „Im Browser laden“ öffnet die Download-Adresse im neuen Tab', async ({ page, baseURL }) => {
    const frame = await connectImHub(page, baseURL, false);
    await frame.evaluate(() => {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' });
      (navigator as any).canShare = () => false;
      (window as any).__dl = (window as any).__krsDownloadFile({ url: 'uploads/2026/plan.png', name: 'plan.png' });
    });

    const fenster = page.context().waitForEvent('page');
    await frame.getByRole('button', { name: 'Im Browser laden' }).click();
    const tab = await fenster;

    await expect.poll(() => tab.url()).toContain('/storage/v1/object/sign/images/uploads/2026/plan.png');
    expect(new URL(tab.url()).searchParams.get('download')).toBe('plan.png');
    expect(await frame.evaluate(() => (window as any).__dl)).toMatchObject({ state: 'handed_off', method: 'download-url' });
  });
});
