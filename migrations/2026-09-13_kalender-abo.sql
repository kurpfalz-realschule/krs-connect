-- =====================================================================
-- KRS Connect — Kalender-Abo (ICS-Spiegel des Schuljahreskalenders)
-- Datum: 2026-09-13 · Projekt: ooejsfixxiuobrpqgfqm (eu-west-1)
-- Sprint: `sprint opus kalender connect.md`, Aufgabe 2
--
-- STATUS: **AM 13.09.2026 ANGEWENDET** (Block 2 gelaufen, Block 4 geprüft).
--   Diese Datei ist die Dokumentation dazu — nicht erneut ausführen nötig
--   (wäre aber idempotent).
--
-- AUSFÜHRUNG: Supabase SQL-Editor.
--   Block 1 (CHECK) ZUERST lesen. Dann Block 2 (ACTION), Block 4 (VERIFY).
--   Block 3 (UNDO) nur im Notfall. Idempotent, rein additiv.
--
-- ---------------------------------------------------------------------
-- WAS HIER ENTSTEHT
-- ---------------------------------------------------------------------
--   public.kalender_quellen      — welche Kalender gespiegelt werden
--   public.kalender_termine      — der Spiegel selbst (Edge Function schreibt)
--   public.kalender_feed_tokens  — Rückrichtung: ICS-Abo der Team-Termine
--
-- Connect ist LESER, nicht Quelle: geschrieben wird ausschließlich von der
-- Edge Function `kalender-sync` mit service_role. Für `anon` und für
-- angemeldete Nutzer gibt es KEINE INSERT/UPDATE/DELETE-Policy — RLS ohne
-- passende Policy bedeutet Default-Deny, service_role umgeht RLS ohnehin.
--
-- ---------------------------------------------------------------------
-- ZWEI ENTWURFSENTSCHEIDUNGEN, DIE MAN SPÄTER SONST TEUER BEZAHLT
-- ---------------------------------------------------------------------
-- (1) `url_secret` enthält NICHT die Kalender-URL, sondern den NAMEN des
--     Function-Secrets, unter dem sie in den Supabase-Secrets liegt
--     (z. B. 'ICS_URL_SCHULJAHR'). Grund: ein veröffentlichter Outlook-Link
--     ist ein Passwort — wer ihn hat, sieht den Kalender. Läge er in einer
--     Tabelle, die angemeldete Nutzer lesen dürfen, wäre er öffentlich.
--     So steht in der Datenbank nur ein harmloser Variablenname, die URL
--     kennt allein die Edge Function. Der CHECK erzwingt das Format und
--     verhindert, dass versehentlich doch eine URL eingetragen wird.
--
-- (2) `recurrence_id` ist `text NOT NULL DEFAULT ''`, nicht NULL-fähig.
--     In Postgres sind zwei NULL-Werte für einen UNIQUE-Index NICHT gleich —
--     mit NULL für „normaler Einzeltermin" würde jeder Sync-Lauf neue Zeilen
--     anlegen statt zu aktualisieren. Genau die Dubletten, die das
--     Akzeptanzkriterium ausschließt. '' ist der Serien-Master.
-- =====================================================================


-- ============================================================
-- 1) CHECK  (NUR LESEN!)
-- ============================================================
-- Helper vorhanden? (Erwartung: alle vier nicht NULL)
SELECT to_regprocedure('public.get_app_user_id()')    AS get_app_user_id,
       to_regprocedure('public.is_global_admin()')    AS is_global_admin,
       to_regprocedure('public.is_team_admin(text)')  AS is_team_admin,
       to_regprocedure('public.is_team_member(text)') AS is_team_member;

-- Tabellennamen frei? (Erwartung: 0 Zeilen)
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('kalender_quellen','kalender_termine','kalender_feed_tokens');


-- ============================================================
-- 2) ACTION
-- ============================================================
DO $$
BEGIN
  IF to_regprocedure('public.get_app_user_id()') IS NULL
     OR to_regprocedure('public.is_team_member(text)') IS NULL THEN
    RAISE EXCEPTION 'Helper fehlen — zuerst die Migrationen 2026-06-20 und 2026-06-22 ausführen.';
  END IF;
