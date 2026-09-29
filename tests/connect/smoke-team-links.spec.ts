import { test, expect } from '../fixtures/connect';

/**
 * Team-Dateiablage-Links (v4.12.0) — Demo-Modus
 *
 * Pro Team gespeicherte Links (z. B. OneDrive- oder Nextcloud-Ordner).
 * Ab 4.50.0 liegen sie im Datei-Tab zugeklappt unter den Dateien, nur zum
 * Öffnen. Ohne Links fehlt der Block. Anlegen läuft weiter über die Datenschicht.
 *
 * Logik wird bevorzugt über window.DataService(null) getestet (zuverlässiger
 * als fragiles UI), UI-Verhalten defensiv mit test.skip bei Varianten.
 */
test.describe('Team-Links — DataService-Logik (Demo)', () => {
  test('getTeamLinks liefert Demo-Links des Teams, sortiert nach sort_order', async ({ connectPage: page }) => {
    const links = await page.evaluate(async () => {
      const ds = new (window as any).DataService(null);
      return await ds.getTeamLinks(1);
    });
    expect(Array.isArray(links)).toBe(true);
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const l of links) {
      expect(l.team_id).toBe(1);
      expect(String(l.titel).length).toBeGreaterThan(0);
      expect(l.url).toMatch(/^https?:\/\//);
    }
    const orders = links.map((l: any) => l.sort_order);
    expect([...orders].sort((a: number, b: number) => a - b)).toEqual(orders);
  });

  test('createTeamLink legt an, updateTeamLink ändert, deleteTeamLink entfernt', async ({ connectPage: page }) => {
    const result = await page.evaluate(async () => {
      const ds = new (window as any).DataService(null);
      const created = await ds.createTeamLink(
        3,
        { titel: 'Testordner', url: 'https://example.org/ordner', beschreibung: 'E2E-Test', icon: '📁' },
        1
      );
      const nachAnlegen = await ds.getTeamLinks(3);
      const updated = await ds.updateTeamLink(created.id, { titel: 'Testordner NEU', url: 'https://example.org/neu' });
      // Normalizer-Check: nicht angefasste Felder überleben das Update
      const nachUpdate = (await ds.getTeamLinks(3)).find((l: any) => String(l.id) === String(created.id));
      const geloescht = await ds.deleteTeamLink(created.id);
      const nachLoeschen = await ds.getTeamLinks(3);
      return { created, anzahlNachAnlegen: nachAnlegen.length, updated, nachUpdate, geloescht, anzahlNachLoeschen: nachLoeschen.length };
    });
    expect(result.created).not.toBeNull();
    expect(result.created.created_by).toBe(1);
    expect(result.anzahlNachAnlegen).toBe(1);
    expect(result.updated.titel).toBe('Testordner NEU');
    expect(result.updated.url).toBe('https://example.org/neu');
    // Beschreibung & Icon wurden beim Update nicht mitgeschickt → müssen bleiben
    expect(result.nachUpdate.beschreibung).toBe('E2E-Test');
    expect(result.nachUpdate.icon).toBe('📁');
    expect(result.geloescht).toBe(true);
    expect(result.anzahlNachLoeschen).toBe(0);
  });

  test('URL-Validierung: nur http/https — javascript:, ftp:, data: und leer werden abgelehnt', async ({ connectPage: page }) => {
    const r = await page.evaluate(async () => {
      const ds = new (window as any).DataService(null);
      const vorher = (await ds.getTeamLinks(1)).length;
      const badJs = await ds.createTeamLink(1, { titel: 'Böse', url: 'javascript:alert(1)' }, 1);
      const badFtp = await ds.createTeamLink(1, { titel: 'FTP', url: 'ftp://server/datei' }, 1);
      const badData = await ds.createTeamLink(1, { titel: 'Data', url: 'data:text/html,hi' }, 1);
      const badLeer = await ds.createTeamLink(1, { titel: 'Leer', url: '' }, 1);
      const badKeinTitel = await ds.createTeamLink(1, { titel: '   ', url: 'https://example.org' }, 1);
      const badUpdate = await ds.updateTeamLink('tl1', { url: 'javascript:alert(2)' });
      const nachher = (await ds.getTeamLinks(1)).length;
      const helper = {
        https: (window as any).__krsIsSafeHttpUrl('https://krs.sh-schulen.de'),
        http: (window as any).__krsIsSafeHttpUrl('http://intranet.local/ordner'),
        js: (window as any).__krsIsSafeHttpUrl('javascript:alert(1)'),
      };
      return { vorher, badJs, badFtp, badData, badLeer, badKeinTitel, badUpdate, nachher, helper };
    });
    expect(r.badJs).toBeNull();
    expect(r.badFtp).toBeNull();
    expect(r.badData).toBeNull();
    expect(r.badLeer).toBeNull();
    expect(r.badKeinTitel).toBeNull();
    expect(r.badUpdate).toBeNull();
    // Keine der abgelehnten Anfragen darf einen Link erzeugt haben
    expect(r.nachher).toBe(r.vorher);
    expect(r.helper.https).toBe(true);
    expect(r.helper.http).toBe(true);
    expect(r.helper.js).toBe(false);
  });
});

test.describe('Team-Links — zugeklappt unter den Dateien (Demo)', () => {
  test('Vorhandene Links öffnen sich erst nach dem Aufklappen', async ({ connectPage: page }) => {
    const teamBtn = page.locator('.list-item', { hasText: 'Kollegium' }).first();
    if (await teamBtn.count() === 0) {
      test.skip(true, 'Team „Kollegium" nicht gefunden — UI-Variante');
    }
    await teamBtn.click();

    const tab = page.locator('[data-testid="team-tab-links"]').first();
    if (await tab.count() === 0) {
      test.skip(true, 'Dateiablage-Tab nicht gefunden — UI-Variante');
    }
    await tab.click();

    await expect(page.locator('[data-testid="team-files-section"]')).toBeVisible();
    const legacy = page.locator('[data-testid="team-links-legacy"]');
    await expect(legacy).toBeVisible();
    await expect(legacy).not.toHaveAttribute('open');
    await expect(page.locator('[data-testid="team-link-add"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="team-link-edit"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="team-link-delete"]')).toHaveCount(0);

    await page.locator('[data-testid="team-links-summary"]').click();
    const firstLink = page.locator('[data-testid="team-link-item"]').first().locator('a').first();
    await expect(firstLink).toBeVisible();
    await expect(firstLink).toHaveAttribute('target', '_blank');
    await expect(firstLink).toHaveAttribute('rel', /noopener/);
    expect(await firstLink.getAttribute('href')).toMatch(/^https?:\/\//);
  });

  test('Ein Team ohne gespeicherte Links zeigt den Block nicht', async ({ connectPage: page }) => {
    const teamBtn = page.locator('.list-item', { hasText: 'Informatik Fachschaft' }).first();
    if (await teamBtn.count() === 0) {
      test.skip(true, 'Team „Informatik Fachschaft" nicht gefunden — UI-Variante');
    }
    await teamBtn.click();
    await page.locator('[data-testid="team-tab-links"]').first().click();
    await expect(page.locator('[data-testid="team-files-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="team-links-legacy"]')).toHaveCount(0);
  });
});
