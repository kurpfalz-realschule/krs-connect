-- =====================================================================
-- KRS Connect — Datenhygiene: Demo-Seeds + Test-Müll-Teams entfernen
-- (Sprint Sonnet #2)
-- Datum: 2026-09-03 · Projekt: ooejsfixxiuobrpqgfqm
--
-- WICHTIG: NICHT eigenmächtig ausführen. CHECK-Ergebnis (Block 1, am
-- 03.09.2026 real gegen die Produktiv-DB gelaufen) zuerst Norbert zeigen
-- und je Liste sein ausdrückliches OK einholen — siehe Sprint-Vorgabe
-- Aufgabe 2. Diese Migration wurde in dieser Session NUR geschrieben,
-- NICHT ausgeführt (keine Schreiboperation auf der Live-DB).
--
-- Muster: sichere-massen-sql-migration (CHECK → BACKUP → ACTION → UNDO).
-- Additiv/idempotent wo möglich; die ACTION-Statements sind absichtlich
-- auskommentiert, damit ein versehentliches "Alles ausführen" im
-- SQL-Editor nichts löscht.
--
-- DREI LISTEN — UNTERSCHIEDLICHE BEHANDLUNG:
--   A) Demo-Seeds vom 20.03.2026 (ids 2–11): 0 Mitglieder, 0 Beiträge,
--      Namens-Kollision mit echten, von Kolleg:innen später angelegten
--      Teams (z. B. "Chemiefachschaft" id 29 vs. Demo-"Fachschaft ..."
--      existiert hier nicht namensgleich, ABER "Chemiefachschaft"/
--      "Französisch Fachschaft" verwirren gegen die Demo-Fachschaften
--      thematisch beim Team-Beitritt laut Sprint-Text) → Kandidat zum
--      Löschen.
--   B) Test-Müll (ids 25–28): "Test", "Tesr", "Kartoffel 161" (zweimal,
--      doppelt angelegt), je 1 Mitglied (der jeweilige Ersteller), 0
--      Beiträge → Kandidat zum Löschen.
--   C) Altbestand Schuljahreswechsel (ids 22, 23): "Klasse 9a SJ 25/26",
--      "9d sj 2627" — NICHT in dieser Migration, nur dokumentiert. Norbert
--      klärt erst, ob diese Teams archiviert oder umbenannt werden sollen
--      (Schuljahreswechsel-Thema, kein Datenmüll).
-- =====================================================================


-- ============================================================
-- 1) CHECK  (NUR LESEN! — Ergebnis vom 03.09.2026 unten dokumentiert)
-- ============================================================
select t.id, t.name, t.created_at,
  (select count(*) from team_members tm where tm.team_id = t.id) as mitglieder,
  (select count(*) from channels c where c.team_id = t.id) as kanaele,
  (select count(*) from posts p join channels c on c.id = p.channel_id where c.team_id = t.id) as beitraege
from teams t
where t.id in (2,3,4,5,6,7,8,9,10,11, 25,26,27,28, 22,23)
order by t.id;

-- Ergebnis 03.09.2026 (real gegen Produktiv-DB geprüft):
--  id | name                    | mitglieder | kanaele | beitraege
--   2 | Fachschaft Deutsch      |          0 |       1 |         0
--   3 | Fachschaft Mathematik   |          0 |       1 |         0
--   4 | Fachschaft Englisch     |          0 |       1 |         0
--   5 | Fachschaft Musik        |          0 |       1 |         0
--   6 | Fachschaft Informatik   |          0 |       1 |         0
--   7 | SMV                     |          0 |       2 |         0
--   8 | Schulband               |          0 |       1 |         0
--   9 | IT & Medien             |          0 |       3 |         0
--  10 | Klassenlehrer 7a        |          0 |       1 |         0
--  11 | Klassenlehrer 7b        |          0 |       1 |         0
--  25 | Test                    |          1 |       1 |         0
--  26 | Tesr                    |          1 |       1 |         0
--  27 | Kartoffel 161           |          1 |       1 |         0
--  28 | Kartoffel 161           |          1 |       1 |         0
--  22 | Klasse 9a SJ 25/26      |          1 |       1 |         0  -- NICHT löschen, klären
--  23 | 9d sj 2627              |          1 |       1 |         0  -- NICHT löschen, klären
--
-- Alle 14 (A+B) Kandidaten: 0 Beiträge. A (2–11): 0 Mitglieder (reine
-- Demo-Seeds, nie beigetreten). B (25–28): 1 Mitglied = der/die jeweilige
-- Ersteller:in (Steffen Kögel: Test/Tesr; Rouven Langensiepe: Kartoffel
-- 161 doppelt) — vermutlich eigene Spielereien beim Ausprobieren.


