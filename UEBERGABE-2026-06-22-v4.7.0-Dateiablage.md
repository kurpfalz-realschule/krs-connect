# Übergabe — KRS Connect v4.7.0 · Dateiablage-Button (22.06.2026)

## Was gebaut wurde
Linker Sidebar-Button **„Dateiablage"** (Ordner-Icon), der die vom Beta-Team
erwartete OneDrive-artige Ablage **imitiert** und bewusst kommuniziert:
- Hinweis: eigene Dateiablage wird **mit Nextcloud nachgerüstet** (in Arbeit).
- Bis dahin: Button **„iServ-Dateiablage öffnen"** → `https://krs.sh-schulen.de/iserv/file`
  (neuer Tab, Login mit iServ-Zugang).

Es ist ein **Platzhalter/Modal**, keine echte Dateifunktion — genau wie gewünscht.

## Geänderte Stellen (alles in `index.html`)
| Stelle | Änderung |
|--------|----------|
| `Icons` | neues `files`-SVG (Ordner) |
| App-State | `const [showFiles, setShowFiles] = useState(false)` |
| Komponente | `FilesPlaceholderModal` + `const ISERV_FILES_URL` |
| Sidebar-Nav | 5. `nav-item`-Button „Dateiablage" (nach 🔖), öffnet Modal |
| Modal-Render | `showFiles && React.createElement(FilesPlaceholderModal, …)` |
| Version | `KRS_VERSION` 4.6.0 → **4.7.0** (Update-Banner hängt daran) |

## Tests
- Neu: `tests/connect/smoke-dateiablage.spec.ts` (2 Specs):
  Button sichtbar → Modal öffnet → Nextcloud-Hinweis + exakter iServ-Link
  (`target=_blank`, `rel=noopener`); Schließen-Button schließt Modal.
- `playwright test --list` ✅ kompiliert (2 Tests). Voller Browserlauf läuft im
  **Test-&-Deploy-Gate** (lokaler Sandbox hat keine Browser installiert).
- JS-Syntax des App-Skriptblocks per `node --check` ✅.

## Selbst-Review (Sicherheit / A11y / iPad)
- **Sicherheit:** `rel="noopener noreferrer"` gegen Tabnabbing; nur statischer
  Inhalt, kein User-Input, `dangerouslySetInnerHTML` nur für statische SVG-Konstanten.
- **A11y:** Modal `role=dialog`/`aria-modal`/`aria-label`; ESC schließt; Button &
  Schließen mit `aria-label`; echter `<a>`-Link mit Klartext.
- **iPad/Mobile:** Link-Touch-Target 48px (> WCAG 44px); Mobile-Rail trägt 5 Icons
  via `justify-content: space-around` problemlos.

## Deploy
Datei ist bereits `index.html` (kein Copy-Schritt nötig). Push im Terminal:

```
cd "/Users/nk/Downloads/Codex playground/teams 2.0 update macbook pro/krs-connect-deploy" && git add index.html tests/connect/smoke-dateiablage.spec.ts UEBERGABE-2026-06-22-v4.7.0-Dateiablage.md && git commit -m "Dateiablage-Button (iServ jetzt, Nextcloud folgt) v4.7.0 + Smoke-Test" && git push origin main
```

Nach Grün live unter https://kurpfalz-realschule.github.io/krs-connect/
(ggf. Cmd+Shift+R wegen HTTP-Cache; Sidebar zeigt „v4.7.0").

## Später (wenn Nextcloud steht)
Modal-Inhalt ersetzen durch echte Ablage-Anbindung — Plan liegt in
`planung-iserv-nextcloud/05-dateien-nextcloud-statt-onedrive.md`
(serverseitige Upload-Funktion via WebDAV, kein Secret im Frontend).
