-- ═══════════════════════════════════════════════════════════════
-- B5: Hub — Mitteilungen & Dienste (Küche/Hof) admin-editierbar
-- Ausgeführt: 2026-07-06 via Supabase MCP (apply_migration
-- "hub_infos_typ_mitteilung_dienst"), Projekt ooejsfixxiuobrpqgfqm.
--
-- Erweitert den typ-CHECK von hub_infos um 'mitteilung' und 'dienst',
-- damit dieselbe Board-Infrastruktur (RLS is_hub_editor, Trigger,
-- Policies aus B1) auch die Mitteilungen-Box und die Dienste-Leiste
-- (Küchendienst / Hofdienst) trägt.
--
-- Additiv, idempotent, nicht-destruktiv. Bestehende faq/termin-Zeilen
-- bleiben gültig. KEIN neuer Spaltenbedarf: mitteilung nutzt titel +
-- inhalt_html (Richtext), dienst nutzt titel (Bezeichnung) + inhalt_html
-- (Plaintext „zuständig"), position sortiert.
--
-- CHECK vorher:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'hub_infos_typ_check';
--   → CHECK (typ IN ('faq','termin'))
--
-- CHECK nachher:
--   → CHECK (typ IN ('faq','termin','mitteilung','dienst'))
--
-- UNDO (nur wenn keine mitteilung/dienst-Zeilen mehr existieren):
--   ALTER TABLE public.hub_infos DROP CONSTRAINT IF EXISTS hub_infos_typ_check;
--   ALTER TABLE public.hub_infos ADD CONSTRAINT hub_infos_typ_check
--     CHECK (typ IN ('faq','termin'));
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.hub_infos DROP CONSTRAINT IF EXISTS hub_infos_typ_check;
ALTER TABLE public.hub_infos ADD CONSTRAINT hub_infos_typ_check
  CHECK (typ IN ('faq','termin','mitteilung','dienst'));
