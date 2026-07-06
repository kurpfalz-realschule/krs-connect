-- ═══════════════════════════════════════════════════════════════
-- B1: Hub — Schulleitungs-Board (FAQs + wichtige Termine)
-- Ausgeführt: 2026-07-05 via Supabase MCP (apply_migration
-- "hub_infos_schulleitungs_board"), Projekt ooejsfixxiuobrpqgfqm.
--
-- Lesen:     alle eingeloggten App-User (authenticated + get_app_user_id)
-- Schreiben: role='admin' (Ktz, Adm) ODER users.hub_editor=true (Sm)
-- Additiv, idempotent, nicht-destruktiv.
--
-- CHECK vorher (Editor-Kandidaten):
--   SELECT kuerzel, role, hub_editor FROM users
--   WHERE hub_editor OR role='admin';
--   → Ergebnis nach Migration: Adm(admin), Ktz(admin), Sm(hub_editor)
--
-- UNDO:
--   DROP TABLE IF EXISTS public.hub_infos;
--   DROP FUNCTION IF EXISTS public.is_hub_editor();
--   DROP FUNCTION IF EXISTS public.hub_infos_touch();
--   ALTER TABLE public.users DROP COLUMN IF EXISTS hub_editor;
-- ═══════════════════════════════════════════════════════════════

-- 1) Editor-Flag am User (Daniel Schmitt = Sm)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS hub_editor boolean NOT NULL DEFAULT false;
UPDATE public.users SET hub_editor = true WHERE kuerzel = 'Sm' AND hub_editor = false;

-- 2) Inhaltstabelle
CREATE TABLE IF NOT EXISTS public.hub_infos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  typ text NOT NULL CHECK (typ IN ('faq','termin')),
  titel text NOT NULL CHECK (char_length(titel) BETWEEN 1 AND 300),
  inhalt_html text NOT NULL DEFAULT '' CHECK (char_length(inhalt_html) <= 20000),
  datum date,                      -- nur für typ='termin'
  position int NOT NULL DEFAULT 0, -- Sortierung FAQ
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text                  -- Kürzel, serverseitig per Trigger gesetzt
);
CREATE INDEX IF NOT EXISTS hub_infos_typ_idx ON public.hub_infos (typ, datum, position);

ALTER TABLE public.hub_infos ENABLE ROW LEVEL SECURITY;

-- 3) Editor-Check (SECURITY DEFINER, nutzt bestehendes get_app_user_id)
CREATE OR REPLACE FUNCTION public.is_hub_editor()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = public.get_app_user_id()
      AND COALESCE(u.status, 'active') = 'active'
      AND (u.role = 'admin' OR u.hub_editor = true)
  );
$$;

-- 4) updated_at/updated_by serverseitig setzen (nicht vom Client vertrauen)
CREATE OR REPLACE FUNCTION public.hub_infos_touch()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := (SELECT kuerzel FROM public.users WHERE id = public.get_app_user_id());
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hub_infos_touch_trg ON public.hub_infos;
CREATE TRIGGER hub_infos_touch_trg BEFORE INSERT OR UPDATE ON public.hub_infos
  FOR EACH ROW EXECUTE FUNCTION public.hub_infos_touch();

-- 5) Policies: fail-closed, kein anon-Zugriff
DROP POLICY IF EXISTS hub_infos_read   ON public.hub_infos;
DROP POLICY IF EXISTS hub_infos_insert ON public.hub_infos;
DROP POLICY IF EXISTS hub_infos_update ON public.hub_infos;
DROP POLICY IF EXISTS hub_infos_delete ON public.hub_infos;
CREATE POLICY hub_infos_read ON public.hub_infos FOR SELECT TO authenticated
  USING (public.get_app_user_id() IS NOT NULL);
CREATE POLICY hub_infos_insert ON public.hub_infos FOR INSERT TO authenticated
  WITH CHECK (public.is_hub_editor());
CREATE POLICY hub_infos_update ON public.hub_infos FOR UPDATE TO authenticated
  USING (public.is_hub_editor()) WITH CHECK (public.is_hub_editor());
CREATE POLICY hub_infos_delete ON public.hub_infos FOR DELETE TO authenticated
  USING (public.is_hub_editor());
