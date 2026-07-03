-- ═══════════════════════════════════════════════════════════════
-- S2 · Klarnamen aus öffentlichen Clients — Server-Seite
-- get_kollegium_public(): SECURITY-DEFINER-RPC, liefert NUR
-- nicht-sensible Kollegiums-Felder an eingeloggte App-User.
-- Datum: 2026-07-03 · Härtungs-Sprint Ticket S2
-- Muster: CHECK → ACTION → VERIFY → UNDO (nicht-destruktiv, idempotent)
-- Ausführen im SQL-Editor:
-- https://supabase.com/dashboard/project/ooejsfixxiuobrpqgfqm/sql/new
-- ═══════════════════════════════════════════════════════════════

-- ── CHECK (nur lesen — vorher ausführen) ─────────────────────────
-- 1) Wie viele Zeilen würde die RPC liefern?
SELECT count(*)                                                  AS users_gesamt,
       count(*) FILTER (WHERE COALESCE(status,'active')='active') AS aktiv,
       count(*) FILTER (WHERE kuerzel IS NOT NULL)                AS mit_kuerzel
FROM public.users;

-- 2) Existiert die Funktion schon? (erwartet: 0 Zeilen beim Erstlauf)
SELECT proname, prosecdef FROM pg_proc
WHERE proname = 'get_kollegium_public';

-- 3) ⚠️ WICHTIG — Kürzel-Pflege prüfen (S2 entfernt das hartkodierte
--    E-Mail→Kürzel-Mapping im Hub-Client!). Der Client-Fallback
--    deriveKuerzel() erzeugt nur 2-Buchstaben-Kürzel; Lehrkräfte mit
--    3+-Buchstaben-Kürzeln (z. B. Sch, PSch, Scha) MÜSSEN users.kuerzel
--    gesetzt haben, sonst greifen Hub-Admin-Whitelist (admin_whitelist)
--    und Modul-Zuordnungen nicht mehr. Pflege über das Hub-Admin-Panel.
--    Erwartung vor Frontend-Deploy: fehlende_kuerzel = 0 (mindestens für
--    alle Kürzel in admin_whitelist).
SELECT count(*) FILTER (WHERE kuerzel IS NULL OR kuerzel = '') AS fehlende_kuerzel
FROM public.users
WHERE COALESCE(status,'active') = 'active';
-- Detail (zeigt WER fehlt — Ergebnis nicht ins Repo kopieren, PII!):
-- SELECT id, display_name FROM public.users
-- WHERE (kuerzel IS NULL OR kuerzel = '') AND COALESCE(status,'active')='active';

-- ── ACTION ───────────────────────────────────────────────────────
-- Nur nicht-sensible Felder (KEIN email, KEIN auth_id, KEIN last_seen).
-- Gate doppelt: EXECUTE nur für 'authenticated' UND get_app_user_id()-Check
-- (Session muss zu einem App-User gehören, nicht nur irgendein Auth-Konto).
CREATE OR REPLACE FUNCTION public.get_kollegium_public()
RETURNS TABLE (
  id           bigint,
  kuerzel      text,
  display_name text,
  role         text,
  avatar_color text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT u.id, u.kuerzel, u.display_name, u.role, u.avatar_color
  FROM public.users u
  WHERE public.get_app_user_id() IS NOT NULL
    AND COALESCE(u.status, 'active') = 'active'
  ORDER BY u.display_name;
$$;

REVOKE ALL ON FUNCTION public.get_kollegium_public() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_kollegium_public() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_kollegium_public() TO authenticated;

-- ── VERIFY ───────────────────────────────────────────────────────
-- anon darf NICHT ausführen (erwartet: false), authenticated darf (true):
SELECT has_function_privilege('anon',          'public.get_kollegium_public()', 'EXECUTE') AS anon_exec,   -- soll: false
       has_function_privilege('authenticated', 'public.get_kollegium_public()', 'EXECUTE') AS auth_exec;   -- soll: true
-- Funktionaler Test (im SQL-Editor läuft man als postgres → get_app_user_id()
-- ist NULL → 0 Zeilen ist hier KORREKT; echter Test über eingeloggten Client):
SELECT count(*) AS zeilen_als_postgres FROM public.get_kollegium_public();

-- ── UNDO ─────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.get_kollegium_public();
