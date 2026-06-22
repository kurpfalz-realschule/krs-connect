import { test, expect, openConnect } from '../fixtures/connect';

/**
 * #9 — Team anlegen
 *
 * Hintergrund: createTeam() schluckte Fehler still (return null) → der Button
 * tat scheinbar nichts, wenn der teams-INSERT an RLS scheiterte. Fix:
 *  - createTeam wirft den Fehler jetzt (kein stilles null)
 *  - handleCreateTeam zeigt bei Erfolg/Fehler einen Toast
 *  - Server: zusätzliche INSERT-Policies teams/channels für globale Admins
 *
 * DataService-Ebene (Demo): zuverlässiger als fragile UI.
 */
test.describe('#9 Team anlegen — DataService (Demo)', () => {
  test('createTeam legt Team + Default-Kanal an und taucht in getTeams auf', async ({ page }) => {
    await openConnect(page, { user: 'nk' });

    const r = await page.evaluate(async () => {
      const DS = (window as any).DataService;
      const ds = new DS(null); // Demo-Modus
      const before = await ds.getTeams(1);
      const team = await ds.createTeam('Test-Fachschaft', 'E2E', 'TF', '#3b82f6', 1);
      const after = await ds.getTeams(1);
      const channels = await ds.getChannels(team.id);
      return {
        beforeCount: before.length,
        teamId: team ? String(team.id) : null,
        teamName: team ? team.name : null,
        afterIds: after.map((t: any) => String(t.id)),
        afterCount: after.length,
        channelNames: channels.map((c: any) => c.name),
      };
    });

    expect(r.teamId).toBeTruthy();
    expect(r.teamName).toBe('Test-Fachschaft');
    expect(r.afterCount).toBe(r.beforeCount + 1);
    expect(r.afterIds).toContain(r.teamId);
    // createTeam legt einen Default-Kanal "Allgemein" an
    expect(r.channelNames).toContain('Allgemein');
  });
});

test.describe('#9 Team anlegen — UI (Demo)', () => {
  test('Plus-Button öffnet Modal, Team wird erstellt und Erfolgs-Toast erscheint', async ({ connectPage: page }) => {
    const createBtn = page.getByRole('button', { name: /Neues Team erstellen/ }).first();
    if (await createBtn.count() === 0) {
      test.skip(true, 'Kein „Neues Team erstellen"-Button sichtbar — UI-Variante');
    }
    await createBtn.click();

    // Modal „Team erstellen"
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Team erstellen')).toBeVisible({ timeout: 6_000 });

    const nameInput = dialog.locator('input.form-input').first();
    await nameInput.fill('UI-Test-Team');

    await dialog.getByRole('button', { name: /Erstellen|Team erstellen|Speichern/ }).last().click();

    // Erfolgs-Toast (handleCreateTeam) — defensiv, falls Toast-Variante abweicht
    const toast = page.getByText(/erstellt/i).first();
    await expect(toast).toBeVisible({ timeout: 6_000 });
  });
});
