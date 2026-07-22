import { test, expect } from '../fixtures/connect';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Tenant-Mechanik (TENANT-SPEC.md Sprint S2, Punkt 10)
 *
 * Beweis, dass ein Fork wirklich nur tenant.js tauschen muss, um Branding,
 * Hub-Kopplung und Feedback-Ziel komplett zu ändern — ohne eine Zeile
 * index.html anzufassen. Alle Tests laden im Demo-Modus (forceMode=demo),
 * damit nie ein echter Supabase-Client instanziiert wird (TENANT-SPEC 3.3),
 * und ersetzen den tenant.js-Response per Route-Interception mit dem Inhalt
 * von tenant.musterschule.js — genau das Szenario "eine Datei tauschen".
 *
 * Die bestehenden Specs (smoke-teams, health-check, smoke-hub-link, …) prüfen
 * weiterhin die echten KRS-Strings/-Werte und bleiben unverändert grün — das
 * ist der Beweis für E6 (Verhalten identisch), nicht Aufgabe dieser Datei.
 */

const MUSTERSCHULE_TENANT_JS = fs.readFileSync(
  path.join(__dirname, '..', '..', 'tenant.musterschule.js'),
  'utf-8'
);

async function useMusterschuleTenant(page: import('@playwright/test').Page) {
  await page.route('**/tenant.js', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: MUSTERSCHULE_TENANT_JS })
  );
}

async function useBrokenTenant(page: import('@playwright/test').Page) {
  // Simuliert einen Fork, der tenant.js nicht (richtig) ausgeliefert hat:
  // Datei existiert, setzt aber kein window.TENANT.
  await page.route('**/tenant.js', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '// leer' })
  );
}

test.describe('Tenant-Mechanik (Demo, tenant.musterschule.js per Route-Swap)', () => {
  test('TENANT.app.name erscheint im document.title', async ({ page }) => {
    await useMusterschuleTenant(page);
    const params = new URLSearchParams({ forceMode: 'demo', forceUser: 'la' });
    await page.addInitScript(() => { try { localStorage.setItem('krs_onboarding_done', '1'); } catch (e) {} });
    await page.goto(`/index.html?${params.toString()}`);
    await page.waitForFunction(() => typeof (window as any).KRS_VERSION === 'string', null, { timeout: 10_000 });
    await expect(page).toHaveTitle(/MSB Connect/);
  });

  test('hub.enabled:false ⇒ kein 🏠-Button und kein Notizen-Button', async ({ page }) => {
    await useMusterschuleTenant(page);
    const params = new URLSearchParams({ forceMode: 'demo', forceUser: 'la' });
    await page.addInitScript(() => { try { localStorage.setItem('krs_onboarding_done', '1'); } catch (e) {} });
    await page.goto(`/index.html?${params.toString()}`);
    await expect(page.locator('.app-layout, nav.sidebar').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="nav-hub"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="nav-notizen"]')).toHaveCount(0);
    // window.__KRS_HUB_ENABLED ist der zentrale Schalter, den beide Guards lesen.
    await expect.poll(() => page.evaluate(() => (window as any).__KRS_HUB_ENABLED)).toBe(false);
  });

  test('links.nextcloudUrl leer ⇒ keine Dateiablage-Karte in der Sidebar', async ({ page }) => {
    await useMusterschuleTenant(page);
    const params = new URLSearchParams({ forceMode: 'demo', forceUser: 'la' });
    await page.addInitScript(() => { try { localStorage.setItem('krs_onboarding_done', '1'); } catch (e) {} });
    await page.goto(`/index.html?${params.toString()}`);
    await expect(page.locator('.app-layout, nav.sidebar').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[title="Dateiablage (Nextcloud)"]')).toHaveCount(0);
  });

  test('feedback.gasUrl leer ⇒ FEEDBACK_GAS_URL ist leer (kein Fremd-Sheet-Schreiben)', async ({ page }) => {
    await useMusterschuleTenant(page);
    const params = new URLSearchParams({ forceMode: 'demo', forceUser: 'la' });
    await page.addInitScript(() => { try { localStorage.setItem('krs_onboarding_done', '1'); } catch (e) {} });
    await page.goto(`/index.html?${params.toString()}`);
    await page.waitForFunction(() => typeof (window as any).KRS_VERSION === 'string', null, { timeout: 10_000 });
    await expect.poll(() => page.evaluate(() => (window as any).__krsFeedbackGasUrl)).toBe('');
  });

  test('Accent aus tenant.js landet in --accent', async ({ page }) => {
    await useMusterschuleTenant(page);
    const params = new URLSearchParams({ forceMode: 'demo', forceUser: 'la' });
    await page.addInitScript(() => { try { localStorage.setItem('krs_onboarding_done', '1'); } catch (e) {} });
    await page.goto(`/index.html?${params.toString()}`);
    await page.waitForFunction(() => typeof (window as any).KRS_VERSION === 'string', null, { timeout: 10_000 });
    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    );
    expect(accent.toLowerCase()).toBe('#0d9488');
  });

  test('ohne tenant.js und ohne forceMode=demo ⇒ Konfig-Screen, kein Crash', async ({ page }) => {
    await useBrokenTenant(page);
    // Bewusst KEIN forceMode=demo — das ist genau der Pfad, den TENANT-SPEC 3.3 abfängt.
    await page.goto('/index.html');
    await expect(page.getByText('Konfiguration fehlt')).toBeVisible({ timeout: 10_000 });
    // Kein Login-Formular, kein Absturz auf weißer Seite.
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
  });
});
