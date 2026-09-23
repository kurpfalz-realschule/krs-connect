-- ============================================================================
-- RLS-PERF Phase 2a — Hilfsfunktionen + posts, reactions, post_reads
-- Projekt: ooejsfixxiuobrpqgfqm · Rollback: 2026-09-23_RLS-PERF_rollback.sql
-- Regeln: genau eine Regel je Tabelle+Aktion, TO authenticated, Aufrufe in
-- (SELECT …) → einmal pro Abfrage. Sichtbarkeit = bisherige ODER-Vereinigung.
-- ============================================================================

-- Hilfsfunktionen (SECURITY DEFINER → keine verschachtelte RLS/Rekursion;
-- nutzen get_app_user_id() inkl. E-Mail-Fallback = weiteste bisherige Menge)
CREATE OR REPLACE FUNCTION public.rls_my_team_ids()
RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tm.team_id FROM public.team_members tm
   WHERE tm.user_id = (SELECT public.get_app_user_id());
$$;
CREATE OR REPLACE FUNCTION public.rls_my_admin_team_ids()
RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tm.team_id FROM public.team_members tm
   WHERE tm.user_id = (SELECT public.get_app_user_id()) AND tm.role = 'admin';
$$;
CREATE OR REPLACE FUNCTION public.rls_my_conversation_ids()
RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cm.conversation_id FROM public.conversation_members cm
   WHERE cm.user_id = (SELECT public.get_app_user_id());
$$;
REVOKE ALL ON FUNCTION public.rls_my_team_ids()         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_my_admin_team_ids()   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_my_conversation_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_my_team_ids()         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rls_my_admin_team_ids()   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rls_my_conversation_ids() TO authenticated, service_role;

-- posts (INSERT = posts_insert_member aus Phase 1, bleibt)
DROP POLICY IF EXISTS posts_select              ON public.posts;
DROP POLICY IF EXISTS posts_select_member       ON public.posts;
DROP POLICY IF EXISTS posts_update_own_or_owner ON public.posts;
DROP POLICY IF EXISTS posts_delete_own_or_owner ON public.posts;
CREATE POLICY posts_select_member ON public.posts
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (channel_id IN (SELECT c.id FROM public.channels c
                         WHERE c.team_id IN (SELECT public.rls_my_team_ids())));
CREATE POLICY posts_update_own_or_owner ON public.posts
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING      (author_id = (SELECT public.get_app_user_id()) OR (SELECT public.is_platform_owner()))
  WITH CHECK (author_id = (SELECT public.get_app_user_id()) OR (SELECT public.is_platform_owner()));
CREATE POLICY posts_delete_own_or_owner ON public.posts
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (author_id = (SELECT public.get_app_user_id()) OR (SELECT public.is_platform_owner()));

-- reactions (INSERT = reactions_insert_own aus Phase 1, bleibt)
DROP POLICY IF EXISTS reactions_select_scoped ON public.reactions;
DROP POLICY IF EXISTS reactions_delete_own    ON public.reactions;
CREATE POLICY reactions_select_scoped ON public.reactions
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    user_id = (SELECT public.get_app_user_id())
    OR (target_type = 'post' AND target_id IN (
          SELECT p.id FROM public.posts p
           WHERE p.channel_id IN (SELECT c.id FROM public.channels c
                                   WHERE c.team_id IN (SELECT public.rls_my_team_ids()))))
    OR (target_type = 'message' AND target_id IN (
          SELECT m.id FROM public.messages m
           WHERE m.conversation_id IN (SELECT public.rls_my_conversation_ids())))
  );
CREATE POLICY reactions_delete_own ON public.reactions
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (user_id = (SELECT public.get_app_user_id()));

-- post_reads (INSERT = post_reads_insert_own aus Phase 1, bleibt)
DROP POLICY IF EXISTS post_reads_select           ON public.post_reads;
DROP POLICY IF EXISTS post_reads_select_teamscope ON public.post_reads;
DROP POLICY IF EXISTS post_reads_update_own       ON public.post_reads;
CREATE POLICY post_reads_select ON public.post_reads
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    user_id = (SELECT public.get_app_user_id())
    OR post_id IN (SELECT p.id FROM public.posts p
                    WHERE p.channel_id IN (SELECT c.id FROM public.channels c
                                            WHERE c.team_id IN (SELECT public.rls_my_team_ids())))
  );
CREATE POLICY post_reads_update_own ON public.post_reads
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (user_id = (SELECT public.get_app_user_id()));
