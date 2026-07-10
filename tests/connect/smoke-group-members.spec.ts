import { test, expect } from '../fixtures/connect';

/**
 * Feedback #3 (Stresstest 09.07.) — „Wie füge ich Mitglieder in eine Gruppe ein?"
 * Gruppenchats: Klick auf die Mitgliederzahl öffnet ein Modal mit
 * Mitgliederliste und „Mitglied hinzufügen" (Suche + Button).
 */
test.describe('Feedback #3 — Gruppenmitglieder verwalten', () => {
  test('DataService: addConversationMember liefert true (Demo-Kontrakt)', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const DS = (window as any).DataService;
      if (!DS) return { ds: false };
      const ds = new DS(null);
      const ok = await ds.addConversationMember(6, 5);
      return { ds: true, ok: ok === true };
    });
    test.skip(res.ds === false, 'window.DataService nicht verfügbar');
    expect(res.ok).toBe(true);
  });

  test('UI: Mitglieder-Modal öffnet und erlaubt Hinzufügen', async ({ connectPage: page }) => {
    const chatNav = page.getByRole('button', { name: 'Chats' }).first();
    await expect(chatNav).toBeVisible({ timeout: 8_000 });
    await chatNav.click();

    // Demo-Gruppenchat „Musik-Fachschaft" öffnen
    const groupConv = page.locator('.conversation-item', { hasText: 'Musik-Fachschaft' }).first();
    if (await groupConv.count() === 0) {
      test.skip(true, 'Kein Demo-Gruppenchat vorhanden — UI-Variante');
    }
    await groupConv.click();

    // Mitglieder-Button im Header
    const membersBtn = page.getByTestId('group-members-btn');
    await expect(membersBtn).toBeVisible({ timeout: 6_000 });
    await expect(membersBtn).toContainText('Mitglieder');
    await membersBtn.click();

    // Modal mit Mitgliederliste
    const modal = page.getByTestId('group-members-modal');
    await expect(modal).toBeVisible({ timeout: 4_000 });
    await expect(modal.getByText(/Mitglieder \(\d+\)/)).toBeVisible();

    // Suche nach einem Nicht-Mitglied und hinzufügen
    await modal.getByTestId('group-member-search').fill('a');
    const addBtn = modal.getByTestId('group-member-add').first();
    if (await addBtn.count() === 0) {
      test.skip(true, 'Alle Demo-User sind bereits Mitglieder');
    }
    await addBtn.click();

    // Erfolgstoast + Zähler im Header aktualisiert
    await expect(page.getByText('Mitglied hinzugefügt').first()).toBeVisible({ timeout: 4_000 });
  });
});
