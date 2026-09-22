import { test, expect } from '../fixtures/connect';

/**
 * S15 (22.09.2026, P0) — „wenn ich eine nachricht auf dem iphone lese in
 * einem team/forum, geht der punkt (1) nicht weg der ungelesenen Nachricht
 * sondern bleibt." (Norbert, wörtlich)
 *
 * Befund (siehe HANDOVER.md Abschnitt 0AD/0AE, sprint sonnet teams 2.0.md
 * Abschnitt „S15"): vier unabhängige Client-Fehler U1–U4, kein Server-/
 * RLS-Problem. Fix: ein zentraler useEffect (Kontrakt: ein Kanal gilt als
 * gelesen, solange er ausgewählt UND document.visibilityState === 'visible'
 * ist) plus zwei Wurzel-Fixes in handleTeamSelect (U1) und
 * handleUserSelected (U2), damit der Punkt beim automatisch ausgewählten
 * ersten Kanal nicht erst nachträglich verschwindet.
 *
 * Hinweis zur Testbarkeit (ehrlich benannt): Der Demo-Modus (MOCK_CHANNELS)
 * berechnet die Ungelesen-Badges bei JEDEM Laden neu aus einer statischen
 * Zahl — er kennt kein persistentes „gelesen"-Konto wie channel_reads in
 * Supabase. Ein Seiten-Reload setzt Demo-Badges deshalb immer auf ihren
 * Ausgangswert zurück, unabhängig vom Fix; das lässt sich nur gegen echtes
 * Supabase zeigen (Live-Gerätetest siehe HANDOVER.md). Innerhalb einer
 * Seite (ohne Reload) ist der Fix aber vollständig nachweisbar: sofortiges
 * Verschwinden beim automatisch ausgewählten ersten Kanal (U1) und das
 * Nachschieben des Lesestands bei neuen Beiträgen im offenen Kanal (U3),
 * beides über den localStorage-Zeitstempel `krs-lastread-ch-<id>`, den
 * markChannelRead in JEDEM Modus (Demo wie live) schreibt.
 */

test.describe('S15: Ungelesen-Punkt — Handy-Schubfach (Demo)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function drawerOeffnen(page) {
    await page.locator('.mobile-menu-btn').first().click();
    await expect(page.locator('.team-drawer.mobile-open')).toHaveCount(1);
  }

  test('a) U1: Team antippen markiert den automatisch ausgewählten ersten Kanal sofort als gelesen', async ({ connectPage: page }) => {
    // "FAQ und Infos" (Kanal-ID 2, unread: 3 im Demo-Datensatz) im Team
    // "Kollegium" (ID 1) an Position 0 rücken — über den DataService-Test-Hook
    // (window.DataService, wie in smoke-post-edit.spec.ts), damit der
    // automatisch ausgewählte erste Kanal beim Antippen des Teams tatsächlich
    // ungelesene Beiträge hat (im Original-Demo-Datensatz ist "Allgemein"
    // immer Kanal 0 mit unread:0 — das würde den Fehler nicht auslösen).
    await page.evaluate(async () => {
      const DS = (window as any).DataService;
      const ds = new DS(null);
      await ds.updateChannel(2, { position: -1 });
    });

    await drawerOeffnen(page);
    const team = page.locator('[data-testid="team-visible"]').filter({ hasText: 'Kollegium' }).locator('[data-testid="team-toggle"]');
    await expect(team).toBeVisible({ timeout: 8_000 });
    await team.click();

    const children = page.locator('[data-testid="team-children"]');
    await expect(children).toBeVisible({ timeout: 8_000 });
    const firstChannel = children.locator('[data-testid="team-child-channel"]').first();
    await expect(firstChannel).toContainText('FAQ und Infos');
    // Kein Punkt am ersten (automatisch ausgewählten) Kanal — sofort, ohne
    // Nachladen oder Warten (das war U1: der Punkt blieb hier hängen).
    await expect(firstChannel.locator('.unread-badge')).toHaveCount(0);
  });

  test('b) Kanal antippen markiert sofort als gelesen und schreibt den Lesestand', async ({ connectPage: page }) => {
    await drawerOeffnen(page);
    const team = page.locator('[data-testid="team-visible"]').filter({ hasText: 'Kollegium' }).locator('[data-testid="team-toggle"]');
    await team.click();
    const children = page.locator('[data-testid="team-children"]');
    await expect(children).toBeVisible({ timeout: 8_000 });

    const kanal = children.locator('[data-testid="team-child-channel"]').filter({ hasText: 'SMV' });
    await expect(kanal.locator('.unread-badge')).toHaveCount(1);
    await kanal.click();
    await expect(kanal.locator('.unread-badge')).toHaveCount(0);

    const lastRead = await page.evaluate(() => {
      try { return localStorage.getItem('krs-lastread-ch-7'); } catch (e) { return null; }
    });
    expect(lastRead).toBeTruthy();
  });

  test('d) Gegenprobe: ein nicht angetippter Kanal behält seinen Punkt', async ({ connectPage: page }) => {
    await drawerOeffnen(page);
    const team = page.locator('[data-testid="team-visible"]').filter({ hasText: 'Kollegium' }).locator('[data-testid="team-toggle"]');
    await team.click();
    const children = page.locator('[data-testid="team-children"]');
    await expect(children).toBeVisible({ timeout: 8_000 });

    // "SMV" antippen — nur dieser Kanal darf seinen Punkt verlieren.
    const smv = children.locator('[data-testid="team-child-channel"]').filter({ hasText: 'SMV' });
    await smv.click();

    // "Kollegialer Austausch" (unread: 1) wurde nicht angetippt — sein Punkt
    // muss stehen bleiben. Ohne diese Gegenprobe ließe sich der Fehler auch
    // "beheben", indem man die Punkte pauschal abschaltet.
    const kollegialerAustausch = children.locator('[data-testid="team-child-channel"]').filter({ hasText: 'Kollegialer Austausch' });
    await expect(kollegialerAustausch.locator('.unread-badge')).toHaveCount(1);
  });
});

