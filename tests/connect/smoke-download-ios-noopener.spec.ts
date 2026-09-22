import { test, expect, openConnect } from '../fixtures/connect.ts';

// Versionen nie hart vergleichen — sonst wird dieser Test bei jedem Release rot
// (gleiche Falle wie frueher in smoke-auto-update.spec.ts).
function semverGte(a: string, b: string): boolean {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return true;
}


/**
 * 0AU / v4.37.0 — iPhone Download: kein noopener-null-Trap mehr.
 * Statische + Hook-Prüfungen (echte iOS-Safari-Downloads bleiben Geräte-Retest).
 */
test.describe('0AU Download iOS / noopener-Trap', () => {

  test('Hooks exponiert: __krsDownloadFile, __krsOpenBlankForNav, __krsIsIOSDownload', async ({ connectPage: page }) => {
    const hooks = await page.evaluate(() => ({
      dl: typeof (window as any).__krsDownloadFile,
      openBlank: typeof (window as any).__krsOpenBlankForNav,
      isIOS: typeof (window as any).__krsIsIOSDownload,
      version: (window as any).KRS_VERSION,
    }));
    expect(hooks.dl).toBe('function');
    expect(hooks.openBlank).toBe('function');
    expect(hooks.isIOS).toBe('function');
    expect(hooks.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(semverGte(String(hooks.version), '4.37.0'), `KRS_VERSION ${hooks.version} ist aelter als 4.37.0`).toBe(true);
  });

  test('__krsOpenBlankForNav öffnet ohne noopener-Feature (Rückgabe nutzbar)', async ({ connectPage: page }) => {
    const log = await page.evaluate(() => {
      const calls: Array<{ url: string; target: string; features: string | undefined }> = [];
      const orig = window.open.bind(window);
      (window as any).open = function(url?: string | URL, target?: string, features?: string) {
        calls.push({
          url: String(url ?? ''),
          target: String(target ?? ''),
          features: features,
        });
        // Fake-Fenster mit location-Setter (kein echtes Popup im Headless)
        const fake: any = {
          closed: false,
          opener: {},
          location: '',
          close() { this.closed = true; },
        };
        return fake;
      };
      try {
        const w = (window as any).__krsOpenBlankForNav();
        return {
          calls,
          hasWindow: !!w,
          openerNulled: w && w.opener === null,
        };
      } finally {
        (window as any).open = orig;
      }
    });
    expect(log.calls.length).toBeGreaterThanOrEqual(1);
    const first = log.calls[0];
    expect(first.target).toBe('_blank');
    // Kritisch: features darf kein noopener enthalten (sonst null in echten Browsern)
    expect(String(first.features || '')).not.toMatch(/noopener/i);
    expect(log.hasWindow).toBe(true);
    expect(log.openerNulled).toBe(true);
  });

  test('forceDownload-Reserve läuft synchron im Klick und ohne noopener', async ({ connectPage: page }) => {
    const result = await page.evaluate(async () => {
      const calls: Array<{ features: string | undefined; sync: boolean }> = [];
      let inGesture = false;
      const orig = window.open.bind(window);
      (window as any).open = function(url?: string | URL, target?: string, features?: string) {
        calls.push({ features, sync: inGesture });
        const fake: any = {
          closed: false,
          opener: {},
          location: '',
          close() { this.closed = true; },
        };
        Object.defineProperty(fake, 'location', {
          configurable: true,
          set(_v) { /* swallow */ },
          get() { return ''; },
        });
        return fake;
      };
      // resolveStorageUrl → sofort scheitern lassen, damit Emergency-Pfad greift
      const prevResolve = (window as any).__krsResolveStorageUrl;
      (window as any).__krsResolveStorageUrl = () => Promise.reject(new Error('test-sign-fail'));
      const toasts: string[] = [];
      const prevToast = (window as any).showToast;
      (window as any).showToast = (msg: string) => { toasts.push(String(msg)); };

      try {
        inGesture = true;
        (window as any).__krsDownloadFile({ url: 'uploads/test.pdf', name: 'test.pdf' });
        inGesture = false;
        // kurz warten auf catch/toast
        await new Promise(r => setTimeout(r, 50));
        return {
          calls,
          toasts,
          usedNoopener: calls.some(c => /noopener/i.test(String(c.features || ''))),
          syncOpen: calls.some(c => c.sync),
        };
      } finally {
        (window as any).open = orig;
        (window as any).__krsResolveStorageUrl = prevResolve;
        (window as any).showToast = prevToast;
      }
    });
    expect(result.syncOpen, 'window.open muss synchron in der Geste laufen').toBe(true);
    expect(result.usedNoopener, 'Reserve-Fenster darf kein noopener nutzen').toBe(false);
    expect(result.toasts.length, 'bei Fehler muss Toast erscheinen').toBeGreaterThan(0);
    expect(result.toasts.join(' ')).toMatch(/nicht geladen|Signierung|fehlgeschlagen/i);
  });

  test('Quelltext enthält keinen Reserve-open mit noopener mehr (außer Kommentar)', async ({ connectPage: page }) => {
    // Seitenquelle: laufende App hat Scripts inline — prüfe Hook-Funktionen-String
    const src = await page.evaluate(() => String((window as any).__krsDownloadFile));
    expect(src).not.toMatch(/open\(['"]['"]\s*,\s*['"]_blank['"]\s*,\s*['"]noopener['"]\)/);
    const openSrc = await page.evaluate(() => String((window as any).__krsOpenBlankForNav));
    expect(openSrc).toMatch(/opener\s*=\s*null/);
    // Kommentar darf „noopener“ erwähnen — verboten ist nur das Feature-Argument:
    expect(openSrc).not.toMatch(/open\([^)]*noopener/i);
  });
});
