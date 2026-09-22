-- =====================================================================
-- KRS Connect — O6: Anzeigename „Nachname“ als eine DB-Quelle
-- Sprint: sprint opus teams 2.0.md · Aufgabe O6 (P1)
-- Datum: 2026-09-22 · Projekt: ooejsllxiuobrpqgfqm
--
-- AUSFÜHRUNG: eine Transaktion (unten). Bevorzugt über
--   KRS-Supabase-Deploy.command / supabase CLI mit hinterlegtem Token.
-- Alternativ: SQL-Editor (gesamte Datei). Idempotent: zweiter Lauf
-- überschreibt keine von Hand gesetzten anzeigename-Werte.
--
-- NICHT anfassen: display_name, kuerzel (bleiben Schlüssel).
-- Oberfläche = S16 (Sonnet), nicht dieser Sprint.
-- =====================================================================

BEGIN;

-- ── 1) Spalten ───────────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS nachname text;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS anzeigename text;

COMMENT ON COLUMN public.users.nachname IS
  'O6: reiner Nachname (Backfill aus display_name inkl. Namenszusätze). Sortierung/Suche.';
COMMENT ON COLUMN public.users.anzeigename IS
  'O6: global eindeutiger Anzeigename für alle Apps. Manuell überschreibbar; Backfill setzt nur NULL bzw. Default=nachname.';

-- ── 2) Hilfsfunktion nur für diesen Lauf (danach DROP) ───────────────
CREATE OR REPLACE FUNCTION public._o6_extract_nachname(p_display text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  n int;
  last_w text;
  prev_w text;
  prev2_w text;
  two text;
  particles text[] := ARRAY[
    'von','van','de','del','della','di','da','dos','zu','zum','la','le','mac','mc',
    'o''','o‘','o’'
  ];
BEGIN
  IF p_display IS NULL OR btrim(p_display) = '' THEN
    RETURN NULL;
  END IF;
  parts := regexp_split_to_array(btrim(p_display), E'\\s+');
  n := coalesce(array_length(parts, 1), 0);
  IF n < 1 THEN
    RETURN NULL;
  END IF;
  last_w := parts[n];
  IF n >= 3 THEN
    prev2_w := parts[n - 2];
    prev_w  := parts[n - 1];
    two := lower(prev2_w || ' ' || prev_w);
    IF two IN ('von der', 'van der') THEN
      RETURN prev2_w || ' ' || prev_w || ' ' || last_w;
    END IF;
  END IF;
  IF n >= 2 THEN
    prev_w := parts[n - 1];
    IF lower(prev_w) = ANY (particles) THEN
      RETURN prev_w || ' ' || last_w;
    END IF;
  END IF;
  RETURN last_w;
END;
$$;

CREATE OR REPLACE FUNCTION public._o6_extract_vorname(p_display text, p_nachname text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  trimmed text;
  prefix text;
BEGIN
  IF p_display IS NULL OR btrim(p_display) = '' THEN
    RETURN NULL;
  END IF;
  trimmed := btrim(p_display);
  IF p_nachname IS NULL OR p_nachname = '' THEN
    RETURN split_part(trimmed, ' ', 1);
  END IF;
  -- Alles vor dem Nachnamen (am Ende), getrimmt
  IF right(lower(trimmed), length(p_nachname)) = lower(p_nachname)
     AND length(trimmed) > length(p_nachname) THEN
    prefix := btrim(left(trimmed, length(trimmed) - length(p_nachname)));
    IF prefix = '' THEN
      RETURN NULL;
    END IF;
    RETURN split_part(prefix, ' ', 1);
  END IF;
  -- Fallback: erstes Token, wenn Display mehrteilig
  IF position(' ' in trimmed) > 0 THEN
    RETURN split_part(trimmed, ' ', 1);
  END IF;
  RETURN NULL;
END;
$$;

-- ── 3) Backfill nachname (nur leere) ─────────────────────────────────
UPDATE public.users u
SET nachname = public._o6_extract_nachname(u.display_name)
WHERE u.nachname IS NULL
  AND u.display_name IS NOT NULL
  AND btrim(u.display_name) <> '';

-- ── 4) Backfill anzeigename = nachname (nur leere) ───────────────────
UPDATE public.users u
SET anzeigename = u.nachname
WHERE u.anzeigename IS NULL
  AND u.nachname IS NOT NULL
  AND btrim(u.nachname) <> '';

