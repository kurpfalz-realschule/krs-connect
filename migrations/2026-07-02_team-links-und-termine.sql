-- =====================================================================
-- KRS Connect — Dateiablage-Links & Termine pro Team (v4.12.0)
-- Datum: 2026-07-02 · Projekt: ooejsfixxiuobrpqgfqm
--
-- Zwei neue, rein additive Tabellen:
--   public.team_links   — benannte Links pro Team (iServ-/Nextcloud-Ordner …)
--   public.team_termine — einfache Termin-Liste pro Team (kein Vollkalender)
--
-- Rechte-Modell (Wunsch Norbert):
--   Lesen:      alle Team-Mitglieder (+ globale Admins)
--   Anlegen:    alle Team-Mitglieder; created_by muss der eigene App-User sein
--   Ändern/Löschen: Ersteller:in ODER Team-Admin ODER globaler Admin
--
-- VORAUSSETZUNG: Helper aus früheren Migrationen vorhanden:
--   public.get_app_user_id()        (RLS-Härtung 2026-06-20)
--   public.is_global_admin()        (RLS-Härtung 2026-06-20)
--   public.is_team_admin(text)      (Teams-Archivierung 2026-06-20)
--   public.is_team_member(text)     (team_members-Rekursion-Fix 2026-06-22)
--
-- AUSFÜHRUNG: Supabase SQL-Editor. Block 1 (CHECK) lesen, dann Block 2
--   (ACTION), Block 4 (VERIFY). Block 3 (UNDO) nur im Notfall. Idempotent.
-- =====================================================================


-- ============================================================
-- 1) CHECK  (NUR LESEN!)
-- ============================================================
-- Helper vorhanden?
SELECT to_regprocedure('public.get_app_user_id()')    AS get_app_user_id,
       to_regprocedure('public.is_global_admin()')    AS is_global_admin,
       to_regprocedure('public.is_team_admin(text)')  AS is_team_admin,
       to_regprocedure('public.is_team_member(text)') AS is_team_member;

-- Tabellennamen noch frei? (Erwartung: 0 Zeilen)
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name IN ('team_links','team_termine');


-- ============================================================
-- 2) ACTION
-- ============================================================
DO $$
BEGIN
  IF to_regprocedure('public.get_app_user_id()') IS NULL
     OR to_regprocedure('public.is_global_admin()') IS NULL
     OR to_regprocedure('public.is_team_admin(text)') IS NULL
     OR to_regprocedure('public.is_team_member(text)') IS NULL THEN
    RAISE EXCEPTION 'Helper fehlen — bitte zuerst die Migrationen 2026-06-20 (RLS-Härtung, Archivierung) und 2026-06-22 (team_members-Fix) ausführen.';
  END IF;
END $$;

-- 2a) Tabelle team_links — benannte Dateiablage-Links pro Team
CREATE TABLE IF NOT EXISTS public.team_links (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id      bigint NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  titel        text   NOT NULL,
  url          text   NOT NULL CHECK (url ~* '^https?://'),
  beschreibung text,
  icon         text,
  created_by   bigint REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz,
  sort_order   int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS team_links_team_sort_idx
  ON public.team_links (team_id, sort_order, created_at);

-- 2b) Tabelle team_termine — einfache Termin-Liste pro Team
--     (bewusst KEIN Vollkalender: keine Wiederholungen, keine Erinnerungen)
CREATE TABLE IF NOT EXISTS public.team_termine (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id      bigint NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  titel        text NOT NULL,
  datum        date NOT NULL,
  uhrzeit      time,
  ort          text,
  beschreibung text,
  created_by   bigint REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz
);

CREATE INDEX IF NOT EXISTS team_termine_team_datum_idx
  ON public.team_termine (team_id, datum, uhrzeit);

-- 2c) RLS aktivieren
ALTER TABLE public.team_links   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_termine ENABLE ROW LEVEL SECURITY;

-- 2d) Policies team_links (idempotent: DROP IF EXISTS + CREATE)
DROP POLICY IF EXISTS "team_links_select_member" ON public.team_links;
CREATE POLICY "team_links_select_member" ON public.team_links
  FOR SELECT USING (
    public.is_global_admin() OR public.is_team_member(team_id::text)
  );

