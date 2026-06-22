-- =====================================================================
-- KRS Connect — Fix: "infinite recursion detected in policy for relation
-- team_members" (Sprint #9b) · Projekt: ooejsfixxiuobrpqgfqm · 2026-06-22
--
-- URSACHE: Die S2-Policies auf team_members prüfen Rechte per
--   EXISTS (SELECT 1 FROM team_members tm JOIN users u ...) — also eine
--   Abfrage AUF team_members INNERHALB einer team_members-Policy. Postgres
--   wertet dafür erneut die team_members-Policies aus → Endlosrekursion.
--   Tritt beim INSERT in team_members auf (z. B. createTeam: Ersteller wird
--   erstes Admin-Mitglied).
--
-- FIX: Alle team_members-Policies droppen und durch nicht-rekursive ersetzen,
--   deren Prädikate AUSSCHLIESSLICH über SECURITY-DEFINER-Helfer laufen
--   (bypassen RLS → keine Rekursion):
--     is_global_admin()         (vorhanden)
--     is_team_admin(text)       (vorhanden, teams-archiv-Migration)
--     is_team_member(text)      (hier neu)
--     get_app_user_id()         (vorhanden)
--
-- SICHERHEIT: Zugriff bleibt gleich streng — Mitglieder sehen Mitglieder ihrer
--   Teams (+ eigene Zeile); Schreiben nur Team-Admin ODER globaler Admin.
--   Team anlegen bleibt global-admin-only (teams_insert_globaladmin).
--
-- AUSFÜHRUNG: Supabase SQL-Editor. Idempotent. Block 1 CHECK lesen, dann
--   Block 2 ACTION, Block 4 VERIFY. Block 3 UNDO nur im Notfall.
-- =====================================================================


-- ============================================================
-- 1) CHECK (NUR LESEN) — aktuelle team_members-Policies + Helfer-Status
-- ============================================================
SELECT policyname, cmd, qual AS using_expr, with_check
FROM pg_policies WHERE schemaname='public' AND tablename='team_members'
ORDER BY cmd, policyname;

SELECT proname, prosecdef AS security_definer
FROM pg_proc
WHERE proname IN ('is_global_admin','is_team_admin','is_team_member','get_app_user_id');


-- ============================================================
-- 2) ACTION
-- ============================================================
DO $guard$
BEGIN
  IF to_regprocedure('public.is_global_admin()') IS NULL
     OR to_regprocedure('public.get_app_user_id()') IS NULL
     OR to_regprocedure('public.is_team_admin(text)') IS NULL THEN
    RAISE EXCEPTION 'Helfer fehlen — zuerst RLS-Härtung (2026-06-20) und Teams-Archiv ausführen.';
  END IF;
END $guard$;

-- 2a) Helfer: ist aktueller App-User Mitglied dieses Teams? (SECURITY DEFINER!)
CREATE OR REPLACE FUNCTION public.is_team_member(p_team_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
     WHERE tm.team_id::text = p_team_id
       AND tm.user_id = public.get_app_user_id()
  );
$$;

-- 2b) ALLE bestehenden team_members-Policies entfernen (deterministischer Endzustand)
DO $drop$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='team_members'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.team_members', pol.policyname);
  END LOOP;
END $drop$;

-- 2c) Nicht-rekursive Policies neu anlegen (nur SECURITY-DEFINER-Helfer im Prädikat)
CREATE POLICY "team_members_select" ON public.team_members
  FOR SELECT USING (
    public.is_global_admin()
    OR user_id = public.get_app_user_id()
    OR public.is_team_member(team_id::text)
  );

CREATE POLICY "team_members_insert" ON public.team_members
  FOR INSERT WITH CHECK (
    public.is_global_admin() OR public.is_team_admin(team_id::text)
  );

CREATE POLICY "team_members_update" ON public.team_members
  FOR UPDATE USING (
    public.is_global_admin() OR public.is_team_admin(team_id::text)
  ) WITH CHECK (
    public.is_global_admin() OR public.is_team_admin(team_id::text)
  );

CREATE POLICY "team_members_delete" ON public.team_members
  FOR DELETE USING (
    public.is_global_admin() OR public.is_team_admin(team_id::text)
  );


-- ============================================================
-- 3) UNDO — nur im Notfall (entfernt die neuen Policies; team_members ist
--    danach ohne Policy = deny. Alte (rekursive) Policies NICHT zurückgeholt.)
-- ============================================================
-- DROP POLICY IF EXISTS "team_members_select" ON public.team_members;
-- DROP POLICY IF EXISTS "team_members_insert" ON public.team_members;
-- DROP POLICY IF EXISTS "team_members_update" ON public.team_members;
-- DROP POLICY IF EXISTS "team_members_delete" ON public.team_members;
-- DROP FUNCTION IF EXISTS public.is_team_member(text);


-- ============================================================
-- 4) VERIFY — Soll: genau 4 Policies, keine referenziert team_members im qual
-- ============================================================
SELECT policyname, cmd,
       (qual ILIKE '%from team_members%' OR with_check ILIKE '%from team_members%') AS referenziert_team_members
FROM pg_policies WHERE schemaname='public' AND tablename='team_members'
ORDER BY cmd, policyname;
