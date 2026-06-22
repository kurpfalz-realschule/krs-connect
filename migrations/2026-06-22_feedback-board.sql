-- =====================================================================
-- KRS Connect — Feedback-Board (Beta) (Sprint #12)
-- Datum: 2026-06-22 · Projekt: ooejsfixxiuobrpqgfqm
--
-- Eine Tabelle public.feedback für In-App-Feedback mit Status-Workflow:
--   status: 'offen' → 'in_arbeit' → 'erledigt'
-- Sichtbarkeit (Wunsch Norbert): für ALLE eingeloggten App-User lesbar,
--   jede:r darf einreichen. Status ändern/löschen NUR globaler Admin.
--
-- VORAUSSETZUNG: Helper aus früheren Migrationen vorhanden:
--   public.get_app_user_id()  (App-User-ID des aktuellen Logins, email-sicher)
--   public.is_global_admin()  (RLS-Härtung 2026-06-20)
--
-- AUSFÜHRUNG: Supabase SQL-Editor. Block 1 (CHECK) lesen, dann Block 2
--   (ACTION), Block 4 (VERIFY). Block 3 (UNDO) nur im Notfall. Idempotent.
-- =====================================================================


-- ============================================================
-- 1) CHECK  (NUR LESEN!)
-- ============================================================
SELECT to_regprocedure('public.get_app_user_id()') AS get_app_user_id,
       to_regprocedure('public.is_global_admin()')  AS is_global_admin;

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname='public' AND tablename='feedback'
ORDER BY cmd, policyname;


-- ============================================================
-- 2) ACTION
-- ============================================================
DO $$
BEGIN
  IF to_regprocedure('public.is_global_admin()') IS NULL
     OR to_regprocedure('public.get_app_user_id()') IS NULL THEN
    RAISE EXCEPTION 'Helper fehlen — bitte zuerst die RLS-Härtungs-Migration (2026-06-20) ausführen.';
  END IF;
END $$;

-- 2a) Tabelle
CREATE TABLE IF NOT EXISTS public.feedback (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     bigint REFERENCES public.users(id) ON DELETE SET NULL,
  name        text,
  category    text NOT NULL DEFAULT 'sonstiges',
  rating      int  NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  message     text NOT NULL,
  page        text,
  status      text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','in_arbeit','erledigt')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);

CREATE INDEX IF NOT EXISTS feedback_status_idx     ON public.feedback (status);
CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON public.feedback (created_at DESC);

-- 2b) RLS
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- SELECT: jede:r eingeloggte App-User sieht alle Feedbacks (transparentes Board)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='feedback' AND policyname='feedback_select_appuser') THEN
    CREATE POLICY "feedback_select_appuser" ON public.feedback
      FOR SELECT USING (public.get_app_user_id() IS NOT NULL);
  END IF;

  -- INSERT: jede:r eingeloggte App-User darf Feedback einreichen.
  --   user_id muss leer ODER der eigene sein (kein Fremd-Eintrag).
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='feedback' AND policyname='feedback_insert_appuser') THEN
    CREATE POLICY "feedback_insert_appuser" ON public.feedback
      FOR INSERT WITH CHECK (
        public.get_app_user_id() IS NOT NULL
        AND (user_id IS NULL OR user_id = public.get_app_user_id())
      );
  END IF;

  -- UPDATE: nur globaler Admin (Status-Workflow)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='feedback' AND policyname='feedback_update_globaladmin') THEN
    CREATE POLICY "feedback_update_globaladmin" ON public.feedback
      FOR UPDATE USING (public.is_global_admin())
      WITH CHECK (public.is_global_admin());
  END IF;

  -- DELETE: nur globaler Admin
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='feedback' AND policyname='feedback_delete_globaladmin') THEN
    CREATE POLICY "feedback_delete_globaladmin" ON public.feedback
      FOR DELETE USING (public.is_global_admin());
  END IF;
END $$;

-- 2c) Realtime (optional, idempotent): Board aktualisiert sich live
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='feedback'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback;
  END IF;
END $$;


-- ============================================================
-- 3) UNDO — nur im Notfall
-- ============================================================
-- DROP POLICY IF EXISTS "feedback_select_appuser"        ON public.feedback;
-- DROP POLICY IF EXISTS "feedback_insert_appuser"        ON public.feedback;
-- DROP POLICY IF EXISTS "feedback_update_globaladmin"    ON public.feedback;
-- DROP POLICY IF EXISTS "feedback_delete_globaladmin"    ON public.feedback;
-- -- Tabelle bewusst NICHT droppen (Datenverlust-Schutz). Bei Bedarf:
-- -- DROP TABLE IF EXISTS public.feedback;


-- ============================================================
-- 4) VERIFY
-- ============================================================
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='feedback' ORDER BY ordinal_position;

SELECT policyname, cmd FROM pg_policies
WHERE schemaname='public' AND tablename='feedback' ORDER BY cmd, policyname;
