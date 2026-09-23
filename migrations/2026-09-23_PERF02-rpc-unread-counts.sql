-- =====================================================================
-- KRS Connect — PERF-02: Unread-Counts in einem Roundtrip
--   rpc_unread_channel_counts / rpc_unread_conversation_counts
-- Sprint: _lokal/SPRINT-CODEX-PERF02-UNREAD-RPC-2026-09-23.md
-- Datum: 2026-09-23 · Projekt: ooejsfixxiuobrpqgfqm (krs-connect)
-- HANDOVER: 0AZ / PERF-02
--
-- AUSFÜHRUNG: eine Transaktion (unten). Bevorzugt:
--   SQL-Editor in Supabase (gesamte Datei) oder
--   ~/.local/bin/supabase db query --linked --file …
-- Idempotent: CREATE OR REPLACE + GRANT/REVOKE (zweiter Lauf ok).
--
-- WARUM:
--   getChannelUnreadCounts / getConversationUnreadCounts machen heute
--   1× Reads-Query + N× count-head pro Kanal/Chat (Boot-Sturm).
--   Diese RPCs liefern alle Counts in 1 Call, nur für den angemeldeten
--   App-User (get_app_user_id), mit Membership-Filter.
--
-- SEMANTIK (gleich Client-Logik, aber nur DB-Lesestand):
--   Channel: posts mit parent_id IS NULL, author_id <> uid,
--            created_at > coalesce(channel_reads.last_read_at, -infinity)
--   Conversation: messages mit sender_id <> uid,
--            created_at > coalesce(conversation_reads.last_read_at, -infinity)
--   localStorage-only Lesestände ohne DB-Zeile sind hier unsichtbar
--   (nach O7 mark-read RPC sollte der Serverstand führend sein).
--
-- CLIENT (noch NICHT in diesem Schritt): Flag + Fallback auf alten N-Pfad
--   bis die Migration in Prod liegt. Siehe Mini-Sprint.
--
-- SICHERHEIT: SECURITY DEFINER + search_path=public; uid nur aus
--   get_app_user_id(); explizite Membership; kein service_role im Client;
--   GRANT nur authenticated (+ service_role wie O7); REVOKE anon/PUBLIC.
--   Keine RLS-/Storage-Policy-Änderung.
-- =====================================================================

BEGIN;

-- ── rpc_unread_channel_counts ────────────────────────────────────────
-- p_channel_ids NULL → alle Kanäle der Teams, in denen uid Mitglied ist
-- p_channel_ids gesetzt → Schnittmenge (Membership trotzdem Pflicht)
CREATE OR REPLACE FUNCTION public.rpc_unread_channel_counts(p_channel_ids bigint[] DEFAULT NULL)
RETURNS TABLE(channel_id bigint, unread_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_uid bigint;
BEGIN
  v_uid := public.get_app_user_id();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet (kein App-User).';
  END IF;

  RETURN QUERY
  WITH accessible AS (
    SELECT c.id AS channel_id
    FROM public.channels c
    JOIN public.team_members tm ON tm.team_id = c.team_id
    WHERE tm.user_id = v_uid
      AND (p_channel_ids IS NULL OR c.id = ANY (p_channel_ids))
  ),
  reads AS (
    SELECT cr.channel_id, cr.last_read_at
    FROM public.channel_reads cr
    WHERE cr.user_id = v_uid
      AND cr.channel_id IN (SELECT a.channel_id FROM accessible a)
  )
  SELECT
    a.channel_id,
    (
      SELECT count(*)::bigint
      FROM public.posts p
      WHERE p.channel_id = a.channel_id
        AND p.parent_id IS NULL
        AND p.author_id IS DISTINCT FROM v_uid
        AND p.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
    ) AS unread_count
  FROM accessible a
  LEFT JOIN reads r ON r.channel_id = a.channel_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_unread_channel_counts(bigint[]) IS
  'PERF-02: Unread-Counts aller (oder gefilterter) Team-Kanäle für get_app_user_id(); ein Roundtrip.';

REVOKE ALL ON FUNCTION public.rpc_unread_channel_counts(bigint[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_unread_channel_counts(bigint[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_unread_channel_counts(bigint[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_unread_channel_counts(bigint[]) TO service_role;

-- ── rpc_unread_conversation_counts ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_unread_conversation_counts(p_conversation_ids bigint[] DEFAULT NULL)
RETURNS TABLE(conversation_id bigint, unread_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_uid bigint;
BEGIN
  v_uid := public.get_app_user_id();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet (kein App-User).';
  END IF;

  RETURN QUERY
  WITH accessible AS (
    SELECT cm.conversation_id
    FROM public.conversation_members cm
    WHERE cm.user_id = v_uid
      AND (p_conversation_ids IS NULL OR cm.conversation_id = ANY (p_conversation_ids))
  ),
  reads AS (
    SELECT cr.conversation_id, cr.last_read_at
    FROM public.conversation_reads cr
    WHERE cr.user_id = v_uid
      AND cr.conversation_id IN (SELECT a.conversation_id FROM accessible a)
  )
  SELECT
    a.conversation_id,
    (
      SELECT count(*)::bigint
      FROM public.messages m
      WHERE m.conversation_id = a.conversation_id
        AND m.sender_id IS DISTINCT FROM v_uid
        AND m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
    ) AS unread_count
  FROM accessible a
  LEFT JOIN reads r ON r.conversation_id = a.conversation_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_unread_conversation_counts(bigint[]) IS
  'PERF-02: Unread-Counts aller (oder gefilterter) Conversations für get_app_user_id(); ein Roundtrip.';

REVOKE ALL ON FUNCTION public.rpc_unread_conversation_counts(bigint[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_unread_conversation_counts(bigint[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_unread_conversation_counts(bigint[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_unread_conversation_counts(bigint[]) TO service_role;

COMMIT;
