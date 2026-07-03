import { test, expect, openHub, HUB_PATH } from '../fixtures/hub';

/**
 * S2 · Klarnamen aus öffentlichen Clients (Härtungs-Sprint 2026-07-03)
 *
 * Prüft:
 *  1. Das ausgelieferte Hub-HTML enthält keine Klarnamen echter Lehrkräfte
 *     und keine Schul-Domain (Akzeptanzkriterium: grep = 0).
 *  2. Im Demo-Modus liefert getKollegium() die anonymisierte Demo-Liste
 *     (produktiv käme sie aus der SECURITY-DEFINER-RPC get_kollegium_public()).
 *  3. forceUser=Ko (Superadmin-Testpfad) funktioniert weiter — ohne Klarnamen.
 */

// Nachnamen der früher hartkodierten LEHRKRAEFTE-Liste + Schul-Domain.
// Vollständige Liste aus dem Stand vor S2 — KEINER darf zurückkommen.
const VERBOTENE_STRINGS = [
  'Carse', 'Schmitt', 'Kotzan', 'Joos', 'Jacob', 'Spingel', 'Martinez',
  'Scharmann', 'Gehrig', 'Appel', 'realschule-schriesheim',
];

test.describe('KRS Hub — S2: Kollegium ohne Klarnamen', () => {

  test('Ausgeliefertes Hub-HTML enthält keine Klarnamen/Schul-Domain', async ({ request }) => {
    const res = await request.get(HUB_PATH);
    test.skip(!res.ok(), 'Hub-HTML nicht im Serverpfad (Server muss den Wurzelordner ausliefern)');
    const html = await res.text();
    for (const s of VERBOTENE_STRINGS) {
      expect(html, `"${s}" darf nicht im ausgelieferten Hub-HTML stehen`).not.toContain(s);
    }
  });

  test('Demo-Modus: getKollegium() liefert anonymisierte Liste', async ({ page }) => {
    await openHub(page);
    const list = await page.evaluate(() => (window as any).KRSHub.getKollegium());
    expect(Array.isArray(list)).toBeTruthy();
    expect(list.length).toBeGreaterThan(0);
    // Struktur wie die RPC get_kollegium_public(): nur nicht-sensible Felder
    for (const u of list) {
      expect(u).toHaveProperty('kuerzel');
      expect(u).toHaveProperty('display_name');
      expect(u).toHaveProperty('role');
      expect(u).not.toHaveProperty('email');
    }
    const json = JSON.stringify(list);
    for (const s of VERBOTENE_STRINGS) {
      expect(json, `Demo-Kollegium darf "${s}" nicht enthalten`).not.toContain(s);
    }
    // Mindestens ein Admin (Superadmin-Pfad braucht role=admin)
    expect(list.some((u: any) => u.role === 'admin')).toBeTruthy();
  });

  test('forceUser=Ko lädt Demo-Superadmin ohne Klarnamen', async ({ page }) => {
    await page.goto(`${HUB_PATH}?forceMode=demo&forceUser=Ko`);
    await page.waitForFunction(
      () => typeof (window as any).KRS_HUB_VERSION === 'string',
      null,
      { timeout: 10_000 }
    );
    const kollegium = await page.evaluate(() => (window as any).KRSHub.getKollegium());
    const ko = kollegium.find((u: any) => u.kuerzel === 'Ko');
    expect(ko, 'Demo-Kürzel Ko muss existieren (CONFIG.ADMIN.SUPERADMINS)').toBeTruthy();
    expect(ko.display_name).toBe('Demo-Admin');
    expect(ko.role).toBe('admin');
  });

  test('Demo-Admin-Store nutzt anonymisierte Demo-E-Mails (example.org)', async ({ page }) => {
    await openHub(page);
    const emails = await page.evaluate(() => {
      const w = window as any;
      // Store wird lazy angelegt — über getKollegium() ist die Demo-Basis da;
      // wir prüfen direkt die HTML-Quelle des Admin-Stores über die Seite.
      return w.__ADMIN_STORE ? w.__ADMIN_STORE.users.map((u: any) => u.email) : null;
    });
    // Store existiert erst nach Öffnen des Admin-Panels — dann defensiv skippen
    test.skip(emails === null, 'Admin-Store noch nicht initialisiert (lazy)');
    for (const mail of emails as string[]) {
      expect(mail.endsWith('@example.org'), `Demo-Mail ${mail} muss auf @example.org enden`).toBeTruthy();
    }
  });
});
