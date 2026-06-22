-- =====================================================================
-- KRS Connect — Teams archivieren / wiederherstellen / löschen (Sprint #8)
-- Datum: 2026-06-20 · Projekt: ooejsfixxiuobrpqgfqm
--
-- AUSFÜHRUNG: Supabase SQL-Editor. Block 1 (CHECK) ZUERST lesen, dann Block 2
-- (ACTION). Block 4 (VERIFY) zur Kontrolle. Block 3 (UNDO) nur im Notfall.
-- Additiv & idempotent (2. Lauf crasht nicht).
--
-- REIHENFOLGE: NACH der RLS-Härtung (2026-06-20_rls-haertung-eigene-posts-dms.sql)
-- ausführen — diese Migration nutzt die dort angelegte Funktion is_global_admin().
-- Beide ZUERST im SQL-Editor, ERST DANN der Frontend-Deploy ("RLS vor Frontend").
--
-- INHALT:
--   • teams.archived_at (timestamptz, NULL = aktiv)  → Soft-Archiv
--   • Helper is_team_admin(text)  (SECURITY DEFINER, keine Rekursion über
--     team_members-RLS; Param als text → unabhängig vom id-Typ uuid/bigint)
--   • Policies teams UPDATE/DELETE = Team-Admin ODER globaler Admin (additiv)
--   • FK ON DELETE CASCADE für child→teams/channels, damit das endgültige
--     Löschen eines Teams Kanäle/Mitglieder/Beiträge DB-seitig miträumt.
-- =====================================================================


-- ============================================================
-- 1) CHECK  (NUR LESEN!)
-- ============================================================
-- 1a) Existiert die Spalte schon?
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='teams' AND column_name='archived_at';

-- 1b) Aktuelle UPDATE/DELETE/ALL-Policies auf teams
SELECT tablename, policyname, cmd, qual AS using_expr, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='teams'
ORDER BY cmd, policyname;

-- 1c) FK-Lösch-Verhalten der Kinder (confdeltype 'c'=CASCADE, 'a'=NO ACTION …)
SELECT rel.relname AS child_table, con.conname,
       (SELECT attname FROM pg_attribute WHERE attrelid=con.conrelid AND attnum=con.conkey[1]) AS child_col,
       con.confdeltype AS del_type
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE con.contype='f'
  AND rel.relname IN ('channels','team_members','posts')
ORDER BY child_table;

-- 1d) Sanity: is_global_admin() muss existieren (sonst zuerst RLS-Migration laufen)
SELECT proname FROM pg_proc WHERE proname='is_global_admin';


-- ============================================================
-- 2) ACTION
-- ============================================================

-- 2.0) HARTES Reihenfolge-Guard: is_global_admin() muss existieren (kommt aus
--      der RLS-Härtungs-Migration). Verhindert „function does not exist", falls
--      diese Migration versehentlich ZUERST läuft.
DO $$
BEGIN
  IF to_regprocedure('public.is_global_admin()') IS NULL THEN
    RAISE EXCEPTION 'is_global_admin() fehlt — bitte ZUERST 2026-06-20_rls-haertung-eigene-posts-dms.sql ausführen.';
  END IF;
END $$;

-- 2a) Soft-Archiv-Spalte
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 2b) Helper: ist der aktuelle App-User Admin DIESES Teams?
--     text-Param + ::text-Vergleich → robust egal ob teams.id uuid oder bigint.
CREATE OR REPLACE FUNCTION public.is_team_admin(p_team_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
     WHERE tm.team_id::text = p_team_id
       AND tm.user_id = public.get_app_user_id()
       AND tm.role = 'admin'
  );
$$;

