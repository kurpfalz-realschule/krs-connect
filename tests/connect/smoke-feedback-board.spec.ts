import { test, expect, openConnect } from '../fixtures/connect';

/**
 * #12 — Feedback-Board (Beta)
 *
 * Speicher: Supabase-Tabelle feedback (Demo: MOCK_FEEDBACK). Sichtbar für alle
 * App-User; Status (offen → in_arbeit → erledigt) nur Admin.
 */
test.describe('#12 Feedback-Board — DataService (Demo)', () => {
  test('submitFeedback fügt ein, updateFeedbackStatus ändert Status, ungültiger Status wird abgelehnt', async ({ page }) => {
    await openConnect(page, { user: 'nk' });

    const r = await page.evaluate(async () => {
      const DS = (window as any).DataService;
      const ds = new DS(null); // Demo
      const before = await ds.getFeedback();
      const created = await ds.submitFeedback({ userId: 1, name: 'Test', category: 'bug', rating: 3, message: 'E2E-Eintrag' });
      // Status SOFORT festhalten: im Demo ist `created` dieselbe Referenz wie im
      // Store, ein späteres updateFeedbackStatus würde created.status mitmutieren.
      const createdStatus = created.status;
      const after = await ds.getFeedback();

      // Status-Wechsel
      const upd = await ds.updateFeedbackStatus(created.id, 'erledigt');

      // ungültiger Status muss werfen
      let invalidThrew = false;
      try { await ds.updateFeedbackStatus(created.id, 'quatsch'); } catch (e) { invalidThrew = true; }

      return {
        beforeCount: before.length,
        afterCount: after.length,
        firstId: String(after[0]?.id),
        createdId: String(created.id),
        createdStatus: createdStatus,
        updStatus: upd?.status,
        invalidThrew,
      };
    });

    expect(r.afterCount).toBe(r.beforeCount + 1);
    expect(r.createdStatus).toBe('offen');         // neues Feedback startet offen
    expect(r.firstId).toBe(r.createdId);           // neuestes zuerst (sortiert)
    expect(r.updStatus).toBe('erledigt');
    expect(r.invalidThrew).toBe(true);
  });
});

test.describe('#12 Feedback-Board — UI (Demo)', () => {
  test('Großer Beta-Button öffnet das Board; Einträge sichtbar; Admin sieht Status-Auswahl', async ({ connectPage: page }) => {
    const betaBtn = page.locator('.beta-feedback-btn').first();
    if (await betaBtn.count() === 0) {
      test.skip(true, 'Beta-Feedback-Button nicht sichtbar — UI-Variante');
    }
    await betaBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Feedback-Board')).toBeVisible({ timeout: 6_000 });

    // Mindestens ein Feedback-Eintrag (Demo-Seed)
    await expect(page.locator('.fb-item').first()).toBeVisible({ timeout: 6_000 });

    // nk ist Admin → Status-Dropdown sichtbar
    await expect(page.locator('.fb-status-select').first()).toBeVisible();
  });
});
