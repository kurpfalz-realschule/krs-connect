import { test, expect } from '../fixtures/connect';

/**
 * Team-Termine (v4.12.0) — Demo-Modus
 *
 * Einfache Termin-Liste pro Team (Tab „📅 Termine" neben Beiträgen und
 * Dateiablage): kommende Termine aufsteigend, vergangene ausklappbar.
 * Bewusst KEIN Vollkalender (keine Wiederholungen, keine Erinnerungen).
 *
 * Logik über window.DataService(null), UI defensiv mit test.skip.
 */
test.describe('Team-Termine — DataService-Logik (Demo)', () => {
  test('getTeamTermine liefert Termine aufsteigend nach Datum/Uhrzeit', async ({ connectPage: page }) => {
    const termine = await page.evaluate(async () => {
      const ds = new (window as any).DataService(null);
      return await ds.getTeamTermine(1);
    });
    expect(Array.isArray(termine)).toBe(true);
    expect(termine.length).toBeGreaterThanOrEqual(3);
    for (const t of termine) {
      expect(t.team_id).toBe(1);
      expect(t.datum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(String(t.titel).length).toBeGreaterThan(0);
    }
    const schluessel = termine.map((t: any) => t.datum + 'T' + (t.uhrzeit || '00:00'));
    expect([...schluessel].sort()).toEqual(schluessel);
  });

  test('createTeamTermin validiert Pflichtfelder: ohne Titel oder mit falschem Datum kein Termin', async ({ connectPage: page }) => {
    const r = await page.evaluate(async () => {
      const ds = new (window as any).DataService(null);
      const vorher = (await ds.getTeamTermine(1)).length;
      const ohneTitel = await ds.createTeamTermin(1, { titel: '  ', datum: '2026-09-01' }, 1);
      const falschesDatum = await ds.createTeamTermin(1, { titel: 'Test', datum: '01.09.2026' }, 1);
      const ohneDatum = await ds.createTeamTermin(1, { titel: 'Test', datum: '' }, 1);
      const falscheUhrzeit = await ds.createTeamTermin(1, { titel: 'Test', datum: '2026-09-01', uhrzeit: 'abends' }, 1);
      const nachher = (await ds.getTeamTermine(1)).length;
      return { vorher, ohneTitel, falschesDatum, ohneDatum, falscheUhrzeit, nachher };
    });
    expect(r.ohneTitel).toBeNull();
    expect(r.falschesDatum).toBeNull();
    expect(r.ohneDatum).toBeNull();
    expect(r.falscheUhrzeit).toBeNull();
    expect(r.nachher).toBe(r.vorher);
  });

  test('Anlegen, Bearbeiten (Felder überleben Teil-Update — Normalizer-Check) und Löschen', async ({ connectPage: page }) => {
    const r = await page.evaluate(async () => {
      const ds = new (window as any).DataService(null);
      const created = await ds.createTeamTermin(
        3,
        { titel: 'Fachschaftssitzung', datum: '2027-03-10', uhrzeit: '14:30', ort: 'Raum 12', beschreibung: 'Themen folgen' },
        1
      );
      // Teil-Update: nur der Ort ändert sich — alle anderen Felder müssen bleiben
      const updated = await ds.updateTeamTermin(created.id, { ort: 'Musiksaal' });
      const nachUpdate = (await ds.getTeamTermine(3)).find((t: any) => String(t.id) === String(created.id));
      const geloescht = await ds.deleteTeamTermin(created.id);
      const anzahlNachLoeschen = (await ds.getTeamTermine(3)).length;
      return { created, updated, nachUpdate, geloescht, anzahlNachLoeschen };
    });
    expect(r.created).not.toBeNull();
    expect(r.created.uhrzeit).toBe('14:30');
    expect(r.created.created_by).toBe(1);
    expect(r.updated.ort).toBe('Musiksaal');
    expect(r.nachUpdate.titel).toBe('Fachschaftssitzung');
    expect(r.nachUpdate.datum).toBe('2027-03-10');
    expect(r.nachUpdate.uhrzeit).toBe('14:30');
    expect(r.nachUpdate.beschreibung).toBe('Themen folgen');
    expect(r.geloescht).toBe(true);
    expect(r.anzahlNachLoeschen).toBe(0);
  });

  test('Uhrzeit ist optional: Termin ohne Uhrzeit wird angelegt', async ({ connectPage: page }) => {
    const r = await page.evaluate(async () => {
      const ds = new (window as any).DataService(null);
      const created = await ds.createTeamTermin(3, { titel: 'Ganztagestermin', datum: '2027-05-01' }, 2);
      const ok = created && created.uhrzeit === '';
      if (created) await ds.deleteTeamTermin(created.id);
      return { created: !!created, ok };
    });
    expect(r.created).toBe(true);
    expect(r.ok).toBe(true);
  });
});

test.describe('Team-Termine — UI (Demo)', () => {
  test('Termine-Tab zeigt kommende Termine; vergangene sind ausklappbar', async ({ connectPage: page }) => {
    const teamBtn = page.locator('.list-item', { hasText: 'Kollegium' }).first();
    if (await teamBtn.count() === 0) {
      test.skip(true, 'Team „Kollegium" nicht gefunden — UI-Variante');
    }
    await teamBtn.click();

    const tab = page.locator('[data-testid="team-tab-termine"]').first();
    if (await tab.count() === 0) {
      test.skip(true, 'Termine-Tab nicht gefunden — UI-Variante');
    }
    await tab.click();

    const section = page.locator('[data-testid="team-termine-section"]').first();
    await expect(section).toBeVisible({ timeout: 5_000 });

    // Kommende Termine sichtbar (Demo-Daten liegen relativ zu heute in der Zukunft)
    const kommende = page.locator('[data-testid="termin-item"]');
    await expect(kommende.first()).toBeVisible({ timeout: 5_000 });

    // Vergangene erst nach Ausklappen sichtbar
    const pastToggle = page.locator('[data-testid="termine-past-toggle"]').first();
    if (await pastToggle.count() === 0) {
      test.skip(true, 'Kein vergangener Demo-Termin vorhanden — UI-Variante');
    }
    await expect(page.locator('[data-testid="termin-item-past"]')).toHaveCount(0);
    await pastToggle.click();
    const vergangen = page.locator('[data-testid="termin-item-past"]').first();
    await expect(vergangen).toBeVisible({ timeout: 5_000 });
    await expect(vergangen).toContainText('Pädagogischer Tag');
  });

  test('Termin über das Formular anlegen: mehrere Felder, alle Werte kommen an (Stale-Closure-Check)', async ({ connectPage: page }) => {
    const teamBtn = page.locator('.list-item', { hasText: 'Kollegium' }).first();
    if (await teamBtn.count() === 0) {
      test.skip(true, 'Team „Kollegium" nicht gefunden — UI-Variante');
    }
    await teamBtn.click();
    const tab = page.locator('[data-testid="team-tab-termine"]').first();
    if (await tab.count() === 0) {
      test.skip(true, 'Termine-Tab nicht gefunden — UI-Variante');
    }
    await tab.click();

    await page.locator('[data-testid="team-termin-add"]').first().click();
    const dialog = page.locator('.modal-overlay[aria-label="Termin anlegen"]').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Ohne Titel+Datum bleibt Speichern deaktiviert (Pflichtfelder)
    await expect(dialog.getByRole('button', { name: 'Speichern' })).toBeDisabled();

    // Datum ein Jahr in der Zukunft, damit der Termin sicher unter „Kommende" fällt
    const zukunft = await page.evaluate(() => {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      return (window as any).__krsLocalDateStr(d);
    });

    // Bewusst MEHRERE Felder nacheinander füllen (Stale-Closure-Falle)
    await dialog.locator('[data-testid="team-termin-titel"]').fill('E2E-Konferenz');
    await dialog.locator('[data-testid="team-termin-datum"]').fill(zukunft);
    await dialog.locator('[data-testid="team-termin-uhrzeit"]').fill('15:45');
    await dialog.locator('[data-testid="team-termin-ort"]').fill('Aula');
    await dialog.locator('[data-testid="team-termin-beschreibung"]').fill('Vom Test angelegt');

    await dialog.getByRole('button', { name: 'Speichern' }).click();
    await expect(dialog).toHaveCount(0, { timeout: 5_000 });

    const neu = page.locator('[data-testid="termin-item"]', { hasText: 'E2E-Konferenz' }).first();
    await expect(neu).toBeVisible({ timeout: 5_000 });
    await expect(neu).toContainText('15:45');
    await expect(neu).toContainText('Aula');
    await expect(neu).toContainText('Vom Test angelegt');
  });
});
