import { test, expect, openConnect, waitForAppReady } from '../fixtures/connect';
import AxeBuilder from '@axe-core/playwright';

async function openFiles(page: import('@playwright/test').Page) {
  await page.locator('.list-item', { hasText: 'Kollegium' }).first().click();
  await page.locator('[data-testid="team-tab-links"]').first().click();
  await expect(page.locator('[data-testid="team-files-section"]')).toBeVisible();
}

test.describe('DATEI-01 — Team-Dateiablage UI', () => {
  test('T1 Dateien oben, Links darunter; Tab ist axe-sauber', async ({ connectPage: page }) => {
    await openFiles(page);
    await expect(page.locator('[data-testid="tf-item"]', { hasText: 'Elternabend 2026' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '🔗 Links zu anderen Ablagen' })).toBeVisible();
    await expect(page.locator('[data-testid="team-links-section"]')).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(axe.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  });

  test('T2 Ordner öffnen und per Brotkrume zurück', async ({ connectPage: page }) => {
    await openFiles(page);
    await page.locator('[data-testid="tf-item"]', { hasText: 'Elternabend 2026' }).locator('.tf-item-main').click();
    await expect(page.getByText('Ablauf Elternabend.txt', { exact: true })).toBeVisible();
    await page.locator('[data-testid="tf-crumb"]', { hasText: 'Dateiablage' }).click();
    await expect(page.getByText('Elternabend 2026', { exact: true })).toBeVisible();
  });

  test('T3 Textdatei im Viewer, ohne Weiterleiten', async ({ connectPage: page }) => {
    await openFiles(page);
    await page.getByText('Elternabend 2026', { exact: true }).click();
    await page.getByText('Ablauf Elternabend.txt', { exact: true }).click();
    await expect(page.locator('.fv-overlay')).toBeVisible();
    await expect(page.locator('.fv-overlay')).toContainText('Begrüßung');
    await expect(page.locator('.fv-overlay').getByText(/Weiterleiten/)).toHaveCount(0);
  });

  test('T4 mehrere Dateien hochladen', async ({ connectPage: page }) => {
    await openFiles(page);
    await page.locator('[data-testid="tf-file-input"]').setInputFiles([
      { name: 'eins.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF demo') },
      { name: 'zwei.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: Buffer.from('pptx') },
      { name: 'drei.txt', mimeType: 'text/plain', buffer: Buffer.from('Text') },
    ]);
    await expect(page.locator('[data-testid="tf-upload-panel"]')).toContainText('3 von 3 hochgeladen');
    for (const name of ['eins.pdf', 'zwei.pptx', 'drei.txt']) await expect(page.locator('[data-testid="tf-item"]', { hasText: name })).toBeVisible();
  });

  test('T5 Vorab-Prüfung überspringt SVG und zu große Datei', async ({ connectPage: page }) => {
    await openFiles(page);
    await page.evaluate(async () => {
      const svg = new File(['<svg/>'], 'bild.svg', { type: 'image/svg+xml' });
      const huge = new File([new Blob([new Uint8Array(50 * 1024 * 1024 + 1)])], 'gross.pdf', { type: 'application/pdf' });
      await (window as any).__krsTeamFilesEnqueue([{ file: svg, relPath: '' }, { file: huge, relPath: '' }]);
    });
    await expect(page.locator('[data-testid="tf-upload-row"][data-status="uebersprungen"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="tf-item"]', { hasText: 'bild.svg' })).toHaveCount(0);
    await expect(page.locator('[data-testid="tf-item"]', { hasText: 'gross.pdf' })).toHaveCount(0);
  });

  test('T6 Doppelname erhält (2)', async ({ connectPage: page }) => {
    await openFiles(page);
    const input = page.locator('[data-testid="tf-file-input"]');
    const file = { name: 'doppelt.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') };
    await input.setInputFiles(file); await expect(page.locator('[data-testid="tf-item"]', { hasText: 'doppelt.pdf' })).toBeVisible();
    await input.setInputFiles(file); await expect(page.locator('[data-testid="tf-item"]', { hasText: 'doppelt (2).pdf' })).toBeVisible();
  });

  test('T7 Ordnerpfade werden angelegt und beim zweiten Lauf wiederverwendet', async ({ connectPage: page }) => {
    await openFiles(page);
    const run = () => page.evaluate(async () => {
      await (window as any).__krsTeamFilesEnqueue([
        { file: new File(['a'], 'a.txt', { type: 'text/plain' }), relPath: 'Elternabend/Klasse 5/a.txt' },
        { file: new File(['b'], 'b.txt', { type: 'text/plain' }), relPath: 'Elternabend/Klasse 6/b.txt' },
      ]);
    });
    await run();
    await expect(page.getByText('Elternabend', { exact: true })).toBeVisible();
    await run();
    await expect(page.getByText('Elternabend (2)', { exact: true })).toHaveCount(0);
    await page.getByText('Elternabend', { exact: true }).click();
    await expect(page.getByText('Klasse 5', { exact: true })).toBeVisible();
    await expect(page.getByText('Klasse 6', { exact: true })).toBeVisible();
  });

  test('T8 Drag & Drop zeigt Overlay und lädt Datei', async ({ connectPage: page }) => {
    await openFiles(page);
    const transfer = await page.evaluateHandle(() => { const d = new DataTransfer(); d.items.add(new File(['drag'], 'gezogen.txt', { type: 'text/plain' })); return d; });
    const section = page.locator('[data-testid="team-files-section"]');
    await section.dispatchEvent('dragenter', { dataTransfer: transfer });
    await expect(page.locator('[data-testid="tf-dropzone"]')).toBeVisible();
    await section.dispatchEvent('drop', { dataTransfer: transfer });
    await expect(page.locator('[data-testid="tf-item"]', { hasText: 'gezogen.txt' })).toBeVisible();
  });

  test('T9 Ordner und Umbenennen mit Endungsschutz', async ({ connectPage: page }) => {
    await openFiles(page);
    await page.locator('[data-testid="tf-new-folder"]').click();
    await page.locator('[data-testid="tf-folder-name"]').fill('Test');
    await page.getByRole('button', { name: 'Anlegen' }).click();
    const folder = page.locator('[data-testid="tf-item"]', { hasText: 'Test' });
    await folder.locator('[data-testid="tf-rename"]').click();
    await page.locator('[data-testid="tf-rename-name"]').fill('Test 2');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Test 2', { exact: true })).toBeVisible();
    const file = page.locator('[data-testid="tf-item"]', { hasText: 'Konferenzprotokoll September.txt' });
    await file.locator('[data-testid="tf-rename"]').click();
    await page.locator('[data-testid="tf-rename-name"]').fill('Protokoll neu');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Protokoll neu.txt', { exact: true })).toBeVisible();
    await page.locator('[data-testid="tf-item"]', { hasText: 'Protokoll neu.txt' }).locator('[data-testid="tf-rename"]').click();
    await page.locator('[data-testid="tf-rename-name"]').fill('boese.exe');
    await expect(page.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  });

  test('T10 Rechte-Hook bildet Member und Admin korrekt ab', async ({ connectPage: page }) => {
    const r = await page.evaluate(() => {
      const h = (window as any).__krsTeamFileRights;
      const member = { id: 4 }, foreign = { id: 'f', kind: 'file', created_by: 2 }, own = { id: 'o', kind: 'file', created_by: 4 };
      const full = { id: 'd', kind: 'folder', created_by: 4 }, empty = { id: 'e', kind: 'folder', created_by: 4 };
      const all = [foreign, own, full, empty, { id: 'c', parent_id: 'd', kind: 'file', created_by: 4 }];
      return {
        foreign: [h.canEdit(foreign, member, false), h.canDelete(foreign, member, false, all)],
        own: [h.canEdit(own, member, false), h.canDelete(own, member, false, all)],
        full: [h.canEdit(full, member, false), h.canDelete(full, member, false, all)],
        empty: h.canDelete(empty, member, false, all), admin: h.canDelete(full, member, true, all)
      };
    });
    expect(r).toEqual({ foreign: [false, false], own: [true, true], full: [true, false], empty: true, admin: true });
  });

  test('T11 Admin löscht vollen Ordner mit korrektem Bestätigungstext', async ({ connectPage: page }) => {
    await openFiles(page);
    let text = '';
    page.once('dialog', async d => { text = d.message(); await d.accept(); });
    await page.locator('[data-testid="tf-item"]', { hasText: 'Elternabend 2026' }).locator('[data-testid="tf-delete"]').click();
    await expect(page.getByText('Elternabend 2026', { exact: true })).toHaveCount(0);
    expect(text).toBe('Ordner „Elternabend 2026“ mit 1 Datei und 0 Unterordnern endgültig löschen?');
  });

  test('T12 iOS blendet Ordner-Upload aus', async ({ page }) => {
    await page.addInitScript(() => { (window as any).__krsIsIOSDownload = () => true; });
    await openConnect(page, { user: 'la' }); await waitForAppReady(page); await openFiles(page);
    await expect(page.locator('[data-testid="tf-upload-folder"]')).toHaveCount(0);
  });

  test('T13 320 px ohne horizontalen Überlauf', async ({ connectPage: page }) => {
    await openFiles(page); await page.setViewportSize({ width: 320, height: 640 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('T14 Summenzeile aktualisiert sich nach Upload', async ({ connectPage: page }) => {
    await openFiles(page);
    await expect(page.locator('[data-testid="tf-summary"]')).toContainText('2 Dateien');
    await page.locator('[data-testid="tf-file-input"]').setInputFiles({ name: 'plus.txt', mimeType: 'text/plain', buffer: Buffer.from('12345') });
    await expect(page.locator('[data-testid="tf-summary"]')).toContainText('3 Dateien');
    await expect(page.locator('[data-testid="tf-summary"]')).toContainText('in diesem Team');
  });
});