DROP POLICY IF EXISTS "team_links_insert_member" ON public.team_links;
CREATE POLICY "team_links_insert_member" ON public.team_links
  FOR INSERT WITH CHECK (
    (public.is_global_admin() OR public.is_team_member(team_id::text))
    AND created_by = public.get_app_user_id()
  );

DROP POLICY IF EXISTS "team_links_update_owner_or_admin" ON public.team_links;
CREATE POLICY "team_links_update_owner_or_admin" ON public.team_links
  FOR UPDATE
  USING (
    public.is_global_admin()
    OR public.is_team_admin(team_id::text)
    OR created_by = public.get_app_user_id()
  )
  WITH CHECK (
    public.is_global_admin()
    OR public.is_team_admin(team_id::text)
    OR created_by = public.get_app_user_id()
  );

DROP POLICY IF EXISTS "team_links_delete_owner_or_admin" ON public.team_links;
CREATE POLICY "team_links_delete_owner_or_admin" ON public.team_links
  FOR DELETE USING (
    public.is_global_admin()
    OR public.is_team_admin(team_id::text)
    OR created_by = public.get_app_user_id()
  );

-- 2e) Policies team_termine (gleiches Rechte-Modell)
DROP POLICY IF EXISTS "team_termine_select_member" ON public.team_termine;
CREATE POLICY "team_termine_select_member" ON public.team_termine
  FOR SELECT USING (
    public.is_global_admin() OR public.is_team_member(team_id::text)
  );

DROP POLICY IF EXISTS "team_termine_insert_member" ON public.team_termine;
CREATE POLICY "team_termine_insert_member" ON public.team_termine
  FOR INSERT WITH CHECK (
    (public.is_global_admin() OR public.is_team_member(team_id::text))
    AND created_by = public.get_app_user_id()
  );

DROP POLICY IF EXISTS "team_termine_update_owner_or_admin" ON public.team_termine;
CREATE POLICY "team_termine_update_owner_or_admin" ON public.team_termine
  FOR UPDATE
  USING (
    public.is_global_admin()
    OR public.is_team_admin(team_id::text)
    OR created_by = public.get_app_user_id()
  )
  WITH CHECK (
    public.is_global_admin()
    OR public.is_team_admin(team_id::text)
    OR created_by = public.get_app_user_id()
  );

DROP POLICY IF EXISTS "team_termine_delete_owner_or_admin" ON public.team_termine;
CREATE POLICY "team_termine_delete_owner_or_admin" ON public.team_termine
  FOR DELETE USING (
    public.is_global_admin()
    OR public.is_team_admin(team_id::text)
    OR created_by = public.get_app_user_id()
  );


-- ============================================================
-- 3) UNDO — nur im Notfall
-- ============================================================
-- DROP POLICY IF EXISTS "team_links_select_member"          ON public.team_links;
-- DROP POLICY IF EXISTS "team_links_insert_member"          ON public.team_links;
-- DROP POLICY IF EXISTS "team_links_update_owner_or_admin"  ON public.team_links;
-- DROP POLICY IF EXISTS "team_links_delete_owner_or_admin"  ON public.team_links;
-- DROP POLICY IF EXISTS "team_termine_select_member"        ON public.team_termine;
-- DROP POLICY IF EXISTS "team_termine_insert_member"        ON public.team_termine;
-- DROP POLICY IF EXISTS "team_termine_update_owner_or_admin" ON public.team_termine;
-- DROP POLICY IF EXISTS "team_termine_delete_owner_or_admin" ON public.team_termine;
-- -- Tabellen bewusst NICHT droppen (Datenverlust-Schutz). Bei Bedarf:
-- -- DROP TABLE IF EXISTS public.team_links;
-- -- DROP TABLE IF EXISTS public.team_termine;


-- ============================================================
-- 4) VERIFY
-- ============================================================
SELECT table_name, column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('team_links','team_termine')
ORDER BY table_name, ordinal_position;

SELECT tablename, policyname, cmd FROM pg_policies
WHERE schemaname='public' AND tablename IN ('team_links','team_termine')
ORDER BY tablename, cmd, policyname;