-- 2c) Policies (additiv, idempotent): Team-Admin ODER globaler Admin darf
--     ein Team aktualisieren (= archivieren/wiederherstellen) und löschen.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='teams' AND policyname='teams_update_admin') THEN
    CREATE POLICY "teams_update_admin" ON public.teams
      FOR UPDATE
      USING (public.is_global_admin() OR public.is_team_admin(id::text))
      WITH CHECK (public.is_global_admin() OR public.is_team_admin(id::text));
  ELSIF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='teams' AND policyname='teams_update_globaladmin') THEN
    -- Bestehende DBs haben oft schon teams_update_admin (nur Team-Admin).
    -- Additive Policy hält diese Migration idempotent und ergänzt Global-Admins.
    CREATE POLICY "teams_update_globaladmin" ON public.teams
      FOR UPDATE
      USING (public.is_global_admin())
      WITH CHECK (public.is_global_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='teams' AND policyname='teams_delete_admin') THEN
    CREATE POLICY "teams_delete_admin" ON public.teams
      FOR DELETE
      USING (public.is_global_admin() OR public.is_team_admin(id::text));
  ELSIF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='teams' AND policyname='teams_delete_globaladmin') THEN
    CREATE POLICY "teams_delete_globaladmin" ON public.teams
      FOR DELETE
      USING (public.is_global_admin());
  END IF;
END $$;

-- 2d) FK ON DELETE CASCADE sicherstellen, damit DELETE teams nicht an
--     FK-Verletzungen scheitert. Idempotent: nur ändern, wenn nötig.
DO $$
DECLARE
  rec   RECORD;
  fkname text;
  fkdel  "char";
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
        ('channels','team_id','teams'),
        ('team_members','team_id','teams'),
        ('posts','channel_id','channels')
      ) AS v(child, col, parent)
  LOOP
    -- child-Tabelle & Spalte müssen existieren
    IF to_regclass('public.'||rec.child) IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = ('public.'||rec.child)::regclass
        AND attname = rec.col AND NOT attisdropped
    ) THEN CONTINUE; END IF;

    SELECT con.conname, con.confdeltype INTO fkname, fkdel
    FROM pg_constraint con
    WHERE con.conrelid = ('public.'||rec.child)::regclass AND con.contype='f'
      AND (SELECT attname FROM pg_attribute WHERE attrelid=con.conrelid AND attnum=con.conkey[1]) = rec.col;

    IF fkname IS NOT NULL AND fkdel IS DISTINCT FROM 'c' THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', rec.child, fkname);
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) ON DELETE CASCADE',
        rec.child, rec.child||'_'||rec.col||'_fkey', rec.col, rec.parent);
    END IF;
  END LOOP;
END $$;


-- ============================================================
-- 3) UNDO — nur im Notfall
-- ============================================================
-- DROP POLICY IF EXISTS "teams_update_admin" ON public.teams;
-- DROP POLICY IF EXISTS "teams_delete_admin" ON public.teams;
-- DROP FUNCTION IF EXISTS public.is_team_admin(text);
-- -- Spalte archived_at bewusst NICHT droppen (Datenverlust-Schutz). Bei Bedarf:
-- -- ALTER TABLE public.teams DROP COLUMN IF EXISTS archived_at;


-- ============================================================
-- 4) VERIFY
-- ============================================================
-- Spalte vorhanden?
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='teams' AND column_name='archived_at';

-- Policies vorhanden? Bestehende DBs können Team-Admin-Policies plus additive
-- Global-Admin-Policies haben.
SELECT policyname, cmd FROM pg_policies
WHERE schemaname='public' AND tablename='teams'
  AND policyname IN (
    'teams_update_admin', 'teams_delete_admin',
    'teams_update_globaladmin', 'teams_delete_globaladmin'
  )
ORDER BY cmd, policyname;

-- Helper vorhanden?
SELECT proname FROM pg_proc WHERE proname='is_team_admin';

-- Alle relevanten FKs jetzt CASCADE? (del_type sollte 'c' sein)
SELECT rel.relname AS child_table,
       (SELECT attname FROM pg_attribute WHERE attrelid=con.conrelid AND attnum=con.conkey[1]) AS child_col,
       con.confdeltype AS del_type
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE con.contype='f' AND rel.relname IN ('channels','team_members','posts')
ORDER BY child_table;