-- ============================================================
-- 2) BACKUP — Snapshot vor dem Löschen (Undo-Grundlage)
-- ============================================================
-- Läuft NUR, wenn Block 3 (ACTION) tatsächlich ausgeführt wird. Snapshot
-- deckt teams + channels + team_members ab (posts/reactions sind für
-- A+B laut CHECK überall 0, daher kein Snapshot nötig — falls sich das
-- bis zur Ausführung geändert haben sollte, Block 1 erneut laufen lassen
-- und ggf. posts/reactions ergänzen, BEVOR gelöscht wird).

-- create table if not exists _archiv_2026_09_03_teams as
--   select * from teams where id in (2,3,4,5,6,7,8,9,10,11, 25,26,27,28);
-- create table if not exists _archiv_2026_09_03_channels as
--   select * from channels where team_id in (2,3,4,5,6,7,8,9,10,11, 25,26,27,28);
-- create table if not exists _archiv_2026_09_03_team_members as
--   select * from team_members where team_id in (2,3,4,5,6,7,8,9,10,11, 25,26,27,28);


-- ============================================================
-- 3) ACTION — auskommentiert, erst nach Norberts OK je Liste einzeln
--    entkommentieren (A und B können unabhängig freigegeben werden)
-- ============================================================

-- -- Liste A: Demo-Seeds (0 Mitglieder, 0 Beiträge) — kollidieren namentlich
-- -- mit echten Fachschafts-Teams und verwirren beim Beitritt.
-- delete from teams where id in (2,3,4,5,6,7,8,9,10,11);
-- -- channels + team_members dieser Teams verschwinden automatisch
-- -- (ON DELETE CASCADE, geprüft: channels.team_id, team_members.team_id).

-- -- Liste B: Test-Müll (1 Mitglied = eigener Test, 0 Beiträge, "Kartoffel 161" doppelt).
-- delete from teams where id in (25,26,27,28);


-- ============================================================
-- 4) UNDO — nur im Notfall, nur wenn Block 2 (BACKUP) vorher lief
-- ============================================================
-- insert into teams select * from _archiv_2026_09_03_teams
--   where id not in (select id from teams);
-- insert into channels select * from _archiv_2026_09_03_channels
--   where id not in (select id from channels);
-- insert into team_members select * from _archiv_2026_09_03_team_members
--   where (team_id, user_id) not in (select team_id, user_id from team_members);
-- -- Nach erfolgreicher Prüfung: Backup-Tabellen aufräumen.
-- -- drop table if exists _archiv_2026_09_03_teams, _archiv_2026_09_03_channels, _archiv_2026_09_03_team_members;


-- ============================================================
-- 5) VERIFY — nach ACTION laufen lassen
-- ============================================================
-- select count(*) from teams where id in (2,3,4,5,6,7,8,9,10,11,25,26,27,28); -- erwartet 0
-- select count(*) from teams; -- vorher 27, danach 13 (bei beiden Listen) bzw.
--                             -- 17 (nur A) / 23 (nur B)


-- ============================================================
-- 6) Liste C — NICHT Teil dieser Migration, nur zur Klärung mit Norbert
-- ============================================================
-- id 22 "Klasse 9a SJ 25/26" und id 23 "9d sj 2627": beide 1 Mitglied
-- (Klassenlehrer:in), 0 Beiträge, angelegt 09.07.2026 — sehen nach
-- Schuljahreswechsel-Altbestand aus (SJ 25/26 vs. neue SJ-26/27-Teams
-- wie id 33 "Klasse 7a_SJ 26/27"). Norbert entscheidet: archivieren
-- (teams.archived_at setzen, Funktion existiert bereits aus
-- 2026-06-20_teams-archivierung.sql), umbenennen, oder stehen lassen.
-- Admin/Klassenlehrer:innen laut Team-Mitgliedschaft:
--   id 22 → Patrick Kocher (admin)
--   id 23 → Peter Schmitt (admin)