-- ── 5) Eindeutigmachung unter aktiven Nutzern ────────────────────────
-- Stufe A: gleicher Nachname → „Nachname X.“ (Vorname-Initial) für ALLE Träger.
-- Nur Zeilen, die noch Default sind (NULL oder exakt = nachname), damit
-- Handkorrekturen erhalten bleiben.
WITH dups AS (
  SELECT nachname
  FROM public.users
  WHERE coalesce(status, 'active') = 'active'
    AND nachname IS NOT NULL
    AND btrim(nachname) <> ''
  GROUP BY nachname
  HAVING count(*) > 1
),
staged AS (
  SELECT
    u.id,
    u.nachname,
    public._o6_extract_vorname(u.display_name, u.nachname) AS vorname,
    upper(left(public._o6_extract_vorname(u.display_name, u.nachname), 1)) AS initial
  FROM public.users u
  JOIN dups d ON d.nachname = u.nachname
  WHERE coalesce(u.status, 'active') = 'active'
)
UPDATE public.users u
SET anzeigename = CASE
  WHEN s.initial IS NOT NULL AND s.initial <> '' THEN
    s.nachname || ' ' || s.initial || '.'
  WHEN s.vorname IS NOT NULL AND btrim(s.vorname) <> '' THEN
    s.nachname || ' ' || s.vorname
  ELSE
    s.nachname
END
FROM staged s
WHERE u.id = s.id
  AND (u.anzeigename IS NULL OR u.anzeigename = u.nachname);

-- Stufe B: immer noch doppelt unter active (gleicher Nachname + gleiches Initial)
-- → ganzen Vornamen anhängen. Wieder nur Default-Zeilen.
WITH still_dups AS (
  SELECT anzeigename
  FROM public.users
  WHERE coalesce(status, 'active') = 'active'
    AND anzeigename IS NOT NULL
    AND btrim(anzeigename) <> ''
  GROUP BY anzeigename
  HAVING count(*) > 1
),
staged2 AS (
  SELECT
    u.id,
    u.nachname,
    public._o6_extract_vorname(u.display_name, u.nachname) AS vorname
  FROM public.users u
  JOIN still_dups d ON d.anzeigename = u.anzeigename
  WHERE coalesce(u.status, 'active') = 'active'
)
UPDATE public.users u
SET anzeigename = CASE
  WHEN s.vorname IS NOT NULL AND btrim(s.vorname) <> '' THEN
    s.nachname || ' ' || s.vorname
  ELSE
    u.anzeigename
END
FROM staged2 s
WHERE u.id = s.id
  AND (
    u.anzeigename IS NULL
    OR u.anzeigename = u.nachname
    OR u.anzeigename ~ ('^' || replace(replace(u.nachname, '\', '\\'), '.', '\.') || ' [A-Za-zÄÖÜäöü]\.$')
  );

-- ── 6) RPC: Rückgabetyp ändert sich → DROP + CREATE ──────────────────
DROP FUNCTION IF EXISTS public.get_kollegium_public();

CREATE FUNCTION public.get_kollegium_public()
RETURNS TABLE (
  id            bigint,
  kuerzel       text,
  display_name  text,
  role          text,
  avatar_color  text,
  anzeigename   text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    u.id,
    u.kuerzel,
    u.display_name,
    u.role,
    u.avatar_color,
    u.anzeigename
  FROM public.users u
  WHERE public.get_app_user_id() IS NOT NULL
    AND coalesce(u.status, 'active') = 'active'
  ORDER BY u.display_name;
$$;

REVOKE ALL ON FUNCTION public.get_kollegium_public() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_kollegium_public() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_kollegium_public() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_kollegium_public() TO service_role;

-- ── 7) Hilfsfunktionen wieder entfernen ──────────────────────────────
DROP FUNCTION IF EXISTS public._o6_extract_vorname(text, text);
DROP FUNCTION IF EXISTS public._o6_extract_nachname(text);

COMMIT;

-- =====================================================================
-- PRÜFABFRAGE (nach dem COMMIT separat ausführen — siehe
-- sql/2026-09-22_O6-pruefabfrage.sql). Hier nur Kurzkommentar:
--   leere anzeigename = 0
--   doppelte anzeigename (active) = 0
--   auffällige Zeilen: teile>=3 oder teile=1
-- =====================================================================