test.describe('S15: Ungelesen-Punkt — zentraler Effekt (Demo, Rechner-Ansicht)', () => {
  test('c) U3: Ein neuer Beitrag im offenen Kanal schiebt den Lesestand nach', async ({ connectPage: page }) => {
    // Team "Kollegium" ist nach dem Login bereits ausgewählt (erstes Team im
    // Demo-Datensatz) — die Kanalspalte steht also sofort.
    const kanalSpalte = page.locator('.sidebar-channels .sidebar-list');
    const smv = kanalSpalte.locator('button').filter({ hasText: 'SMV' });
    await expect(smv).toBeVisible({ timeout: 8_000 });
    await smv.click();
    await expect(smv.locator('.unread-badge')).toHaveCount(0);

    const t1 = await page.evaluate(() => {
      try { return localStorage.getItem('krs-lastread-ch-7'); } catch (e) { return null; }
    });
    expect(t1).toBeTruthy();

    // Kurz warten, damit ein neuer ISO-Zeitstempel sich vom ersten unterscheidet.
    await page.waitForTimeout(30);

    // Einen Beitrag im GEOFFNETEN Kanal veröffentlichen (entspricht "ein
    // Beitrag läuft ein, während man den Kanal offen hat" — U3). Der
    // zentrale Effekt hängt an posts.length, nicht an der Post-Quelle,
    // deshalb prüft das denselben Codepfad wie eine echte Realtime-Nachricht.
    const compactBar = page.getByText(/Beitrag schreiben/i).first();
    await expect(compactBar).toBeVisible({ timeout: 8_000 });
    await compactBar.click();
    const editor = page.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 5_000 });
    const marker = 'S15-Test ' + Date.now();
    await editor.click();
    await editor.fill(marker);
    const publishBtn = page.locator('button:has-text("Posten")').first();
    await publishBtn.click();
    await expect(page.locator('.post-content', { hasText: marker })).toBeVisible({ timeout: 5_000 });

    const t2 = await page.evaluate(() => {
      try { return localStorage.getItem('krs-lastread-ch-7'); } catch (e) { return null; }
    });
    expect(t2).toBeTruthy();
    expect(new Date(t2 as string).getTime()).toBeGreaterThan(new Date(t1 as string).getTime());
  });
});