END $$;

-- 2a) Quellen ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kalender_quellen (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           text NOT NULL,
  typ            text NOT NULL DEFAULT 'ics' CHECK (typ IN ('ics','graph')),
  -- NAME des Function-Secrets mit der URL — niemals die URL selbst:
  url_secret     text NOT NULL CHECK (url_secret ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  farbe          text NOT NULL DEFAULT '#2563eb' CHECK (farbe ~* '^#[0-9a-f]{6}$'),
  aktiv          boolean NOT NULL DEFAULT true,
  sichtbar_fuer  bigint REFERENCES public.teams(id) ON DELETE CASCADE,  -- NULL = alle
  sort_order     int NOT NULL DEFAULT 0,
  letzter_abruf  timestamptz,
  letzter_fehler text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.kalender_quellen.url_secret IS
  'Name des Supabase-Function-Secrets, das die ICS-URL enthält (NICHT die URL).';
COMMENT ON COLUMN public.kalender_quellen.sichtbar_fuer IS
  'NULL = für alle angemeldeten Nutzer sichtbar; sonst nur für Mitglieder dieses Teams.';

-- 2b) Gespiegelte Termine -----------------------------------------
CREATE TABLE IF NOT EXISTS public.kalender_termine (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quelle_id       bigint NOT NULL REFERENCES public.kalender_quellen(id) ON DELETE CASCADE,
  uid             text NOT NULL,
  recurrence_id   text NOT NULL DEFAULT '',   -- '' = Einzeltermin/Serien-Master
  titel           text NOT NULL,
  start_ts        timestamptz NOT NULL,
  ende_ts         timestamptz NOT NULL,       -- EXKLUSIV (wie DTEND in ICS)
  ganztags        boolean NOT NULL DEFAULT false,
  ort             text,
  zuletzt_gesehen timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kalender_termine_ende_nach_start CHECK (ende_ts >= start_ts)
);

COMMENT ON COLUMN public.kalender_termine.ende_ts IS
  'EXKLUSIVES Ende wie DTEND in ICS. Ganztägig: letzter angezeigter Tag = ende_ts - 1 Tag.';
COMMENT ON COLUMN public.kalender_termine.start_ts IS
  'Ganztägige Termine sind auf Mitternacht Europe/Berlin verankert. Anzeige IMMER mit timeZone Europe/Berlin formatieren, sonst rutscht das Datum.';

CREATE UNIQUE INDEX IF NOT EXISTS kalender_termine_key_idx
  ON public.kalender_termine (quelle_id, uid, recurrence_id);
CREATE INDEX IF NOT EXISTS kalender_termine_start_idx
  ON public.kalender_termine (start_ts);
CREATE INDEX IF NOT EXISTS kalender_termine_quelle_start_idx
  ON public.kalender_termine (quelle_id, start_ts);

-- 2c) Abo-Token für die Rückrichtung (Team-Termine nach Outlook) ----
CREATE TABLE IF NOT EXISTS public.kalender_feed_tokens (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       bigint NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  token         text NOT NULL UNIQUE CHECK (length(token) >= 32),
  aktiv         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  letzter_abruf timestamptz
);

-- 2d) RLS ----------------------------------------------------------
ALTER TABLE public.kalender_quellen     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kalender_termine     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kalender_feed_tokens ENABLE ROW LEVEL SECURITY;

-- Lesen: nur angemeldete App-Nutzer. get_app_user_id() ist SECURITY DEFINER
-- und liefert für anon NULL — dasselbe Muster wie im S3-Lockdown.
DROP POLICY IF EXISTS "kalender_quellen_select_app_user" ON public.kalender_quellen;
CREATE POLICY "kalender_quellen_select_app_user" ON public.kalender_quellen
  FOR SELECT USING (
    public.get_app_user_id() IS NOT NULL
    AND aktiv
    AND (sichtbar_fuer IS NULL OR public.is_team_member(sichtbar_fuer::text))
  );

