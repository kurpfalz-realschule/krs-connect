-- ============================================================
-- R1 (Sprint 1, Ausbau-Plan 05.07.2026): Untis-Kürzel + Mock-Cleanup
-- ANGEWANDT am 05.07.2026 via Supabase MCP (Projekt ooejsfixxiuobrpqgfqm)
-- Quelle Kürzel: offizielle Untis-Liste (Norbert, Screenshots 05.07.)
-- ============================================================

-- ── CHECK (vor ACTION gelaufen) ─────────────────────────────
-- 1) 14 aktive Users ohne Kürzel (7 echte + 7 Mock ohne E-Mail)
-- SELECT id, display_name, email, kuerzel FROM users WHERE status='active' AND kuerzel IS NULL;
-- 2) Mock-User (ids 4–10, email IS NULL) referenzieren NUR Cascade-Tabellen:
--    team_members=7 (CASCADE), conversation_members=2 (CASCADE), sonst 0.
-- 3) Kein Unique-Index auf users.kuerzel → keine Kollisionsgefahr.

-- ── BACKUP ──────────────────────────────────────────────────
-- CREATE SCHEMA IF NOT EXISTS backup_beta;
-- CREATE TABLE backup_beta.users_20260705 AS SELECT * FROM public.users;  -- 57 Zeilen

-- ── ACTION ──────────────────────────────────────────────────
BEGIN;
UPDATE public.users u SET kuerzel = v.k
FROM (VALUES
 (1,'Ktz'),(2,'Car'),(3,'Sm'),(11,'Ke'),(12,'Klb'),(13,'App'),(14,'Ksp'),
 (15,'Kög'),(16,'Hö'),(17,'Spg'),(18,'Mü'),(19,'Lgs'),(20,'Mei'),(21,'Bgf'),
 (22,'Sci'),(23,'Kc'),(24,'Kle'),(25,'Mft'),(26,'Srö'),(27,'Eng'),(28,'Wöl'),
 (29,'Rud'),(31,'Scr'),(32,'Jac'),(33,'Sca'),(34,'Klu'),(35,'Bur'),(36,'Web'),
 (37,'Wlg'),(38,'Ms'),(39,'Aml'),(40,'Wei'),(41,'Zer'),(42,'Tei'),(43,'Geh'),
 (44,'Jen'),(45,'Ltz'),(46,'Nin'),(47,'Bü'),(48,'Smo'),(49,'Ebh'),(50,'Bat'),
 (51,'Adm'),(54,'Joo')
) AS v(id,k)
WHERE u.id = v.id;

-- Mock-User löschen (Norbert 05.07.: "mock-user löschen, die gibt es nicht")
DELETE FROM public.users WHERE id IN (4,5,6,7,8,9,10) AND email IS NULL;
COMMIT;

-- ── VERIFIKATION (Ergebnis 05.07.) ──────────────────────────
-- users_gesamt=50 · aktive_ohne_kuerzel=0 · Schmitt D='Sm' · Kotzan='Ktz' · KRS Admin='Adm'

-- ── NACHTRAG 05.07. (Norbert): abgegangene Lehrkräfte ──────
-- Hauke, Johnscher, Pätzold, Sardy, Stubenvoll, Weihrauch sind nicht mehr an
-- der Schule. CHECK: 0 Referenzen (posts/messages/reactions/team_members) →
-- GELÖSCHT (Löschkonzept Zentrale, DSGVO-Datenminimierung):
-- DELETE FROM public.users WHERE id IN (30,52,53,55,56,57);
-- UNDO: INSERT INTO public.users SELECT * FROM backup_beta.users_20260705
--       WHERE id IN (30,52,53,55,56,57) ON CONFLICT (id) DO NOTHING;
-- Endstand: users=44, alle aktiv, alle mit Kürzel. lehrer.csv nachgezogen (43 + Adm).
-- Martinez/Borkowski/Geiger/Seyler/Weißer/Schanzenbächer (in Untis-Liste) sind
-- laut Norbert ebenfalls nicht an der Schule → KEINE Accounts anlegen.

-- ── UNDO ────────────────────────────────────────────────────
-- Kürzel zurück:   UPDATE public.users u SET kuerzel = b.kuerzel
--                  FROM backup_beta.users_20260705 b WHERE u.id = b.id;
-- Mocks zurück:    INSERT INTO public.users SELECT * FROM backup_beta.users_20260705
--                  WHERE id IN (4,5,6,7,8,9,10) ON CONFLICT (id) DO NOTHING;

-- ── HINWEISE ────────────────────────────────────────────────
-- 1) Konventionswechsel: users.kuerzel jetzt Untis-Stil ('Ktz','Sm','Bü'),
--    NICHT mehr 3-Buchstaben-Großschreibung (KOT/SMT). lehrer.csv nachgezogen.
-- 2) admin_whitelist (Hub-Admin-Login) bleibt unverändert: Ko/Ca/Sch —
--    separates System, ABER inkonsistent zur neuen Konvention → in A4 klären.
-- 3) Klassenarbeitsplan erwartet 'Ko'-Stil (Hub-Code-Kommentar) — prüfen,
--    ob dort Alt-Kürzel gespeichert sind, die jetzt nicht mehr matchen (A4).
