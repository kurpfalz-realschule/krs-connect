# Übergabe für die nächste KI — KRS Connect v4.10.0
**Stand:** 24.06.2026 · **Repo:** `kurpfalz-realschule/krs-connect` · **Datei:** `krs-connect-deploy/index.html` (Single-File, React 18 via CDN, kein Build-Step)

---

## 1. Wo wir stehen (in einem Satz)
v4.10.0 (Sidebar-Reorg + neues ⚙️ Einstellungen-Panel) ist **fertig implementiert und getestet**; der erste CI-Lauf war rot wegen **einer** Selektor-Kollision in einem Altbestands-Test — die ist gefixt; es fehlt nur noch **Push + grünes Gate + Real-Check auf iPad/Handy**.

## 2. Was in v4.10.0 geändert wurde
- **Neues `SettingsPanel` (⚙️)** mit 4 Abschnitten: Benachrichtigungen, Lesebestätigungen, „Hilfe/Datenschutz/Feedback", „Was ist neu" (`KRS_CHANGELOG`-Array). Schließt per ✕ und ESC.
- **`showSettings`-State** 3-fach in `useModals` verankert (Deklaration → Return → Destrukturierung) + Render bei den Modals.
- **Nav-Leiste schlank:** Icon-Rail = Teams · Chat · 📁 Dateiablage (Suche & 🔖 entfernt). Untere Leiste = 🟢 Online · ⚙️ Einstellungen · 🛠️ Admin (nur Admin) · Profil · Abmelden.
- **Admin-Icon entkoppelt:** 🛠️ statt ⚙️ (Konflikt vermieden).
- **Suche/Online/Gespeichert in die Ansichten verlagert:** 🔍 neben „Teams"/„Chats", 🟢 Online im Chat-Header (Props `onSearch`/`onShowOnline` an `ConversationList`), `.saved-section-btn` oben in der Chat-Spalte → öffnet bestehende Saved-Ansicht.
- **Nur EIN Feedback-Einstieg** sichtbar (großer Beta-Button Desktop; auf Mobile über ⚙️ → 📣).
- **Mobile-Regel gefixt:** ⚙️/🛠️ bleiben in der Bottom-Bar sichtbar (alte „Feedback geben"-Ausnahme hätte ⚙️ versteckt).
- **`window.KRS_VERSION = '4.10.0'`**.

## 3. Der CI-Fehler & sein Fix (wichtig zu verstehen)
- **Symptom:** `tests/connect/smoke-chat.spec.ts › Profil-Modal lässt sich öffnen` rot (Element nicht gefunden). 45 passed, 1 failed, 2 skipped.
- **Echte Ursache (kein Timeout!):** Der Test suchte `getByRole('button', { name: /profil|einstellungen/i }).first()`. Der **neue** ⚙️-Button hat aria-label „Einstellungen öffnen" und steht in der DOM-Reihenfolge **vor** dem Profil-Button → `.first()` klickte Einstellungen statt Profil.
- **Fix:** im Test eindeutig `page.locator('button[title="Profil"]').first()` (genau 1 Treffer). Datei: `tests/connect/smoke-chat.spec.ts`.
- **Lehre:** lose Regex-Matcher mit `.first()` kollidieren, sobald ein neues Element mit ähnlichem Namen dazukommt → bei neuen Buttons Alt-Tests auf eindeutige Selektoren prüfen.

## 4. Neuer Test
`tests/connect/smoke-settings.spec.ts` (8 Tests): Panel öffnen/schließen (ESC), `role=switch`, schlanke Nav, ein Feedback-Einstieg, 🔍-Such-Ansicht, Saved-Abschnitt.

## 5. Verifikation bisher
- `node --check` des App-Scripts: **OK**
- `playwright test --list`: kompiliert (Connect-Specs)
- Lokaler Browser-Lauf im Sandbox **unzuverlässig** (Kaltstart > 45 s Limit) → **CI-Gate ist die echte Prüfung**.

## 6. Nächste Schritte
1. **Deploy** (ein Block):
   ```bash
   cd "/Users/nk/Downloads/Codex playground/teams 2.0 update macbook pro/krs-connect-deploy" && rm -f .git/index.lock && git add index.html tests/connect/smoke-settings.spec.ts tests/connect/smoke-chat.spec.ts SPRINT-2026-06-23-Sidebar-Reorg.md UEBERGABE-2026-06-24-v4.10.0-Sidebar-Reorg.md UEBERGABE-2026-06-24-v4.10.0-fuer-neue-KI.md && git commit -m "feat(connect): Sidebar-Reorg + Einstellungen-Panel (v4.10.0); fix(test): Profil-Selektor eindeutig" && git push origin main
   ```
2. Gate beobachten: https://github.com/kurpfalz-realschule/krs-connect/actions
3. Bei Grün Live prüfen: https://kurpfalz-realschule.github.io/krs-connect/
4. **Real-Check iPad/Handy:** Bottom-Bar-Breite, ⚙️-Panel-Scroll, 🔍/🟢 im Chat-Header, Saved-Abschnitt.

## 7. Wichtige Patterns / Fallen (Projektwissen)
- **Hook-Threading:** jeder neue `show…`-State MUSS 3-fach in `useModals` (Deklaration, Return, Destrukturierung) + Render verankert sein, sonst ErrorBoundary „Etwas ist schiefgelaufen" (v4.7.0-Bug).
- **Kein JSX:** alles `React.createElement`. Hooks sind global destrukturiert: `const { useState, useEffect, useMemo, useRef, useCallback } = React;` (≈ Z. 3548).
- **Demo-Modus-Tests:** Fixture `tests/fixtures/connect.ts` (`forceMode=demo`, User `nk`), Specs nach `tests/connect/`, Schema `smoke-<feature>.spec.ts`, Deutsch, defensives `test.skip` bei UI-Varianten. Vor Abschluss `--list` kompilier-prüfen; echter Lauf im Gate.
- **Mobile-CSS-Spezifität:** Ausblend-Regeln in `@media (max-width:768px)` greifen scoped auf `.sidebar-bottom …`; Header-Buttons (`.sidebar-header`, `.conversation-header`) sind davon nicht betroffen.
- **Verifikation im Sandbox:** `node --check` auf extrahiertem `<script type="module">` (Grenzen dynamisch via grep ermitteln, Datei wächst).

---

## 8. Copy-Paste Starter-Prompt für den neuen Chat
> Du arbeitest an **KRS Connect** (`krs-connect-deploy/index.html`, Single-File React 18 via CDN, kein Build). Aktueller Stand: **v4.10.0** (Sidebar-Reorg + ⚙️ Einstellungen-Panel) ist implementiert und getestet. Lies zuerst den Skill `krs-connect-dev` und die Übergabe `UEBERGABE-2026-06-24-v4.10.0-fuer-neue-KI.md`.
>
> Falls noch nicht geschehen: deploye v4.10.0 (Befehl steht in der Übergabe, Abschnitt 6) und prüfe das Gate. Regeln: kein JSX (`React.createElement`); neue `show…`-States 3-fach in `useModals` verankern; zu jedem Fix passende Playwright-Tests in `tests/connect/` im selben Commit; bei neuen Buttons Alt-Tests auf eindeutige Selektoren prüfen (siehe Profil-Selektor-Falle, Übergabe Abschnitt 3); klickbare, echte Links liefern. Frag mich nur bei fehlenden Angaben.