DROP POLICY IF EXISTS "kalender_termine_select_app_user" ON public.kalender_termine;
CREATE POLICY "kalender_termine_select_app_user" ON public.kalender_termine
  FOR SELECT USING (
    public.get_app_user_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.kalender_quellen q
      WHERE q.id = kalender_termine.quelle_id
        AND q.aktiv
        AND (q.sichtbar_fuer IS NULL OR public.is_team_member(q.sichtbar_fuer::text))
    )
  );

-- Eigenes Abo-Token sehen (für „Link anzeigen" in den Einstellungen).
DROP POLICY IF EXISTS "kalender_feed_tokens_select_own" ON public.kalender_feed_tokens;
CREATE POLICY "kalender_feed_tokens_select_own" ON public.kalender_feed_tokens
  FOR SELECT USING (user_id = public.get_app_user_id());

-- BEWUSST KEINE INSERT/UPDATE/DELETE-Policy auf allen drei Tabellen:
-- geschrieben wird nur mit service_role aus den Edge Functions.

-- 2e) anon bekommt gar nichts (Gürtel und Hosenträger neben RLS) ----
REVOKE ALL ON public.kalender_quellen     FROM anon;
REVOKE ALL ON public.kalender_termine     FROM anon;
REVOKE ALL ON public.kalender_feed_tokens FROM anon;
-- Angemeldete dürfen lesen; Schreibrechte nimmt ihnen die fehlende Policy,
-- die Grants werden zusätzlich entzogen.
REVOKE INSERT, UPDATE, DELETE ON public.kalender_quellen     FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.kalender_termine     FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.kalender_feed_tokens FROM authenticated;
GRANT SELECT ON public.kalender_quellen     TO authenticated;
GRANT SELECT ON public.kalender_termine     TO authenticated;
GRANT SELECT ON public.kalender_feed_tokens TO authenticated;

-- 2f) Löschkonzept als Funktion (siehe KALENDER-DSGVO.md, Abschnitt 4) --
-- Sicherheitsnetz: greift auch dann, wenn der Sync längere Zeit ausfällt.
CREATE OR REPLACE FUNCTION public.kalender_retention()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE geloescht integer;
BEGIN
  DELETE FROM public.kalender_termine
  WHERE ende_ts < now() - interval '2 months';
  GET DIAGNOSTICS geloescht = ROW_COUNT;
  RETURN geloescht;
END $$;

REVOKE ALL ON FUNCTION public.kalender_retention() FROM public, anon, authenticated;

COMMENT ON FUNCTION public.kalender_retention() IS
  'Löschfrist: gespiegelte Termine verschwinden zwei Monate nach ihrem Ende. Wird von der Edge Function kalender-sync bei jedem Lauf aufgerufen.';


-- ============================================================
-- 3) UNDO — nur im Notfall
-- ============================================================
-- DROP POLICY IF EXISTS "kalender_quellen_select_app_user"  ON public.kalender_quellen;
-- DROP POLICY IF EXISTS "kalender_termine_select_app_user"  ON public.kalender_termine;
-- DROP POLICY IF EXISTS "kalender_feed_tokens_select_own"   ON public.kalender_feed_tokens;
-- DROP FUNCTION IF EXISTS public.kalender_retention();
-- -- Tabellen zuletzt (Reihenfolge wegen der Fremdschlüssel):
-- DROP TABLE IF EXISTS public.kalender_feed_tokens;
-- DROP TABLE IF EXISTS public.kalender_termine;
-- DROP TABLE IF EXISTS public.kalender_quellen;


-- ============================================================
-- 4) VERIFY
-- ============================================================
-- 4a) Spalten
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('kalender_quellen','kalender_termine','kalender_feed_tokens')
ORDER BY table_name, ordinal_position;

-- 4b) Policies — Erwartung: genau drei SELECT-Policies, sonst nichts
SELECT tablename, policyname, cmd, roles FROM pg_policies
WHERE schemaname='public' AND tablename LIKE 'kalender_%'
ORDER BY tablename, cmd, policyname;

-- 4c) Rechte — Erwartung: anon kommt in dieser Liste NICHT vor
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name LIKE 'kalender_%'
  AND grantee IN ('anon','authenticated')
ORDER BY table_name, grantee, privilege_type;

-- 4d) Eindeutigkeit — Erwartung: kalender_termine_key_idx mit UNIQUE
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename='kalender_termine';
