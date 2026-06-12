import { test, expect, openHub } from '../fixtures/hub';

test.describe('KRS Hub — Smoke: Shell & Login-Bypass', () => {
  test('Hub lädt im Demo-Modus mit Version-Marker', async ({ page }) => {
    await openHub(page);
    const version = await page.evaluate(() => window.KRS_HUB_VERSION);
    expect(version).toMatch(/^\d/);
  });

  test('forceMode=demo skippt PIN-Login', async ({ page }) => {
    await openHub(page);
    // PIN-Login-Form ("Kürzel"-Input) darf NICHT sichtbar sein
    const kuerzelInput = page.locator('input[placeholder*="Kürzel"], input[name*="kuerzel"]');
    await expect(kuerzelInput).toHaveCount(0, { timeout: 3_000 });
  });

  test('Demo-Profil ist eingeloggt (Sidebar zeigt Modul-Buttons)', async ({ hubPage: page }) => {
    // Sidebar oder MobileTabBar sollten Modul-Icons zeigen
    const moduleNav = page.locator('.nav-item, .mobile-tab, [class*="module"]').first();
    await expect(moduleNav).toBeVisible({ timeout: 6_000 });
  });

  test('Modul-Buttons existieren: Connect, Plan, Buchung', async ({ hubPage: page }) => {
    // Mindestens drei Modul-Buttons sollten aus CONFIG.MODULES gerendert sein
    const navItems = page.locator('.nav-item');
    const count = await navItems.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('Keine kritischen Console-Errors beim Hub-Start', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(err.message));
    await openHub(page);
    await page.waitForTimeout(1_500);
    const critical = errors.filter(e =>
      !/favicon|manifest|Failed to load resource|cdn\.jsdelivr/i.test(e)
    );
    if (critical.length > 0) {
      console.log('Hub Console-Errors:', critical);
    }
    expect(critical).toEqual([]);
  });
});
