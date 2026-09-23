-- ============================================================================
-- RLS-PERF Phase 2d — users, channel_reads, conversation_reads
-- Projekt: ooejsfixxiuobrpqgfqm
-- ============================================================================

-- users (Rollenänderung weiterhin durch Trigger guard_user_role_change abgesichert)
DROP POLICY IF EXISTS users_select       ON public.users;
DROP POLICY IF EXISTS users_select_all   ON public.users;
DROP POLICY IF EXISTS users_select_auth  ON public.users;
DROP POLICY IF EXISTS users_insert_admin ON public.users;
DROP POLICY IF EXISTS users_update_admin ON public.users;
DROP POLICY IF EXISTS users_update_own   ON public.users;
CREATE POLICY users_select_auth ON public.users
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY users_insert_admin ON public.users
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u
                       WHERE u.auth_id = (SELECT auth.uid()) AND u.role = 'admin'));
-- bisher: Admin (users.role='admin') ODER eigene Zeile
CREATE POLICY users_update_own_or_admin ON public.users
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    auth_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.users u
                WHERE u.auth_id = (SELECT auth.uid()) AND u.role = 'admin'))
  WITH CHECK (
    auth_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.users u
                WHERE u.auth_id = (SELECT auth.uid()) AND u.role = 'admin'));

-- channel_reads / conversation_reads
DROP POLICY IF EXISTS channel_reads_all ON public.channel_reads;
CREATE POLICY channel_reads_all ON public.channel_reads
  AS PERMISSIVE FOR ALL TO authenticated
  USING      (user_id = (SELECT public.get_app_user_id()))
  WITH CHECK (user_id = (SELECT public.get_app_user_id()));
DROP POLICY IF EXISTS conversation_reads_all ON public.conversation_reads;
CREATE POLICY conversation_reads_all ON public.conversation_reads
  AS PERMISSIVE FOR ALL TO authenticated
  USING      (user_id = (SELECT public.get_app_user_id()))
  WITH CHECK (user_id = (SELECT public.get_app_user_id()));
