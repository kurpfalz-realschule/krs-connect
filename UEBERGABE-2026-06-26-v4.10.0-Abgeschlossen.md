# Übergabe — KRS Connect v4.10.0 · Sidebar-Reorg Abgeschlossen
**Datum:** 26.06.2026 · **Vorher:** v4.9.0 · **Aktuell:** v4.10.0 live
**Datei:** `krs-connect-deploy/index.html` (Single-File, React 18 via CDN)

## Was umgesetzt wurde (v4.10.0)

### 1. Neues ⚙️ Einstellungen-Panel (`SettingsPanel`)
- Vier Abschnitte: Benachrichtigungen (Toggle), Lesebestätigungen (Toggle), Hilfe/Datenschutz/Feedback, „Was ist neu" (Changelog v4.10.0…v4.7.0)
- Schließt per ✕-Button und ESC
- `showSettings`-State 3-fach verankert (Deklaration → Return → Destrukturierung in `useModals` + App-Render)

### 2. Nav-Leiste entrümpelt
- **Icon-Rail:** Teams · Chat · 📁 Dateiablage (Suche & 🔖 Saved entfernt)
- **Untere Leiste:** 🟢 Online · ⚙️ Einstellungen · 🛠️ Admin (nur Admin) · Profil · Abmelden
- Admin-Icon entkoppelt: 🛠️ statt ⚙️ (kein Konflikt)
- Nur ein Feedback-Einstieg: großer Beta-Button (Desktop) / ⚙️ → 📣 (Mobile)

### 3. Suche & Gespeichert in die Ansichten verlagert
- 🔍 neben Überschrift „Teams"/„Chats" (Props `onSearch`/`onShowOnline` an `ConversationList`)
- 🟢 Online im Chat-Header erreichbar
- 🔖 Gespeichert & gepinnt als eigener Abschnitt oben in der Chat-Spalte

### 4. Mobile
- ⚙️ + 🛠️ bleiben in der Bottom-Bar sichtbar (Mobile-Regel gefixt)
- Suche/Online/Feedback über Chat-Header bzw. ⚙️-Panel erreichbar

### 5. Version
`window.KRS_VERSION = '4.10.0'`

## Tests
- Neu: `tests/connect/smoke-settings.spec.ts` (8 Tests)
- Fix: `tests/connect/smoke-chat.spec.ts` — Profil-Selektor eindeutig (`button[title="Profil"]`) statt Regex mit `.first()`
- Alle 47 Connect-Tests passed, 2 skipped (48.6s)

## Verifikation erledigt

| Prüfung | Status | Details |
|---------|--------|---------|
| Deploy | ✅ | Commit `8e6789f` auf `origin/main` |
| CI-Gate | ✅ | Run 33: `conclusion: success` |
| Live-Version | ✅ | `window.KRS_VERSION = '4.10.0'` bestätigt |
| Playwright (lokal) | ✅ | 47 passed, 2 skipped |
| Node-Check | ✅ | `.tmp_app_check.mjs` syntax-clean |
| Real-Check Desktop | ✅ | Sidebar schlank, ⚙️-Panel öffnet, Changelog v4.10.0 sichtbar |
| Real-Check Mobile (375×812) | ✅ | Bottom-Bar zeigt ⚙️ + 🛠️ + Profil + Abmelden; keine Überladung |
| Real-Check iPad (768×1024) | ✅ | Layout passt, Panel scrollbar, Icons korrekt |
| Such-Ansicht | ✅ | 🔍 neben „Chats" öffnet „Suche"-Überschrift + Suchfeld |
| Saved-Abschnitt | ✅ | „Gespeichert & gepinnt" oben in Chat-Spalte sichtbar |

## Offen / nächster Sprint
Der aktuelle Sprint ist **abgeschlossen**. Nächste mögliche Themen (von Norbert zu priorisieren):

1. **v4.11.0 — Nachrichten-Suche** (🔍-Ansicht mit echter Filter-Logik statt Platzhalter?)
2. **v4.11.0 — Push-Benachrichtigungen** (⚙️-Panel hat Toggle, aber noch keine Backend-Integration)
3. **v4.11.0 — Echte Online-Status** (🟢-Button hat noch keine Live-Anzeige der User-Liste)
4. **Bugfix/Refactor** — Tech-Debt aus `index.html` (Code-Größe wächst, ggf. Split?)
5. **Nextcloud-Dateiablage** (📁 Dateiablage verweist aktuell auf iServ; eigene Ablage?)

## Wichtige Patterns (Projektwissen)
- **Hook-Threading:** jeder neue `show…`-State MUSS 3-fach in `useModals` verankert sein
- **Kein JSX:** alles `React.createElement`
- **Tests:** `tests/connect/smoke-<feature>.spec.ts`, Deutsch, defensives `test.skip`
- **Mobile-CSS:** `@media (max-width:768px)` scoped auf `.sidebar-bottom …`
- **Verifikation:** `node --check` auf extrahiertem `<script type="module">`

## Copy-Paste Starter-Prompt für den neuen Chat
> Du arbeitest an **KRS Connect** (`krs-connect-deploy/index.html`, Single-File React 18 via CDN, kein Build). Aktueller Stand: **v4.10.0** (Sidebar-Reorg + ⚙️ Einstellungen-Panel) ist **deployed, getestet und live**. Lies zuerst den Skill `krs-connect-dev` und die Übergabe `UEBERGABE-2026-06-26-v4.10.0-Abgeschlossen.md`.
>
> Der Sprint ist abgeschlossen. Frage den Benutzer nach dem **nächsten Sprint-Ziel** (v4.11.0). Regeln: kein JSX (`React.createElement`); neue `show…`-States 3-fach in `useModals` verankern; zu jedem Fix passende Playwright-Tests in `tests/connect/` im selben Commit; bei neuen Buttons Alt-Tests auf eindeutige Selektoren prüfen; klickbare, echte Links liefern. Frag mich nur bei fehlenden Angaben.
