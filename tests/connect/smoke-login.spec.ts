import { test, expect, openConnect, waitForAppReady, selectUser } from '../fixtures/connect';

test.describe('KRS Connect — Smoke: Login & Setup', () => {
  test('App lädt im Demo-Modus mit Version-Marker', async ({ page }) => {
    await openConnect(page);
    const version = await page.evaluate(() => window.KRS_VERSION);
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('forceMode=demo überspringt Magic-Link → UserSelection sichtbar', async ({ page }) => {
    await openConnect(page);
    // Setup-Screen ("KRS Connect" Header mit E-Mail-Input) darf NICHT sichtbar sein
    await expect(page.locator('input[type="email"]')).toHaveCount(0, { timeout: 6_000 });
    // Stattdessen: UserSelection
    await expect(page.locator('[data-screen="user-selection"]')).toBeVisible({ timeout: 6_000 });
  });

  test('forceUser=nk loggt automatisch als Norbert ein', async ({ page }) => {
    await openConnect(page, { user: 'nk' });
    await waitForAppReady(page);
    // Nach automatischem Login sollte die User-Auswahl weg sein
    await expect(page.locator('[data-screen="user-selection"]'))
      .toBeHidden({ timeout: 6_000 });
  });

  test('Keine kritischen Console-Errors beim Start', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(err.message));
    await openConnect(page);
    await page.waitForTimeout(1_500);
    // DOMPurify-CDN-Failover und Manifest-/Favicon-Errors ignorieren
    const critical = errors.filter(e =>
      !/favicon|manifest|DOMPurify|Failed to load resource/i.test(e)
    );
    if (critical.length > 0) {
      console.log('Unerwartete Console-Errors:', critical);
    }
    expect(critical).toEqual([]);
  });

  test('UserSelection: alle MOCK_USERS-Buttons haben data-user-id', async ({ page }) => {
    await openConnect(page);
    await expect(page.locator('[data-screen="user-selection"]')).toBeVisible();
    const userButtons = page.locator('[data-user-id]');
    const count = await userButtons.count();
    expect(count).toBeGreaterThanOrEqual(3); // mindestens 3 Mock-User
  });
});
