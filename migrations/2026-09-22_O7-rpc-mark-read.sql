-- =====================================================================
-- KRS Connect — O7: Lesestand Serverzeit (rpc_mark_channel_read /
--                  rpc_mark_conversation_read)
-- Sprint: sprint opus teams 2.0.md · Aufgabe O7 (P2)
-- Datum: 2026-09-22 · Projekt: ooejsllxiuobrpqgfqm
-- HANDOVER: 0AP
--
-- AUSFÜHRUNG: eine Transaktion (unten). Bevorzugt:
--   ~/.local/bin/supabase db query --linked --file …
-- oder KRS-Supabase-Deploy.command / SQL-Editor (gesamte Datei).
-- Idempotent: CREATE OR REPLACE + GRANT/REVOKE (zweiter Lauf ok).
--
-- WARUM:
--   markChannelRead() schrieb last_read_at = new Date().toISOString()
--   (Geräteuhr). Unread zählt gegen posts.created_at (Serveruhr).
--   Zusätzlich: ohne greatest(...) kann ein älteres Gerät den Lesestand
--   zurückdrehen. SECURITY DEFINER + get_app_user_id() verhindert, dass
--   der Client eine fremde user_id mitschickt.
--
-- CLIENT (S15 Aufgabe 6): markChannelRead → rpc_mark_channel_read;
--   localStorage nur Offline-Fallback, darf Serverwert nicht überschreiben.
-- =====================================================================

BEGIN;

-- ── rpc_mark_channel_read ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_mark_channel_read(p_channel_id bigint)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid bigint;
  v_ts  timestamptz;
BEGIN
  v_uid := public.get_app_user_id();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet (kein App-User).';
  END IF;
  IF p_channel_id IS NULL THEN
    RAISE EXCEPTION 'channel_id fehlt.';
  END IF;

  -- Policy-Logik (channel_reads_all + Team-Mitgliedschaft): SECURITY DEFINER
  -- umgeht RLS — deshalb hier explizit prüfen.
  IF NOT EXISTS (
    SELECT 1
    FROM public.channels c
    JOIN public.team_members tm ON tm.team_id = c.team_id
    WHERE c.id = p_channel_id
      AND tm.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Kein Zugriff auf Kanal %', p_channel_id;
  END IF;

  INSERT INTO public.channel_reads (user_id, channel_id, last_read_at)
  VALUES (v_uid, p_channel_id, now())
  ON CONFLICT (user_id, channel_id) DO UPDATE
    SET last_read_at = GREATEST(
      COALESCE(public.channel_reads.last_read_at, '-infinity'::timestamptz),
      now()
    )
  RETURNING last_read_at INTO v_ts;

  RETURN v_ts;
END;
$$;

COMMENT ON FUNCTION public.rpc_mark_channel_read(bigint) IS
  'O7: Lesestand Kanal auf Serverzeit (now), nie rückwärts (greatest). user_id nur aus get_app_user_id().';

REVOKE ALL ON FUNCTION public.rpc_mark_channel_read(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_mark_channel_read(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_mark_channel_read(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_mark_channel_read(bigint) TO service_role;

-- ── rpc_mark_conversation_read (analog) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_mark_conversation_read(p_conversation_id bigint)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid bigint;
  v_ts  timestamptz;
BEGIN
  v_uid := public.get_app_user_id();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet (kein App-User).';
  END IF;
  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'conversation_id fehlt.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_members cm
    WHERE cm.conversation_id = p_conversation_id
      AND cm.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Kein Zugriff auf Konversation %', p_conversation_id;
  END IF;

  INSERT INTO public.conversation_reads (user_id, conversation_id, last_read_at)
  VALUES (v_uid, p_conversation_id, now())
  ON CONFLICT (user_id, conversation_id) DO UPDATE
    SET last_read_at = GREATEST(
      COALESCE(public.conversation_reads.last_read_at, '-infinity'::timestamptz),
      now()
    )
  RETURNING last_read_at INTO v_ts;

  RETURN v_ts;
END;
$$;

COMMENT ON FUNCTION public.rpc_mark_conversation_read(bigint) IS
  'O7: Lesestand Chat auf Serverzeit (now), nie rückwärts (greatest). user_id nur aus get_app_user_id().';

REVOKE ALL ON FUNCTION public.rpc_mark_conversation_read(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_mark_conversation_read(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_mark_conversation_read(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_mark_conversation_read(bigint) TO service_role;

COMMIT;

-- ── VERIFY (nach dem Commit, separat im SQL-Editor ok) ────────────────
-- SELECT proname, prosecdef
-- FROM pg_proc
-- WHERE proname IN ('rpc_mark_channel_read','rpc_mark_conversation_read')
-- ORDER BY 1;
--
-- SELECT
--   has_function_privilege('anon',          'public.rpc_mark_channel_read(bigint)', 'EXECUTE') AS anon_ch,   -- false
--   has_function_privilege('authenticated', 'public.rpc_mark_channel_read(bigint)', 'EXECUTE') AS auth_ch,   -- true
--   has_function_privilege('anon',          'public.rpc_mark_conversation_read(bigint)', 'EXECUTE') AS anon_cv,
--   has_function_privilege('authenticated', 'public.rpc_mark_conversation_read(bigint)', 'EXECUTE') AS auth_cv;
--
-- UNDO:
-- DROP FUNCTION IF EXISTS public.rpc_mark_channel_read(bigint);
-- DROP FUNCTION IF EXISTS public.rpc_mark_conversation_read(bigint);
