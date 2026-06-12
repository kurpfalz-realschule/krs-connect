import { test as base, expect, Page } from '@playwright/test';

export { expect };

/**
 * KRS Connect — Test-Fixture
 *
 * Lädt die App im Demo-Modus mit forceMode=demo. Der Override skippt den
 * Magic-Link-Login. Optional kann mit forceUser=<kuerzel> direkt ein User
 * eingeloggt werden (sonst wird der erste MOCK_USERS-Eintrag genutzt).
 */
export const CONNECT_PATH = process.env.CONNECT_PATH || '/index.html';

export async function openConnect(page: Page, opts: { user?: string } = {}) {
  const params = new URLSearchParams({ forceMode: 'demo' });
  if (opts.user) params.set('forceUser', opts.user);
  // Phase-7-Onboarding-Wizard (v4) überspringen — Modal würde sonst
  // alle Klicks abfangen. Eigene Onboarding-Tests entfernen den Key gezielt.
  await page.addInitScript(() => {
    try { localStorage.setItem('krs_onboarding_done', '1'); } catch (e) {}
  });
  await page.goto(`${CONNECT_PATH}?${params.toString()}`);

  // Warten bis App gemountet ist (Version-Marker)
  await page.waitForFunction(
    () => typeof window.KRS_VERSION === 'string',
    null,
    { timeout: 10_000 }
  );
}

/**
 * Wartet bis die App den Auth-Flow durchlaufen hat und das Haupt-Layout
 * sichtbar ist (entweder UserSelection oder Sidebar).
 */
export async function waitForAppReady(page: Page) {
  // Setup-Screen sollte weg sein, UserSelection ODER Sidebar sichtbar
  await expect(
    page.locator('[data-screen="user-selection"], aside, .app-layout, nav')
      .first()
  ).toBeVisible({ timeout: 10_000 });
}

/**
 * Wählt im UserSelection-Screen einen User per Kürzel.
 */
export async function selectUser(page: Page, kuerzel: string) {
  const btn = page.locator(`[data-user-kuerzel="${kuerzel}"]`).first();
  await expect(btn).toBeVisible({ timeout: 5_000 });
  await btn.click();
}

/**
 * Test mit Connect-Page als Fixture (Demo-Modus, automatischer User-Login).
 */
export const test = base.extend<{ connectPage: Page }>({
  connectPage: async ({ page }, use) => {
    await openConnect(page, { user: 'nk' }); // Norbert K. als Standard-Demo-User
    await use(page);
  },
});
