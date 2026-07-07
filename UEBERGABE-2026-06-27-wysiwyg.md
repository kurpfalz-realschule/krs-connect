# Übergabe — KRS Connect: WYSIWYG-Editor, Sortierung & Paste-Cleaner

**Datum:** 27.06.2026
**App:** KRS Connect (`krs-connect-deploy/index.html`) — Single-File React 18 via CDN, kein Build, `React.createElement` (kein JSX)
**Repo:** `git@github.com:kurpfalz-realschule/krs-connect.git` (Org-Repo, SSH)
**Live:** https://kurpfalz-realschule.github.io/krs-connect/
**Aktueller Stand:** v4.10.4 — committet als `5818996`

---

## Status auf einen Blick

| Version | Inhalt | Commit | Live? |
|---|---|---|---|
| v4.10.1 | Paste-Formatierung + Bild-Paste (Beitrags-Editor) | `eb28b96` | ✅ war grün |
| v4.10.2 | Chat-Übersicht nach Aktivität sortiert (Teams: zuletzt aktiv oben), Feed chronologisch (neueste unten) | `c35a60e` | ✅ |
| v4.10.3 | Word/Outlook-Paste aggressiv bereinigen (Span-Suppe + Müll-Styles raus) | `2579fc9` | ✅ |
| **v4.10.4** | **WYSIWYG-Eingabe überall (Chat, Antwort, Bearbeiten) + Chat rendert sanitisiertes HTML; Enter sendet; 4 Review-Fixes** | **`5818996`** | ⏳ **committet, Push offen** |

> **Offen:** Nur noch der Push von v4.10.4. Alles davor ist gepusht und live.

### Push (nur Norbert, 1 Befehl)
```
cd "/Users/nk/Downloads/Codex playground/teams 2.0 update macbook pro/krs-connect-deploy" && git push origin main
```
Danach Gate prüfen → https://github.com/kurpfalz-realschule/krs-connect/actions — bei Grün automatisch live.

---

## Was in v4.10.4 gemacht wurde

Das WYSIWYG-Feld (`MentionTextarea`, contentEditable) steckte bisher nur im Beitrags-Editor. Jetzt überall:

| Bereich | Vorher | Jetzt |
|---|---|---|
| Beitrag schreiben | WYSIWYG | WYSIWYG |
| Antwort (Thread) | einfaches `<textarea>` | WYSIWYG + Formatierleiste |
| Beitrag bearbeiten | einfaches `<textarea>` | WYSIWYG |
| Chat schreiben | reines `<input type=text>` | WYSIWYG, Chat-Bubble rendert sanitisiertes HTML |
| Chat-Nachricht bearbeiten | einfaches `<textarea>` | WYSIWYG |

**Neue Bausteine in `index.html`:**
- `htmlToText(html)` (DOMParser, sicher) — für Chat-Vorschau, Benachrichtigungen, gespeicherte Titel → nirgends rohe Tags.
- `MentionTextarea` erweitert: Props `onEnter` (Enter sendet, Shift+Enter = Zeilenumbruch) und `editorRef` (externer Ref, für Emoji-Insert im Chat).
- Sortier-Helfer (aus v4.10.2): `getConversationActivityMs`, `sortConversationsByActivity`, `updateConversationActivity` (auf `window.__krs…` für Tests exponiert).
- Paste-Cleaner (aus v4.10.3): `simplifyPastedHtml` + `PASTE_DEFAULT_COLORS`.

**Wichtige Designentscheidung (Sicherheit > Optik):** `sanitizeHtml`/`SANITIZE_CONFIG` erlaubt **kein** `style`-Attribut. Beim *Anzeigen* bleiben Fett/Kursiv/Listen/Links erhalten, **eingefügte Farben (z. B. rot) fallen weg**. Im Editor sieht der Verfasser die Farbe, im geposteten Beitrag erscheint sie schwarz. Bewusst so belassen — `style` global zu erlauben wäre neue XSS-Fläche.

---

## Qualitätssicherung

- **Zwei-Runden-Experten-Review** (Subagent). Runde 1 = NO-GO, fand 4 echte Bugs:
  1. Emoji-Insert im Chat kaputt (`chatInputRef` zeigte nach Umbau ins Leere) → gefixt via `editorRef`-Prop + `execCommand('insertText')`.
  2. Rohe HTML-Tags in Dringend-/@alle-/@mich-Benachrichtigung → `htmlToText` ergänzt.
  3. Enter-Senden las veralteten State (Stale-Closure-Race) → `onEnter(html)` übergibt aktuellen DOM-Wert; `handleSend/handleSendReply/handleSaveMsgEdit` nehmen Override-Wert.
  4. Leere Listen/`<br>`-Inhalte wurden gesendet → Leerprüfung jetzt via `htmlToText(...).trim()`.
  Runde 2 = **GO** (alle vier behoben, keine neuen Fehler).
