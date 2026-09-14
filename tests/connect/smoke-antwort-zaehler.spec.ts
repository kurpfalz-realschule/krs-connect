// tests/connect/smoke-antwort-zaehler.spec.ts
// v4.22.0 — Antwort-Zähler am Beitrag (Rückmeldung Kollegium, 14.09.2026)
//
// Der Bug: `getPosts` lieferte die Beitragszeilen roh aus Supabase; die Anzahl
// der Antworten steht dort nicht (`parent_id` hängt an der Antwort). Der Feed
// zeigte deshalb IMMER „Antworten (0)" — dass ein Beitrag schon Antworten hat,
// sah man erst nach dem Öffnen des Threads.
//
// Dieser Test hält zwei Dinge fest:
//   1. Beiträge MIT Antworten zeigen die Anzahl im Knopf ("2 Antworten").
//   2. Eine neu geschriebene Antwort erhöht den Zähler sofort — ohne Neuladen.
//
// Demo-Modus reicht: die Zähl-Logik selbst (attachReplyCounts) ist gegen echte
// Live-Zeilen geprüft, hier geht es um die Anzeige und das Hochzählen im UI.

import { test, expect } from '@playwright/test';
import { openConnect, waitForAppReady } from '../fixtures/connect';

test.describe('KRS Connect — Antwort-Zähler am Beitrag', () => {
  test.beforeEach(async ({ page }) => {
    await openConnect(page, { user: 'la' });
    await waitForAppReady(page);
  });

  test('Beitrag mit Antworten zeigt die Anzahl, Beitrag ohne Antworten nicht', async ({ page }) => {
    const buttons = page.locator('.post-footer button');
    await expect(buttons.first()).toBeVisible({ timeout: 10_000 });
    const texte = await buttons.allInnerTexts();

    // Mindestens ein Beitrag im Demo-Kanal hat Antworten → Zahl muss sichtbar sein.
    const mitZahl = texte.filter((t) => /\d+\s+Antwort(en)?/.test(t));
    expect(mitZahl.length, `Kein Beitrag zeigt eine Antwortzahl: ${JSON.stringify(texte)}`)
      .toBeGreaterThan(0);

    // Und kein Knopf darf mehr die alte Null-Schreibweise zeigen.
    expect(texte.some((t) => t.includes('(0)'))).toBe(false);
  });

  test('Eigene Antwort erhöht den Zähler sofort (ohne Neuladen)', async ({ page }) => {
    const ersterKnopf = page.locator('.post-footer button').first();
    await expect(ersterKnopf).toBeVisible({ timeout: 10_000 });
    const vorher = await ersterKnopf.innerText();
    const zahlVorher = Number((vorher.match(/(\d+)\s+Antwort/) || [0, '0'])[1]);

    await ersterKnopf.click();
    const editor = page.locator('.thread-panel [contenteditable="true"], .thread-panel textarea').first();
    await expect(editor).toBeVisible({ timeout: 5_000 });
    await editor.click();
    await editor.type('Testantwort aus dem Smoke-Test');
    const senden = page
      .locator('.thread-panel button:has-text("Senden"), .thread-panel button[type="submit"]')
      .first();
    await senden.click();
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');

    const nachher = await page.locator('.post-footer button').first().innerText();
    const zahlNachher = Number((nachher.match(/(\d+)\s+Antwort/) || [0, '0'])[1]);
    expect(zahlNachher, `vorher "${vorher}" → nachher "${nachher}"`).toBe(zahlVorher + 1);
  });
});
