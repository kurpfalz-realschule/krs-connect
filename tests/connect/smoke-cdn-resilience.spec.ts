import { test, expect } from '../fixtures/connect';
import { openConnect } from '../fixtures/connect';

/**
 * Batch 1 — CDN-Resilience: supabase-js wird über eine Fallback-CDN-Kette
 * geladen (jsdelivr → unpkg → jsdelivr/UMD). window.__supabaseReady ist das
 * Promise, auf das die App vor jeder Client-Nutzung wartet. So killt ein
 * CDN-Hänger nicht mehr die ganze App mit "Supabase nicht verfügbar".
 *
 * Hinweis: Der Loader läuft auch im Demo-Modus (er ist NICHT an forceMode
 * gekoppelt). Im CI besteht Netzzugang zu jsdelivr → __supabaseReady resolved.
 */
test.describe('KRS Connect — Smoke: CDN-Resilience (supabase-js)', () => {
  test('window.__supabaseReady existiert und resolved zum supabase-Global', async ({ page }) => {
    await openConnect(page);
    // App ist gebootet (Version-Marker da). Versionsunabhängig prüfen, damit
    // ein Release-Bump (window.KRS_VERSION) diesen Test nicht mehr bricht.
    const version = await page.evaluate(() => (window as any).KRS_VERSION);
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);

    // __supabaseReady ist ein Promise und resolved (Fallback-Kette hat geladen)
    const ready = await page.evaluate(async () => {
      const p = (window as any).__supabaseReady;
      if (!p || typeof p.then !== 'function') return { ok: false, reason: 'kein Promise' };
      try {
        await Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 15000))]);
        return { ok: !!(window as any).supabase?.createClient, reason: 'geladen' };
      } catch (e: any) {
        return { ok: false, reason: e?.message || 'reject' };
      }
    });
    expect(ready.ok, `supabase-js sollte via Fallback-CDN laden (${ready.reason})`).toBe(true);
  });

  test('Kein "Supabase nicht verfügbar" beim Boot (Demo-Modus)', async ({ page }) => {
    await openConnect(page);
    // Login-/Demo-Oberfläche da, keine harte CDN-Fehlermeldung sichtbar
    await expect(page.getByText(/Supabase nicht verfügbar/i)).toHaveCount(0);
  });
});
