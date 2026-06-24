# Sprint-Handover — KRS Connect · Sidebar-Reorg & Einstellungen (23.06.2026)

**Ziel-Version:** v4.10.0
**Ausgangsstand:** v4.9.0 live (Senden-Pfeil, Chat neueste oben, Drag&Drop im Chat)
**Datei:** `krs-connect-deploy/index.html` (Single-File, React 18 via CDN)

## Auslöser (Norbert-Feedback)
Linke Leiste ist überladen; Feedback-Button doppelt; einige Funktionen gehören
woanders hin. Aufräumen + neue „Einstellungen"-Ansicht.

## Entscheidungen (bestätigt)
- **Einstellungen:** eigenes neues **⚙️-Panel** (nicht ins Profil integriert).
- **Gespeichert & gepinnt:** **oben in der Chat-Ansicht** (über der Konversationsliste),
  nicht in der Nav-Leiste.

## Move-Map (was wohin)
| Element | Vorher | Nachher |
|---|---|---|
| 🔍 Suche | Nav-Leiste (Icon-Rail) | Button **neben Überschrift** „Teams"/„Chats" |
| 🔖 Gespeichert/gepinnt | Nav-Leiste | **Oben in der Chat-Spalte** (eigener Abschnitt) |
| 🟢 Wer ist online | nur Leiste unten | zusätzlich **in der Chat-Ansicht** erreichbar |
| 🔔 Benachrichtigungen | Leiste unten | **⚙️ Einstellungen** |
| ✓✓ Lesebestätigungen | Leiste unten | **⚙️ Einstellungen** |
| ❓ Hilfe & Tipps | Leiste unten | **⚙️ Einstellungen** |
| 🆕 „Was ist neu" (Changelog) | – | **⚙️ Einstellungen** (Versionsliste) |
| 🔒 Datenschutz | Leiste unten | ⚙️ Einstellungen (mit einsortiert) |
| 📣 Feedback | 2× (großer Button + kleiner 📣) | **1×**, gut sichtbar; Dublette raus |
| Nav-Leiste danach | Teams, Chat, Suche, 🔖, 📁 | **Teams, Chat, 📁 Dateiablage** (schlank) |
| Leiste unten danach | viele Icons | online, **⚙️ Einstellungen**, 🛠️ Admin*, Profil, Abmelden |

\* Admin nur für Rolle admin; Emoji ggf. 🛠️ statt ⚙️, damit kein Konflikt mit Einstellungen.

## Umsetzung (Reihenfolge / Tasks)
1. **SettingsPanel (⚙️)** als neue Komponente: Abschnitte Benachrichtigungen,
   Lesebestätigungen, Hilfe/Tipps, „Was ist neu". `showSettings`-State **an 3
   Stellen** durch `useModals` fädeln (Deklaration → return → Destrukturierung;
   siehe Skill `hook-state-threading-drift`). Changelog-Daten als kleines Array.
2. **Nav-Leiste entrümpeln:** Suche- + Saved-Nav-Item entfernen; sidebar-bottom:
   🔔/✓✓/❓ + kleines 📣 entfernen; ⚙️-Einstellungen-Button ergänzen; Admin-Icon
   entkoppeln; nur **ein** Feedback-Einstieg.
3. **In den Ansichten:** 🔍 neben „Teams" und „Chats"; Online-Zugang im Chat-Header;
   Abschnitt „🔖 Gespeichert & gepinnt" oben in der Chat-Spalte.
4. **Mobile-Check:** Bottom-Bar bleibt schlank; neue ⚙️/🔍-Einstiege dürfen sie
   nicht wieder überladen (Regeln aus v4.8.x beachten, Skill
   `css-mobile-override-spezifitaet`).

## Risiken / Achtung
- **Hook-Threading** (häufigste Falle, siehe v4.7.0-Bug): jeden neuen State
  3-fach verankern, sonst ErrorBoundary „Etwas ist schiefgelaufen".
- **Admin- vs. Einstellungen-⚙️** nicht verwechseln (verschiedene Icons/Handler).
- **Mobile-Spezifität** bei neuen Ausblend-Regeln (`.sidebar .x`).
- Verifikation: lokaler Browser im Sandbox nicht möglich → **CI-Gate** ist die
  echte Prüfung. Bei Rot zuerst den Report-Trace lesen (Skill `ci-report-trace-zuerst`).

## Definition of Done
- Leiste schlank (Teams/Chat/Dateiablage), nur 1 Feedback-Einstieg.
- ⚙️ Einstellungen öffnet Panel mit allen 4 Abschnitten inkl. Changelog.
- 🔍 neben Überschrift; Gespeichert oben im Chat; Online im Chat erreichbar.
- `KRS_VERSION = '4.10.0'`; Gate grün; danach Real-Check auf iPad/Handy.

## Deploy
```
cd "/Users/nk/Downloads/Codex playground/teams 2.0 update macbook pro/krs-connect-deploy" && rm -f .git/index.lock && git add index.html SPRINT-2026-06-23-Sidebar-Reorg.md && git commit -m "feat(connect): Sidebar-Reorg + Einstellungen-Panel (v4.10.0)" && git push origin main
```
Actions: https://github.com/kurpfalz-realschule/krs-connect/actions ·
Live: https://kurpfalz-realschule.github.io/krs-connect/
