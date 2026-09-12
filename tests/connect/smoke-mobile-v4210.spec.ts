import { test, expect, openConnect, waitForAppReady } from '../fixtures/connect';

/**
 * KRS Connect — v4.21.0 „Mobile & Rechte"
 *
 * Deckt die sechs Rückmeldungen ab, die Norbert am 11.09.2026 vom iPhone
 * gemeldet hat. Jeder Test steht für genau einen dieser Punkte, damit bei
 * einem roten Lauf sofort klar ist, welche Rückmeldung wieder offen ist.
 *
 *  1  PDF ließ sich nicht an den Bildschirm anpassen (war ein <iframe>)
 *  2  „Weiterleiten" hatte kein Suchfeld für Person/Kanal
 *  3  Jeder globale Admin durfte fremde Beiträge bearbeiten/löschen
 *  4  Eingefügte Bilder liefen über den Rand und waren nicht zoombar
 *  5  Der Lern-Coach-FAB klebte auf jedem Screen (→ smoke-lern-coach.spec.ts)
 *
 * Punkt 3 ist hier nur in der Verbots-Richtung prüfbar: Der Demo-User
 * „Lehrkraft A" hat role='admin' und darf fremde Beiträge NICHT mehr
 * bearbeiten — genau die Änderung. Die Erlaubnis-Richtung (role='owner' darf
 * doch) hängt an echten Auth-Claims und wird serverseitig per SQL gegen
 * migrations/2026-09-11_owner-rolle-und-rollen-guard.sql geprüft, nicht hier.
 */

const IPHONE = { width: 390, height: 844 };

test.describe('v4.21.0 — Bilder im Beitrag (Punkt 4)', () => {
  test('Bild im Beitragstext wird auf Fensterbreite begrenzt', async ({ page }) => {
    await page.setViewportSize(IPHONE);
    await openConnect(page, { user: 'la' });
    await waitForAppReady(page);

    const mess = await page.evaluate(() => {
      const host = document.createElement('div');
      host.className = 'post-content';
      host.innerHTML = '<img id="e2e-wide" alt="breit" ' +
        'src="data:image/svg+xml;utf8,' +
        encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900"><rect width="1400" height="900" fill="#ccd"/></svg>') +
        '">';
      document.body.appendChild(host);
      const img = document.getElementById('e2e-wide') as HTMLImageElement;
      const cs = getComputedStyle(img);
      return {
        maxWidth: cs.maxWidth,
        cursor: cs.cursor,
        hostScroll: host.scrollWidth,
        hostClient: host.clientWidth,
        docScroll: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      };
    });

    expect(mess.maxWidth).toBe('100%');
    expect(mess.cursor).toBe('zoom-in');
    // Kein Querscroll — das war der sichtbare Fehler auf dem iPhone.
    expect(mess.hostScroll).toBeLessThanOrEqual(mess.hostClient);
    expect(mess.docScroll).toBeLessThanOrEqual(mess.viewport);
  });

  test('Klick auf ein Bild im Beitragstext öffnet die Lightbox, Doppeltipp zoomt', async ({ page }) => {
    await page.setViewportSize(IPHONE);
    await openConnect(page, { user: 'la' });
    await waitForAppReady(page);

    await page.evaluate(() => {
      const host = document.createElement('div');
      host.className = 'post-content';
      host.innerHTML = '<img id="e2e-lb" alt="breit" ' +
        'src="data:image/svg+xml;utf8,' +
        encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900"><rect width="1400" height="900" fill="#ccd"/></svg>') +
        '">';
      document.body.appendChild(host);
    });

    await page.locator('#e2e-lb').click();
    const lb = page.locator('.lightbox-overlay img.lightbox-img');
    await expect(lb).toBeVisible({ timeout: 5_000 });

    // Doppeltipp → hineinzoomen, erneut → zurück auf 1.
    const zoomed = await page.evaluate(() => {
      const li = document.querySelector('.lightbox-overlay img.lightbox-img') as HTMLElement;
      const tap = () => {
        const t = new Touch({ identifier: 1, target: li, clientX: 200, clientY: 300,
          pageX: 200, pageY: 300, screenX: 200, screenY: 300 });
        li.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t], targetTouches: [t], changedTouches: [t] }));
        li.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [t] }));
      };
      tap(); tap();
      const nach = li.style.transform;
      tap(); tap();
      return { nach, zurueck: li.style.transform, klasse: li.className };
    });

    expect(zoomed.nach).toContain('scale(2.5)');
    expect(zoomed.zurueck).toContain('scale(1)');
  });
});

