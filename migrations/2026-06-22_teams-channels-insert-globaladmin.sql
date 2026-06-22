-- =====================================================================
-- KRS Connect — Fix "Team anlegen geht nicht" (Sprint #9)
-- Datum: 2026-06-22 · Projekt: ooejsfixxiuobrpqgfqm
--
-- PROBLEM (im Code verifiziert, index.html createTeam):
--   createTeam() macht nacheinander INSERTs in teams → team_members → channels.
--   Die ALTE Policy `teams_insert_admin` prüft NUR `users.auth_id = auth.uid()`
--   (ohne E-Mail-Fallback). Ist der users-Datensatz nur per E-Mail verknüpft
--   (auth_id NULL), liefert die Prüfung FALSE → der teams-INSERT scheitert an
--   RLS, der ganze Vorgang bricht ab. team_members ist seit der RLS-Härtung
--   für globale Admins offen, teams/channels aber noch nicht.
--
-- LÖSUNG (additiv, idempotent): zwei zusätzliche INSERT-Policies, die exakt
--   die E-Mail-sichere Logik aus der RLS-Härtung nutzen (is_global_admin()).
--   Additive Policies werden mit bestehenden per ODER verknüpft — es wird also
--   NICHTS verschärft, nur für globale Admins zusätzlich erlaubt.
--
-- VORAUSSETZUNG: is_global_admin() existiert (aus
--   2026-06-20_rls-haertung-eigene-posts-dms.sql). Hartes Guard unten.
--
-- AUSFÜHRUNG: Supabase SQL-Editor. Block 1 (CHECK) zuerst lesen, dann Block 2
--   (ACTION), Block 4 (VERIFY) zur Kontrolle. Block 3 (UNDO) nur im Notfall.
-- =====================================================================


-- ============================================================
-- 1) CHECK  (NUR LESEN!) — aktueller INSERT-Policy-Stand
-- ============================================================
SELECT tablename, policyname, cmd, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename IN ('teams','channels') AND cmd IN ('INSERT','ALL')
ORDER BY tablename, policyname;

-- Sanity: Helper aus der RLS-Härtung vorhanden?
SELECT proname FROM pg_proc WHERE proname IN ('is_global_admin','get_app_user_id','get_user_team_ids');


-- ============================================================
-- 2) ACTION
-- ============================================================
DO $$
BEGIN
  -- Reihenfolge-Guard: ohne is_global_admin() abbrechen
  IF to_regprocedure('public.is_global_admin()') IS NULL THEN
    RAISE EXCEPTION 'is_global_admin() fehlt — bitte ZUERST 2026-06-20_rls-haertung-eigene-posts-dms.sql ausführen.';
  END IF;

  -- 2a) teams: globaler Admin darf neue Teams anlegen (E-Mail-sicher)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='teams' AND policyname='teams_insert_globaladmin'
  ) THEN
    CREATE POLICY "teams_insert_globaladmin" ON public.teams
      FOR INSERT WITH CHECK (public.is_global_admin());
  END IF;

  -- 2b) channels: globaler Admin darf Kanäle anlegen (Default-Kanal beim Team-
  --     Erstellen, auch bevor get_user_team_ids() den neuen Team-Bezug kennt)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='channels' AND policyname='channels_insert_globaladmin'
  ) THEN
    CREATE POLICY "channels_insert_globaladmin" ON public.channels
      FOR INSERT WITH CHECK (public.is_global_admin());
  END IF;
END $$;


-- ============================================================
-- 3) UNDO — nur im Notfall
-- ============================================================
-- DROP POLICY IF EXISTS "teams_insert_globaladmin"    ON public.teams;
-- DROP POLICY IF EXISTS "channels_insert_globaladmin" ON public.channels;


-- ============================================================
-- 4) VERIFY — Soll: je 1 zusätzliche INSERT-Policy *_globaladmin
-- ============================================================
SELECT tablename, policyname, cmd, with_check
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('teams','channels')
  AND policyname IN ('teams_insert_globaladmin','channels_insert_globaladmin')
ORDER BY tablename;
