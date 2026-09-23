-- ============================================================================
-- RLS-PERF Phase 2d — users, channel_reads, conversation_reads
-- Projekt: ooejsfixxiuobrpqgfqm
-- Rev. 23.09. abends: users-Admin-Prüfung über rls_i_am_users_admin() statt EXISTS
-- (erste Fassung hätte 42P17 'infinite recursion' bei JEDEM users-UPDATE ausgelöst)
-- ============================================================================

SET LOCAL lock_timeout = '5s';

-- Hilfsfunktion (neu in 2d): "bin ich users.role='admin'?" — exakt die bisherige EXISTS-Bedingung,
-- aber als SECURITY DEFINER. Grund: Ein EXISTS über public.users INNERHALB einer users-Regel
-- plus die gewrappte SELECT-Regel ((SELECT auth.uid()) …) löst in Postgres
-- "infinite recursion detected in policy for relation users" (42P17) aus → jedes Profil-Update
-- wäre gescheitert (Trockentest 23.09. abends, 55/55 Nutzer).
CREATE OR REPLACE FUNCTION public.rls_i_am_users_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.auth_id = (SELECT auth.uid()) AND u.role = 'admin');
$f$;
REVOKE ALL ON FUNCTION public.rls_i_am_users_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_i_am_users_admin() TO authenticated, service_role;

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
  WITH CHECK ((SELECT public.rls_i_am_users_admin()));
-- bisher: Admin (users.role='admin', ohne WITH CHECK → USING gilt) ODER eigene Zeile (USING+CHECK auth_id)
CREATE POLICY users_update_own_or_admin ON public.users
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING      (auth_id = (SELECT auth.uid()) OR (SELECT public.rls_i_am_users_admin()))
  WITH CHECK (auth_id = (SELECT auth.uid()) OR (SELECT public.rls_i_am_users_admin()));

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
