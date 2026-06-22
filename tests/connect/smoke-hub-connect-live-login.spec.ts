import { test, expect } from '@playwright/test';
import { CONNECT_PATH } from '../fixtures/connect';

/**
 * KRS Connect im Hub — Live-Login (Login-Modell A)
 *
 * Hintergrund: Früher erzwang Connect im Hub `setIsDemo(true)` und baute aus
 * dem Hub-PIN-Profil einen synthetischen Demo-User auf Mock-Daten — echter Name,
 * aber Demo-Daten. Modell A entfernt diesen Zwang: Connect-im-Hub durchläuft die
 * normale Session-Prüfung → echter Login-Screen → echte Daten.
 *
 * Dieser Test prüft das Soll deterministisch & offline: Supabase-Requests werden
 * abgebrochen (→ ensureSupabaseClient() = null → sofort Login-Screen). Danach wird
 * eine KRS_HUB_AUTH-Nachricht simuliert. Erwartung Modell A: KEIN Auto-Login,
 * der Login-Screen bleibt stehen.
 */
test.describe('KRS Connect im Hub — Live-Login (Modell A)', () => {
  test('KRS_HUB_AUTH löst KEINEN Demo-/Synthetik-Autologin aus; Login-Screen bleibt', async ({ page }) => {
    // Supabase (CDN-Loader + API) abklemmen → window.__supabaseReady rejected →
    // ensureSupabaseClient() liefert null → Session-Check endet sofort am Login-Screen.
    await page.route(/supabase/i, route => route.abort());

    // Onboarding-Wizard unterdrücken (Modal würde sonst Klicks abfangen).
    await page.addInitScript(() => {
      try { localStorage.setItem('krs_onboarding_done', '1'); } catch (e) {}
    });

    // BEWUSST OHNE forceMode=demo öffnen → echte Session-Prüfung statt Demo-Bypass.
    await page.goto(`${CONNECT_PATH}`);
    await page.waitForFunction(
      () => typeof window.KRS_VERSION === 'string',
      null,
      { timeout: 10_000 }
    );

    // Login-Screen muss erscheinen (kein Auto-Login ohne Session).
    const loginBtn = page.getByRole('button', { name: /Anmelden/ });
    await expect(loginBtn).toBeVisible({ timeout: 10_000 });

    // Hub-Auth-Nachricht simulieren (gleicher Origin → besteht die Origin-Prüfung
    // in handleHubAuth). Entspricht dem, was die Hub-Shell per postMessage sendet.
    await page.evaluate(() => {
      window.postMessage({
        type: 'KRS_HUB_AUTH',
        hub_verified: true,
        user: {
          kuerzel: 'nk',
          display_name: 'Norbert K.',
          lehrkraft_name: 'Norbert Kotzan',
          role: 'admin',
        },
      }, '*');
    });

    // Kurz warten, damit ein (unerwünschter) Auto-Login-Effekt feuern könnte.
    await page.waitForTimeout(1_200);

    // SOLL (Modell A): Login-Screen bleibt sichtbar …
    await expect(loginBtn).toBeVisible();
    // … und es gibt KEINEN UserSelection-Screen (alter Synthetik-User-Pfad).
    await expect(page.locator('[data-screen="user-selection"]')).toHaveCount(0);
    // … und KEIN eingeloggtes Hauptlayout (keine Team-/Channel-Sidebar).
    await expect(page.locator('.app-layout, aside.sidebar').first()).toHaveCount(0);
  });

  test('Standalone (kein Hub): ohne Session zeigt Connect direkt den Login-Screen', async ({ page }) => {
    await page.route(/supabase/i, route => route.abort());
    await page.addInitScript(() => {
      try { localStorage.setItem('krs_onboarding_done', '1'); } catch (e) {}
    });
    await page.goto(`${CONNECT_PATH}`);
    await page.waitForFunction(
      () => typeof window.KRS_VERSION === 'string',
      null,
      { timeout: 10_000 }
    );
    // Ohne jegliche Hub-Nachricht: regulärer Login-Screen (Verhalten unverändert).
    await expect(page.getByRole('button', { name: /Anmelden/ })).toBeVisible({ timeout: 10_000 });
  });
});