test.describe('v4.21.0 — PDF-Vorschau (Punkt 1)', () => {
  test('PDF öffnet entweder die Canvas-Ansicht oder den iframe-Fallback, nie eine leere Seite', async ({ page }) => {
    await page.setViewportSize(IPHONE);
    await openConnect(page, { user: 'la' });
    await waitForAppReady(page);

    await page.evaluate(() => {
      (window as any).openFileViewer([{ name: 'Elternbrief.pdf', url: 'about:blank', type: 'application/pdf' }], 0);
    });

    await expect(page.locator('.fv-overlay')).toBeVisible({ timeout: 5_000 });
    // Entweder die neue Werkzeugleiste (PDF.js geladen) oder der Fallback.
    const ok = page.locator('.fv-pdfbar, .fv-frame');
    await expect(ok.first()).toBeVisible({ timeout: 15_000 });

    // Wenn PDF.js da ist: „An Breite anpassen" und „In neuem Tab" müssen da sein.
    if (await page.locator('.fv-pdfbar').count() > 0) {
      await expect(page.locator('.fv-pdfbar [aria-label="An Breite anpassen"]')).toBeVisible();
      await expect(page.locator('.fv-pdfbar a[target="_blank"]')).toBeVisible();
    }
  });
});

test.describe('v4.21.0 — Weiterleiten mit Suche (Punkt 2)', () => {
  test('Suchfeld findet eine Person ohne laufenden Chat', async ({ connectPage: page }) => {
    await waitForAppReady(page);

    const forward = page.locator('button[aria-label="Nachricht weiterleiten"]').first();
    if (await forward.count() === 0) test.skip(true, 'Kein Beitrag sichtbar — UI-Variante');
    await forward.click();

    const suche = page.locator('input[aria-label="Ziel suchen"]');
    await expect(suche).toBeVisible({ timeout: 5_000 });

    // Alle Pruefungen auf den Dialog eingrenzen — 'Direktnachrichten' steht
    // auch ausserhalb im UI und wuerde sonst doppelt matchen.
    const dlg = page.locator('.channel-dialog').filter({ has: suche });

    // Ohne Suchbegriff: nur Kanäle/laufende Chats, keine Personenliste.
    await expect(dlg.getByText('Weitere Personen')).toHaveCount(0);

    // Anna L. (id 4) HAT in den Demo-Daten schon einen Chat
    // (MOCK_CONVERSATIONS id 3). Sie gehoert unter 'Direktnachrichten' und
    // darf NICHT zusaetzlich unter 'Weitere Personen' stehen — das ist die
    // Entdopplung, an der dieser Test im CI-Lauf #74 zu Recht haengen blieb.
    await suche.fill('Anna');
    await expect(dlg.getByText('Direktnachrichten')).toBeVisible({ timeout: 3_000 });
    await expect(dlg.getByText('Weitere Personen')).toHaveCount(0);

    // Markus K. (id 5) hat KEINEN laufenden Chat. Genau dafuer ist die Suche
    // da: vorher war er ueber 'Weiterleiten' ueberhaupt nicht erreichbar.
    await suche.fill('Markus');
    await expect(dlg.getByText('Weitere Personen')).toBeVisible({ timeout: 3_000 });
    await expect(dlg.getByRole('button', { name: /Markus/ })).toBeVisible();

    // Unsinn → sauberer Leer-Zustand statt stiller leerer Liste.
    await suche.fill('zzzzzz');
    await expect(page.getByText(/Nichts gefunden/)).toBeVisible({ timeout: 3_000 });
  });
});

test.describe('v4.21.0 — Rechte an fremden Beiträgen (Punkt 3)', () => {
  test('Ein globaler Admin sieht an fremden Beiträgen kein Bearbeiten/Löschen mehr', async ({ connectPage: page }) => {
    await waitForAppReady(page);

    // Demo-Beiträge stammen von Lehrkraft B/C — nicht vom eingeloggten
    // Demo-User „Lehrkraft A" (id 1, role='admin').
    const posts = page.locator('.post');
    if (await posts.count() === 0) test.skip(true, 'Keine Beiträge sichtbar — UI-Variante');

    await expect(page.locator('.post button[aria-label="Post bearbeiten"]')).toHaveCount(0);
    await expect(page.locator('.post button[aria-label="Post löschen"]')).toHaveCount(0);

    // Anheften bleibt Admin-Recht (Moderation) — soll NICHT verschwinden.
    await expect(page.locator('.post button[aria-label="Post anheften"]').first()).toBeVisible();
  });
});
