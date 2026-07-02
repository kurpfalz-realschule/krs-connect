import { test, expect } from '../fixtures/connect';

/**
 * Team-Dateiablage-Links (v4.12.0) — Demo-Modus
 *
 * Pro Team pflegbare, benannte Links (z. B. iServ-/Nextcloud-Ordner) im
 * Dateiablage-Tab des Teams. Kein eigener Datei-Speicher — nur Verweise.
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

test.describe('Team-Links — UI (Demo)', () => {
  test('Dateiablage-Tab im Team zeigt Links als klickbare http-Links (target _blank, rel noopener)', async ({ connectPage: page }) => {
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

    const section = page.locator('[data-testid="team-links-section"]').first();
    await expect(section).toBeVisible({ timeout: 5_000 });

    const items = page.locator('[data-testid="team-link-item"]');
    await expect(items.first()).toBeVisible({ timeout: 5_000 });

    const firstLink = items.first().locator('a').first();
    await expect(firstLink).toHaveAttribute('target', '_blank');
    await expect(firstLink).toHaveAttribute('rel', /noopener/);
    const href = await firstLink.getAttribute('href');
    expect(href).toMatch(/^https?:\/\//);

    // Hinzufügen-Button für Team-Mitglieder sichtbar
    await expect(page.locator('[data-testid="team-link-add"]').first()).toBeVisible();
  });

  test('Link über das Formular anlegen: mehrere Felder ausfüllen, alle Werte kommen an (Stale-Closure-Check)', async ({ connectPage: page }) => {
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

    await page.locator('[data-testid="team-link-add"]').first().click();
    const dialog = page.locator('.modal-overlay[aria-label="Link hinzufügen"]').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Bewusst MEHRERE Felder nacheinander füllen — deckt die Stale-Closure-
    // Falle auf (Felder dürfen sich nicht gegenseitig überschreiben).
    await dialog.locator('[data-testid="team-link-titel"]').fill('E2E-Ordner');
    await dialog.locator('[data-testid="team-link-url"]').fill('https://example.org/e2e');
    await dialog.locator('[data-testid="team-link-beschreibung"]').fill('Vom Test angelegt');

    await dialog.getByRole('button', { name: 'Speichern' }).click();
    await expect(dialog).toHaveCount(0, { timeout: 5_000 });

    const neu = page.locator('[data-testid="team-link-item"]', { hasText: 'E2E-Ordner' }).first();
    await expect(neu).toBeVisible({ timeout: 5_000 });
    await expect(neu).toContainText('Vom Test angelegt');
    await expect(neu.locator('a').first()).toHaveAttribute('href', 'https://example.org/e2e');
  });

  test('Ungültige URL blockiert das Speichern (Button deaktiviert, Inline-Hinweis)', async ({ connectPage: page }) => {
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

    await page.locator('[data-testid="team-link-add"]').first().click();
    const dialog = page.locator('.modal-overlay[aria-label="Link hinzufügen"]').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await dialog.locator('[data-testid="team-link-titel"]').fill('Böser Link');
    await dialog.locator('[data-testid="team-link-url"]').fill('javascript:alert(1)');

    await expect(dialog.getByRole('button', { name: 'Speichern' })).toBeDisabled();
    await expect(dialog).toContainText(/http:\/\/ oder https:\/\//);
  });

  test('Dateiablage-Modal (Sidebar) zeigt weiterhin iServ-Hinweis und zusätzlich den Team-Links-Bereich', async ({ connectPage: page }) => {
    // Erst Team wählen, damit das Modal die Team-Links kennt
    const teamBtn = page.locator('.list-item', { hasText: 'Kollegium' }).first();
    if (await teamBtn.count() === 0) {
      test.skip(true, 'Team „Kollegium" nicht gefunden — UI-Variante');
    }
    await teamBtn.click();

    const navBtn = page.locator('button[aria-label="Dateiablage"]').first();
    if (await navBtn.count() === 0) {
      test.skip(true, 'Dateiablage-Nav-Button nicht gefunden — UI-Variante');
    }
    await navBtn.click();

    const dialog = page.locator('.modal-overlay[aria-label="Dateiablage"]').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    // Bestehender Platzhalter (v4.7.0) bleibt erhalten …
    await expect(dialog).toContainText(/Nextcloud/i);
    await expect(dialog.locator('a[target="_blank"]').first()).toHaveAttribute('href', 'https://krs.sh-schulen.de');
    // … und der neue Team-Links-Bereich erscheint darunter
    await expect(dialog.locator('[data-testid="team-links-section"]').first()).toBeVisible({ timeout: 5_000 });
  });
});
