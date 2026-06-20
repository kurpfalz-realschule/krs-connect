import { test, expect } from '../fixtures/connect';

/**
 * Fix #9 + #6 (Nachrichten) — Direktnachrichten bearbeiten & löschen.
 *
 * Getestet über window.DataService im Demo-Modus (wie smoke-upload-validation),
 * unabhängig von fragilem UI-Markup. Deckt ab:
 *  - updateMessage ändert den Inhalt und setzt edited_at  → "(bearbeitet)"
 *  - deleteMessage entfernt die Nachricht dauerhaft
 */
test.describe('KRS Connect — DM bearbeiten & löschen', () => {
  test('updateMessage ändert Inhalt und setzt edited_at', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const DS = (window as any).DataService;
      if (!DS) return { ds: false };
      const ds = new DS(null); // null → isDemo = true
      const conv = 'e2e-conv-' + Date.now();
      const sent = await ds.sendMessage(conv, 1, 'Originaltext');
      if (!sent || !sent.id) return { ds: true, sent: false };
      const upd = await ds.updateMessage(sent.id, 'Geänderter Text');
      return {
        ds: true,
        sent: true,
        content: upd && upd.content,
        hasEditedAt: !!(upd && upd.edited_at),
      };
    });
    test.skip(res.ds === false, 'window.DataService nicht verfügbar');
    expect(res.sent).toBe(true);
    expect(res.content).toBe('Geänderter Text');
    expect(res.hasEditedAt).toBe(true);
  });

  test('deleteMessage entfernt die Nachricht dauerhaft', async ({ connectPage: page }) => {
    const res = await page.evaluate(async () => {
      const DS = (window as any).DataService;
      if (!DS) return { ds: false };
      const ds = new DS(null);
      const conv = 'e2e-conv-del-' + Date.now();
      const sent = await ds.sendMessage(conv, 1, 'Zu löschen');
      if (!sent || !sent.id) return { ds: true, sent: false };
      const del = await ds.deleteMessage(sent.id);
      // Nach dem Löschen darf updateMessage die ID nicht mehr finden → null
      const afterUpdate = await ds.updateMessage(sent.id, 'x');
      return { ds: true, sent: true, del, gone: afterUpdate === null };
    });
    test.skip(res.ds === false, 'window.DataService nicht verfügbar');
    expect(res.sent).toBe(true);
    expect(res.del).toBe(true);
    expect(res.gone).toBe(true);
  });
});
