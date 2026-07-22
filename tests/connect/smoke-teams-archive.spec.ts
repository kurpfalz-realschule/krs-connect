import { test, expect, openConnect } from '../fixtures/connect';

/**
 * #8 — Teams archivieren / wiederherstellen / löschen
 *
 * DataService-Ebene (Demo): zuverlässiger als fragile UI. Prüft die Logik über
 * window.DataService(null) direkt — archive verschiebt aus getTeams() nach
 * getArchivedTeams(), restore kehrt es um, delete entfernt vollständig.
 */
test.describe('#8 Teams-Archivierung — DataService (Demo)', () => {
  test('archive → restore → delete verhalten sich korrekt', async ({ page }) => {
    await openConnect(page, { user: 'la' });

    const r = await page.evaluate(async () => {
      const DS = (window as any).DataService;
      const ds = new DS(null); // Demo-Modus
      const before = await ds.getTeams(1);
      const target = before[0];
      const archivedBefore = await ds.getArchivedTeams(1);

      await ds.archiveTeam(target.id);
      const activeAfterArchive = await ds.getTeams(1);
      const archivedAfterArchive = await ds.getArchivedTeams(1);

      await ds.restoreTeam(target.id);
      const activeAfterRestore = await ds.getTeams(1);
      const archivedAfterRestore = await ds.getArchivedTeams(1);

      const delTarget = activeAfterRestore[1];
      await ds.deleteTeam(delTarget.id);
      const afterDelete = await ds.getTeams(1);
      const archivedAfterDelete = await ds.getArchivedTeams(1);

      return {
        beforeCount: before.length,
        targetId: String(target.id),
        archivedBeforeCount: archivedBefore.length,
        activeAfterArchive: activeAfterArchive.map((t: any) => String(t.id)),
        archivedAfterArchive: archivedAfterArchive.map((t: any) => String(t.id)),
        activeAfterRestore: activeAfterRestore.map((t: any) => String(t.id)),
        archivedAfterRestoreCount: archivedAfterRestore.length,
        delId: String(delTarget.id),
        afterDelete: afterDelete.map((t: any) => String(t.id)),
        afterDeleteCount: afterDelete.length,
        archivedAfterDeleteCount: archivedAfterDelete.length,
      };
    });

    expect(r.beforeCount).toBeGreaterThan(1);
    expect(r.archivedBeforeCount).toBe(0);
    // Nach Archivieren: aus aktiv raus, in Archiv rein
    expect(r.activeAfterArchive).not.toContain(r.targetId);
    expect(r.archivedAfterArchive).toContain(r.targetId);
    // Nach Wiederherstellen: zurück in aktiv, Archiv leer
    expect(r.activeAfterRestore).toContain(r.targetId);
    expect(r.archivedAfterRestoreCount).toBe(0);
    // Nach Löschen: weder aktiv noch im Archiv
    expect(r.afterDelete).not.toContain(r.delId);
    expect(r.afterDeleteCount).toBe(r.beforeCount - 1);
    expect(r.archivedAfterDeleteCount).toBe(0);
  });
});

test.describe('#8 Teams-Archivierung — UI (Demo)', () => {
  test('Admin sieht Team-Verwaltung und kann archivieren; Archiv-Bereich erscheint', async ({ connectPage: page }) => {
    // Im Demo ist ein Team/Channel vorgewählt → Mitglieder-Button im Header.
    const membersBtn = page.getByRole('button', { name: /Mitglieder/ }).first();
    if (await membersBtn.count() === 0) {
      test.skip(true, 'Kein aktiver Channel/Mitglieder-Button — UI-Variante');
    }
    await membersBtn.click();

    const actions = page.getByTestId('team-admin-actions');
    await expect(actions).toBeVisible({ timeout: 6_000 });
    const archiveBtn = page.getByTestId('team-archive-btn');
    await expect(archiveBtn).toBeVisible();

    await archiveBtn.click();

    // Archiv-Bereich in der Team-Sidebar erscheint
    const section = page.getByTestId('archived-teams-section');
    await expect(section).toBeVisible({ timeout: 6_000 });
    await page.getByTestId('archived-teams-toggle').click();
    await expect(page.getByTestId('team-archived-item').first()).toBeVisible({ timeout: 4_000 });

    // Als globaler Admin (nk) sind Wiederherstellen/Löschen-Buttons sichtbar
    await expect(page.getByTestId('team-restore-btn').first()).toBeVisible();
  });
});
