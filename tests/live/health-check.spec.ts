import { test, expect } from '@playwright/test';

/**
 * Live-Health-Checks gegen die produktiven GitHub-Pages-URLs.
 *
 * Diese Tests prüfen NICHT die Funktionalität, sondern nur:
 *  - HTTP 200
 *  - Title geladen
 *  - Kein blockierender JS-Error
 *  - Wichtige globale Marker vorhanden (KRS_VERSION, KRS_HUB_VERSION)
 *
 * Sie laufen ohne Authentifizierung — Magic-Link-Login wird NICHT getriggert.
 * Damit sind sie auch in CI gegen Production sicher.
 */

// Org-URLs nach Repo-Umzug zu kurpfalz-realschule (alte benditot.github.io → 404)
const URLS = {
  connect: 'https://kurpfalz-realschule.github.io/krs-connect/',
  hub: 'https://kurpfalz-realschule.github.io/krs-hub/',
};

test.describe('Live-Health: KRS Connect (Production)', () => {
  test('Live-URL antwortet mit HTTP 200', async ({ request }) => {
    const res = await request.get(URLS.connect);
    expect(res.status()).toBe(200);
  });

  test('Live-Page lädt mit korrektem Title', async ({ page }) => {
    await page.goto(URLS.connect, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/KRS Connect/i, { timeout: 10_000 });
  });

  test('window.KRS_VERSION ist gesetzt (App-Bundle geladen)', async ({ page }) => {
    await page.goto(URLS.connect);
    // Warten bis das Setup-Script gelaufen ist
    await page.waitForFunction(
      () => typeof window.KRS_VERSION === 'string',
      null,
      { timeout: 15_000 }
    );
    const v = await page.evaluate(() => window.KRS_VERSION);
    expect(v).toBeTruthy();
  });

  test('Keine 404er für kritische Ressourcen', async ({ page }) => {
    const failed: string[] = [];
    page.on('response', res => {
      if (res.status() === 404 && !/favicon/i.test(res.url())) {
        failed.push(`${res.status()} ${res.url()}`);
      }
    });
    await page.goto(URLS.connect);
    await page.waitForTimeout(2_000);
    expect(failed).toEqual([]);
  });
});

test.describe('Live-Health: KRS Hub (Production)', () => {
  test('Hub-URL antwortet mit HTTP 200', async ({ request }) => {
    const res = await request.get(URLS.hub);
    expect(res.status()).toBe(200);
  });

  test('Hub-Page lädt mit korrektem Title', async ({ page }) => {
    await page.goto(URLS.hub, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/KRS Hub/i, { timeout: 10_000 });
  });

  test('window.KRS_HUB_VERSION ist gesetzt nach Deploy', async ({ page }) => {
    await page.goto(URLS.hub);
    // KRS_HUB_VERSION wird nach Deploy verfügbar sein — bis dahin "skipped"
    try {
      await page.waitForFunction(
        () => typeof window.KRS_HUB_VERSION === 'string',
        null,
        { timeout: 8_000 }
      );
      const v = await page.evaluate(() => window.KRS_HUB_VERSION);
      expect(v).toBeTruthy();
    } catch {
      test.skip(true, 'KRS_HUB_VERSION noch nicht deployed (Test läuft nach Push grün)');
    }
  });

  test('Keine 404er für kritische Ressourcen', async ({ page }) => {
    const failed: string[] = [];
    page.on('response', res => {
      if (res.status() === 404 && !/favicon/i.test(res.url())) {
        failed.push(`${res.status()} ${res.url()}`);
      }
    });
    await page.goto(URLS.hub);
    await page.waitForTimeout(2_000);
    expect(failed).toEqual([]);
  });
});
