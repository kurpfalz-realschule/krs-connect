# Übergabe — KRS Connect, 22.06.2026 (Stand v4.6.0)

## Live-Stand
- **Live:** https://kurpfalz-realschule.github.io/krs-connect/ — zuletzt deployed **v4.5.0**
  (Emojis + Team-Anlegen-für-alle). **v4.6.0** (Teams-aufräumen) liegt fertig lokal,
  Push-Befehl unten.
- Hinweis Versionsanzeige: Sidebar zeigt „KRS Connect v<nr> · Beta". Wenn dort eine
  alte Nummer steht → **Cmd+Shift+R** (HTTP-Cache). Der Update-Banner prüft alle 5 Min
  / bei Fenster-Fokus und bietet „Jetzt aktualisieren".
- **Backend:** Supabase-Projekt `ooejsfixxiuobrpqgfqm`. Ein **Supabase-MCP-Connector**
  ist jetzt verbunden → SQL/Migrationen laufen direkt über Claude (kein Copy-Paste mehr).

## In dieser Session erledigt
| # | Feature | Stand |
|---|---------|-------|
| Team anlegen (Fehler sichtbar) | Toast statt stilles null | ✅ live |
| RLS: teams/channels INSERT | `*_globaladmin`-Policies | ✅ live |
| RLS-Rekursion `team_members` | alle Policies nicht-rekursiv (SECURITY DEFINER) | ✅ live |
| **Team anlegen für ALLE** | `create_team`-RPC (SECURITY DEFINER), Frontend ruft RPC | ✅ live (v4.5.0) |
| Chat: eigene Nachrichten edit/löschen | `isOwn` gehärtet | ✅ live |
| **Mitgliederverwaltung** | Rolle ↔ Admin, entfernen (war schon vorhanden) | ✅ vorhanden |
| Versionsanzeige + Update-Banner | Poll der live index.html, kein SW | ✅ live (v4.3.0+) |
| **Emojis in Posts & Antworten** | 😊-Picker an Composer | ✅ live (v4.5.0) |
| **Mehrere Teams löschen** | 🧹 Aufräum-Dialog (Admin) | ✅ fertig, Push offen (v4.6.0) |
| Health-Check-URLs | benditot → kurpfalz-realschule | ✅ live |
| Feedback-Board (Beta) | großer Button + Board, Status nur Admin | ✅ live |

## Beta-Status
- 5 Beta-Accounts angelegt (Carse, Schmitt, Appel, Scharmann, Meffert) + Norbert.
  Passwörter in `anmeldeliste-connect-beta.csv` (nach Verteilen löschen!).
- Beta-Einladung: `Beta-Einladung-Mail.md` (im Ordner „teams 2.0").
- Offen vor Rollout: kurzer Selbsttest mit 1 Beta-Login, Passwörter verteilen, CSV löschen, Mail senden.

## NÄCHSTER SPRINT: Team-Beitritt „wie Teams" (Modell „beides")
**Noch NICHT gebaut.** Entscheidung: offene Teams per Beitrittslink (direkt), geschlossene
per Anfrage + Freigabe durch Team-Admin.

### DB (per Connector anzulegen)
- `teams.visibility text not null default 'closed' check (visibility in ('open','closed'))`
- `teams.join_code text unique` (Zufallscode, für Link)
- Tabelle `join_requests (id bigint pk, team_id bigint fk→teams on delete cascade,
  user_id bigint fk→users on delete cascade, status text default 'pending'
  check in ('pending','approved','rejected'), created_at timestamptz default now(),
  decided_by bigint, decided_at timestamptz, unique(team_id,user_id))` + RLS
  (select: Team-Admin/globaler Admin + eigene Zeile; insert: eigene Anfrage; update: Team-Admin).
- RPCs (alle SECURITY DEFINER, analog `create_team`):
  - `set_team_visibility(p_team_id, p_visibility)` — nur Team-Admin/globaler Admin.
  - `get_or_create_join_code(p_team_id)` — Team-Admin; legt Code an/gibt ihn zurück.
  - `join_via_code(p_code)` — offen → direkt Mitglied; geschlossen → `join_request` (pending).
  - `request_join(p_team_id)` — erstellt pending-Anfrage.
  - `list_join_requests(p_team_id)` — Team-Admin; pending-Liste mit Namen.
  - `decide_join(p_request_id, p_approve bool)` — Team-Admin; bei approve → team_members-Insert.
  - `list_open_teams()` — offene Teams, in denen der User noch nicht ist (für „Beitreten"-Browser).

### Frontend
- **„Team beitreten"-Einstieg** (z. B. Button im Teams-Header oder eigene Kachel):
  Liste offener Teams (`list_open_teams`) mit „Beitreten"; Feld „Code/Link einlösen" (`join_via_code`).
- **TeamMembersModal-Erweiterung (Team-Admin):** Sichtbarkeit-Umschalter offen/geschlossen
  (`set_team_visibility`); bei offen „Beitrittslink kopieren" (`?join=<code>` Deep-Link, `get_or_create_join_code`);
  Bereich „Beitrittsanfragen" mit Annehmen/Ablehnen (`list_join_requests` + `decide_join`).
- **Deep-Link:** beim Laden `?join=<code>` auslesen → nach Login `join_via_code` aufrufen.
- Tests: Demo-DataService-Mocks für die neuen Methoden + UI-Smoke (Browser/Anfrage/Code).

## Arbeitsregeln / Konventionen
- **Bei jedem Release** `window.KRS_VERSION` hochzählen (Update-Banner hängt daran).
- E2E laufen im **Demo-Modus** (kein RLS) → RLS-Fehler nur live sichtbar. Toasts machen
  RLS-Fehler sichtbar; echter RLS-Test = live (Claude kann das jetzt via Connector prüfen).
- Push: Norbert im Terminal (`git add … && git commit … && git push`) → Gate testet + deployed bei Grün.
- Migrationen-Doku unter `migrations/` (mehrere wurden bereits via Connector angewandt).
