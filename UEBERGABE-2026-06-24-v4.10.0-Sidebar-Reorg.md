# Übergabe — KRS Connect v4.10.0 · Sidebar-Reorg & Einstellungen-Panel
**Datum:** 24.06.2026 · **Vorher:** v4.9.0 · **Datei:** `krs-connect-deploy/index.html`

## Was umgesetzt wurde

### 1. Neues ⚙️ Einstellungen-Panel (`SettingsPanel`)
Eigene Komponente (vor `PrivacyModal`) mit vier Abschnitten:
- **🔔 Benachrichtigungen** — Schalter (`role=switch`), nutzt `toggleNotifications`
- **✓✓ Lesebestätigungen** — Schalter, nutzt `toggleReadReceipts`
- **❓ Hilfe, Datenschutz & Feedback** — öffnet Hilfe-Panel, Datenschutz-Modal, Feedback-Board
- **🆕 Was ist neu** — Changelog-Array `KRS_CHANGELOG` (v4.10.0 … v4.7.0)

Schließt per ✕-Button **und** ESC. `showSettings`-State 3-fach verankert
(Deklaration in `useModals` → Return → Destrukturierung) + Render bei den Modals.

### 2. Nav-Leiste entrümpelt
- Icon-Rail jetzt schlank: **Teams · Chat · 📁 Dateiablage** (Suche & 🔖 Saved entfernt).
- Untere Leiste: **🟢 Online · ⚙️ Einstellungen · 🛠️ Admin** (nur Admin) **· Profil · Abmelden**.
  Entfernt: 🔔/🔕, ✓✓, ❓, kleines 📣, 🔒 (alle jetzt im ⚙️-Panel).
- **Admin-Icon entkoppelt:** 🛠️ statt ⚙️ (kein Konflikt mit Einstellungen).
- **Nur ein Feedback-Einstieg** sichtbar: großer Beta-Button (Desktop) bzw.
  ⚙️ → 📣 Feedback (Mobile/alle).

### 3. Suche & Gespeichert in die Ansichten verlagert
- **🔍 neben Überschrift** „Teams" (teamsView) und „Chats" (ConversationList,
  neue Props `onSearch`/`onShowOnline`).
- **🟢 Online** zusätzlich im Chat-Spalten-Header erreichbar.
- **🔖 Gespeichert & gepinnt** als eigener Abschnitt oben in der Chat-Spalte
  (`.saved-section-btn`) → öffnet die bestehende Saved-Ansicht.

### 4. Mobile
- Mobile-Regel angepasst: ⚙️ + 🛠️ bleiben in der Bottom-Bar sichtbar
  (vorher hätte die alte „Feedback geben"-Ausnahme das ⚙️ versteckt → gefixt).
- Online/Suche/Feedback auf Mobile über Chat-Header bzw. ⚙️-Panel erreichbar.

### 5. Version
`window.KRS_VERSION = '4.10.0'`.

## Tests
Neu: `tests/connect/smoke-settings.spec.ts` (8 Tests) — Panel öffnen/schließen (ESC),
Schalter, schlanke Nav, ein Feedback-Einstieg, 🔍-Such-Ansicht, Saved-Abschnitt.
Kompiliert (`--list` ok). Echter Lauf = **CI-Gate** (lokaler Browser im Sandbox unzuverlässig).

## Verifikation erledigt
- `node --check` des App-Scripts: **OK**
- `playwright test --list`: **8 Tests**, Einzeltest grün
- Hook-Threading, Icon-Entkopplung, Mobile-Sichtbarkeit, Changelog-Reihenfolge geprüft

## Offen / nächster Real-Check
Nach grünem Gate: **iPad/Handy** prüfen — Bottom-Bar-Breite, ⚙️-Panel-Scroll,
🔍/🟢 im Chat-Header, Saved-Abschnitt.