- **Lokal verifiziert (ohne Browser):** Inline-Skript fehlerfrei geparst; 58 Tests kompilieren (`playwright test --list`); `htmlToText`-Logik 5/5; M2-Leererkennung 6/6; Cleaner gegen echtes Outlook-HTML 13/13; XSS-Check Cleaner 7/7.
- **Browser-/UI-Tests** (Chromium) laufen im Deploy-Gate — die Sandbox kann keinen Browser laden.

### Tests in diesem Sprint
- `tests/connect/smoke-paste.spec.ts` — neu geschrieben auf `.rich-editor` (contentEditable): Fett, Links, Plaintext, Word-Cleaning, Chat-WYSIWYG + Bild-Paste.
- `tests/connect/smoke-chat-sorting.spec.ts` — Sortier-Logik + Feed-Reihenfolge (auf neuen Selektor angepasst).
- `tests/connect/smoke-chat-emoji.spec.ts` — auf `.rich-editor` angepasst.

---

## Nach dem Deploy bitte live gegentesten (echte 35 Lehrkräfte!)
1. Word/Outlook-FAQ in **Beitrag** UND **Chat** einfügen → sauber formatiert, keine Tags.
2. Kurze Chat-Nachricht mit **Enter** senden; **Shift+Enter** = Zeilenumbruch.
3. **Alte** Chat-Nachrichten erscheinen weiterhin normal.
4. Chat-Übersicht: zuletzt geschriebener Chat steht oben; Feed neueste unten.
5. Emoji im Chat einfügen (Cursor-Position).

---

## Bekannte offene Punkte / mögliche nächste Schritte
- Eingefügte **Farben** werden beim Anzeigen verworfen (s. o.). Falls gewünscht: `sanitizeHtml` um sicheres `style` (nur `color`) erweitern — eigener, geprüfter Schritt.
- Toter Code: `FormatToolbar` (ca. Z. 3895) wird nicht mehr referenziert — kann aufgeräumt werden.
- Chat-Eingabe: `disabled`-während-Senden entfällt (Doppelsenden ist durch `|| sending`-Guard verhindert).
- Divergierende Arbeitskopie `../krs-connect-v4.html` (Wurzelordner) ist überholt — Inventur/Aufräumen offen.

---

## Einstiegs-Prompt für einen neuen Chat

> Du arbeitest an **KRS Connect** (`krs-connect-deploy/index.html`), Single-File React 18 via CDN, kein Build, `React.createElement` (kein JSX). Repo: `git@github.com:kurpfalz-realschule/krs-connect.git` (Org, SSH). Live: https://kurpfalz-realschule.github.io/krs-connect/. Deploy = `git push origin main` (Push macht Norbert selbst; Gate testet via Playwright und deployt nur bei Grün).
>
> **Stand:** v4.10.4 (`5818996`). WYSIWYG-Eingabefeld (`MentionTextarea`, contentEditable) ist jetzt in ALLEN Composern (Beitrag, Antwort, Bearbeiten, Chat, Chat-Bearbeiten); Chat rendert sanitisiertes HTML; `htmlToText` für Vorschau/Notifications; Enter sendet (Shift+Enter = Umbruch). Chat-Übersicht nach Aktivität sortiert, Feed chronologisch. Word/Outlook-Paste wird via `simplifyPastedHtml` bereinigt. Anzeige läuft immer über `sanitizeHtml` (kein `style` erlaubt → Farben fallen beim Anzeigen weg).
>
> **Regeln:** kein JSX; Tests im selben Commit nach `tests/connect/` (Demo-Modus via Fixture `tests/fixtures/connect.ts`, `forceMode=demo`, User `nk`); vor Abschluss `playwright test --list` kompilier-prüfen; nach größeren Schritten Experten-Review; immer echte, klickbare Links; Push macht Norbert selbst.
>
> **Womit weitermachen:** _(hier eintragen, z. B. „Farben beim Anzeigen erlauben", „FormatToolbar aufräumen", „Arbeitskopie-Inventur")_
