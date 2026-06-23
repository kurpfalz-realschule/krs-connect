# Übergabe — KRS Connect v4.8.0 · Mobile-Fixes + CDN-Hardening (22.06.2026)

## Warum
CI-Gate war rot (4 Tests „App nicht gemountet") + Mobile-Probleme gemeldet:
Teams unsichtbar (nur Kanäle), untere Leiste überladen.

## Änderungen (alles in `index.html`)

### 1. Mobile: Teams + Kanäle in EINEM Drawer
- **Bug:** Teams- und Kanäle-Spalte waren zwei `position:fixed`-Spalten, lagen
  auf dem Handy übereinander → nur Kanäle sichtbar.
- **Fix:** beide in `<div class="team-drawer">` gewrappt.
  - Desktop: `.team-drawer { display: contents }` → 3-Spalten-Layout unverändert.
  - Mobile: `.team-drawer` wird zum vertikal scrollenden Flex-Drawer; innere
    `.sidebar-content` werden `position: static`.

### 2. Mobile: Bottom-Bar entrümpelt
- Ausgeblendet auf Mobile: Logo, Versionstext, großer „📣 Feedback"-Button,
  Online-Zähler, Settings-Toggles (🔔 ✓✓ ⚙️ ❓ 🔒).
- Sichtbar: die 5 Nav-Icons (Teams, Chat, Suche, 🔖, Dateiablage) + Feedback (📣)
  + Profil + Abmelden.

### 3. Mobile: Einstieg ohne Kanal
- Der Hamburger erschien nur bei gewähltem Kanal → ohne Kanal kam man nicht an
  den Drawer. Neu: „☰ Team & Kanal wählen"-Button im Leerzustand (nur Mobile).

### 4. CDN-Hardening React/ReactDOM (Ursache rote CI)
- React/ReactDOM kamen nur von unpkg **ohne Fallback** → ein unpkg-Hänger ließ
  React nie laden, App mountete nicht (= die 4 roten Tests).
- Neu: parser-synchrone Fallback-Kette **unpkg → jsdelivr → cdnjs** (via
  `document.write`), plus klare Fehlermeldung statt endlosem Spinner, wenn alle
  CDNs versagen. (supabase-js + DOMPurify hatten schon Fallbacks.)

### Version
`KRS_VERSION` 4.7.2 → **4.8.0**.

## Tests
- Neu: `tests/connect/smoke-mobile-layout.spec.ts` (Drawer-Struktur + Bottom-Bar
  Sichtbarkeit, iPhone-Viewport 390×844).
- Bestehend: `tests/connect/smoke-dateiablage.spec.ts`.
- `playwright test --list` ✅ (4 Tests). `node --check` über App-Block ✅.
- Voller Browserlauf im **Test-&-Deploy-Gate** (Sandbox ohne Browser).

## Deploy
```
cd "/Users/nk/Downloads/Codex playground/teams 2.0 update macbook pro/krs-connect-deploy" && git add index.html tests/connect/smoke-mobile-layout.spec.ts UEBERGABE-2026-06-22-v4.8.0-Mobile-CDN.md && git commit -m "Mobile: Teams+Kanäle-Drawer, Bottom-Bar entrümpelt, Einstieg ohne Kanal + CDN-Fallback React (v4.8.0)" && git push origin main
```
Danach: Actions https://github.com/kurpfalz-realschule/krs-connect/actions →
bei Grün live https://kurpfalz-realschule.github.io/krs-connect/ (v4.8.0, ggf. Cmd+Shift+R).

## Offen / bewusst entschieden
- Admin-⚙️, Hilfe, Datenschutz, Toggles auf Mobile ausgeblendet (Entrümpelung).
  Falls auf dem Handy gebraucht → einzeln zurückholbar.
- Chat-Ansicht: gleicher „Einstieg-ohne-Auswahl"-Mechanismus ggf. noch prüfen.
