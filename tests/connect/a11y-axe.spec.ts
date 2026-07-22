// tests/connect/a11y-axe.spec.ts
// Sprint A2 — Barrierefreiheit KRS Connect (WCAG 2.1 AA / BITV 2.0)
// Automatisierter Teil des A11y-Audits: axe-core über Playwright.
//
// Konvention (siehe CLAUDE.md / A11Y-SPEC.md):
//   - Demo-Modus über die Fixture tests/fixtures/connect.ts (forceMode=demo, User nk)
//   - je Hauptansicht EINE axe-Prüfung (Start, Feedback-Modal, Formular)
//   - Gate zählt nur impact 'critical' + 'serious' als Fehler; 'moderate'/'minor'
//     werden protokolliert, brechen den Lauf aber nicht.
//   - UI-abhängige Ansichten defensiv mit test.skip absichern.
//
// KEIN Dark-Mode-Test: KRS Connect hat nachweislich keinen Dark Mode
// (kein prefers-color-scheme, kein data-theme, kein Umschalter — geprüft am Code
// 21.07.2026, A11Y-SPEC.md Abschnitt 4). Ein Dark-Test liefe grün, ohne etwas zu
// prüfen. Sobald ein Dark Mode existiert, hier einen zweiten Lauf ergänzen.
//
// Voraussetzung: npm i -D @axe-core/playwright  (in package.json ergänzt)

import { test, expect } from '@playwright/test';
import { openConnect, waitForAppReady } from '../fixtures/connect';
import AxeBuilder from '@axe-core/playwright';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Führt eine axe-Analyse auf der aktuellen Seite aus und trennt kritische
 * Verstöße (Gate) von protokollierten (nicht blockierend).
 */
async function runAxe(page: import('@playwright/test').Page, kontext: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

  const critical = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  const minor = results.violations.filter(
    (v) => v.impact === 'moderate' || v.impact === 'minor' || v.impact == null,
  );

  if (minor.length) {
    // eslint-disable-next-line no-console
    console.log(
      `[a11y][${kontext}] ${minor.length} moderate/minor (nicht blockierend):\n` +
        minor.map((v) => `  - ${v.id} (${v.impact}): ${v.help}`).join('\n'),
    );
  }

  expect(
    critical,
    `[a11y][${kontext}] kritische/serious axe-Verstöße:\n` +
      JSON.stringify(
        critical.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.map((n) => n.target).slice(0, 5),
        })),
        null,
        2,
      ),
  ).toEqual([]);
}

test.describe('KRS Connect — WCAG 2.1 AA (axe-core)', () => {
  test('Startansicht hat keine kritischen axe-Verstöße', async ({ page }) => {
    await openConnect(page, { user: 'nk' });
    await waitForAppReady(page);
    await runAxe(page, 'connect/start');
  });

  test('Feedback-Modal ist axe-sauber (Rolle/Name/Kontrast)', async ({ page }) => {
    await openConnect(page, { user: 'nk' });
    await waitForAppReady(page);

    const trigger = page
      .getByRole('button', { name: /feedback|rückmeldung|melden/i })
      .first();
    if (!(await trigger.isVisible().catch(() => false))) {
      test.skip(true, 'Feedback-Auslöser in dieser UI-Variante nicht gefunden');
    }
    await trigger.click();

    const modal = page.locator('.feedback-modal, [role="dialog"]').first();
    await expect(modal).toBeVisible();
    await runAxe(page, 'connect/feedback-modal');
  });

  test('Beitrag-/Eingabeformular ist axe-sauber (Labels/Fehler)', async ({ page }) => {
    await openConnect(page, { user: 'nk' });
    await waitForAppReady(page);

    const input = page
      .locator('textarea, input[type="text"], [contenteditable="true"]')
      .first();
    if (!(await input.isVisible().catch(() => false))) {
      test.skip(true, 'Kein Eingabefeld in dieser UI-Variante sichtbar');
    }
    await input.click();
    await runAxe(page, 'connect/formular');
  });

  // A3 (22.07.2026): Startansicht ist Teams (mehrspaltig: Sidebar + Team-/
  // Kanal-Liste + Post-Feed). Die Chat-Ansicht hat eine ZWEITE, unabhängige
  // Mehrspalten-Struktur (Sidebar + Gespräch-Liste + Nachrichtenverlauf) und
  // war bisher nicht separat axe-geprüft — deckt die in A2b offen gelassene
  // Frage nach vollständiger axe-"region"-Abdeckung im mehrspaltigen Layout ab.
  test('Chat-Ansicht (zweite Mehrspalten-Struktur) ist axe-sauber', async ({ page }) => {
    await openConnect(page, { user: 'nk' });
    await waitForAppReady(page);

    const chatNav = page.locator('button[aria-label="Chats"]').first();
    if (!(await chatNav.isVisible().catch(() => false))) {
      test.skip(true, 'Chat-Navigation in dieser UI-Variante nicht gefunden');
    }
    await chatNav.click();
    await expect(page.locator('main#main')).toBeVisible();
    await runAxe(page, 'connect/chat');
  });
});
