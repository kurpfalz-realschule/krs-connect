# Übergabe — KRS Connect v4.8.1 · ECHTER Bugfix (22.06.2026)

## Kurz: Ursache der roten CI gefunden — meine erste Diagnose war falsch
Ich hatte „flaky CDN" vermutet. **Das stimmte nicht.** Der Playwright-Report
(Ordner `playwright-report-connect`, Trace) zeigte den echten Fehler:

```
ReferenceError: showFiles is not defined   (App, index.html, Nav-Button)
ErrorBoundary caught: ReferenceError: showFiles is not defined
```

→ Die App fing den Fehler in der Error-Boundary ab und zeigte „Etwas ist
schiefgelaufen". Deshalb waren `nav`/`.app-layout` nie da und die 4 Tests rot.
React/CDN waren nie das Problem.

## Die Ursache
Beim Einbau der Dateiablage (v4.7.0) habe ich `const [showFiles, setShowFiles]`
in den Custom-Hook **`useModals()`** gelegt — aber **nicht** in dessen
`return { … }`-Objekt aufgenommen und **nicht** in `App` destrukturiert.
Ergebnis: `showFiles` war im Render von `App` undefiniert → ReferenceError.

`node --check` und `playwright test --list` finden das NICHT (reiner Syntax-/
Kompiliercheck). Nur ein echter Browserlauf (= das CI-Gate) deckt es auf.

## Der Fix (v4.8.1)
`showFiles, setShowFiles` an beiden fehlenden Stellen ergänzt — exakt wie das
funktionierende `showFeedbackBoard`:
- `useModals()` → `return { … showFiles, setShowFiles, … }`
- `App` → `const { … showFiles, setShowFiles, … } = modals;`

Damit ist die Variable jetzt 3-fach konsistent: Deklaration + Hook-Return +
Destrukturierung. `node --check` ✅.

## Was aus v4.8.0 erhalten bleibt (war ok, nur durch den Crash verdeckt)
- Mobile: Teams+Kanäle in gemeinsamem `.team-drawer` (Überlappung behoben).
- Mobile: Bottom-Bar entrümpelt (nur Wichtigstes sichtbar).
- Mobile: „☰ Team & Kanal wählen"-Einstieg ohne ausgewählten Kanal.
- CDN-Fallback React/ReactDOM (unpkg→jsdelivr→cdnjs). Schadet nicht, war aber
  NICHT die Ursache — ehrlichkeitshalber.

## Verifikation
- CI-Trace eindeutig als Ursache identifiziert; Fix ist die 1:1-Spiegelung des
  funktionierenden Musters.
- Lokaler Browserlauf im Sandbox nicht möglich (Chrome ohne System-Libs/Root).
  **Echte Verifikation = CI-Gate.** Dort laufen smoke-dateiablage +
  smoke-mobile-layout jetzt mit.

## Lektion (für CLAUDE.md / nächste Sessions)
- `--list`/`node --check` ≠ Test. Runtime-Fehler (ReferenceError im Render)
  zeigt nur der echte Gate-Lauf. Vor „fertig" das Gate abwarten oder lokal
  mit Browser laufen.
- State immer komplett durch den Hook fädeln: Deklaration → return → Destrukturierung.

## Deploy
```
cd "/Users/nk/Downloads/Codex playground/teams 2.0 update macbook pro/krs-connect-deploy" && git add index.html UEBERGABE-2026-06-22-v4.8.1-Bugfix-showFiles.md && git commit -m "fix(connect): showFiles im useModals-Return + App-Destrukturierung (behebt ReferenceError/ErrorBoundary) v4.8.1" && git push origin main
```
Danach: Actions https://github.com/kurpfalz-realschule/krs-connect/actions →
bei Grün live https://kurpfalz-realschule.github.io/krs-connect/ (v4.8.1).
