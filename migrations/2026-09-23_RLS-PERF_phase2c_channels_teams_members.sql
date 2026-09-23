-- ============================================================================
-- RLS-PERF Phase 2c — channels, teams, team_members
-- Projekt: ooejsfixxiuobrpqgfqm · Voraussetzung: Phase 2a (Hilfsfunktionen)
-- ============================================================================

-- channels
DROP POLICY IF EXISTS channels_select             ON public.channels;
DROP POLICY IF EXISTS channels_select_member      ON public.channels;
DROP POLICY IF EXISTS channels_insert             ON public.channels;
DROP POLICY IF EXISTS channels_insert_admin       ON public.channels;
DROP POLICY IF EXISTS channels_insert_globaladmin ON public.channels;
DROP POLICY IF EXISTS channels_update_admin       ON public.channels;
DROP POLICY IF EXISTS channels_delete_admin       ON public.channels;
CREATE POLICY channels_select_member ON public.channels
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (team_id IN (SELECT public.rls_my_team_ids()));
-- bisher: jedes Team-Mitglied ODER globaler Admin (Team-Admin ist Teilmenge)
CREATE POLICY channels_insert_member ON public.channels
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (team_id IN (SELECT public.rls_my_team_ids()) OR (SELECT public.is_global_admin()));
-- bisher über users.auth_id (ohne E-Mail-Fallback) → exakt so beibehalten
CREATE POLICY channels_update_admin ON public.channels
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (team_id IN (SELECT tm.team_id FROM public.team_members tm
                       JOIN public.users u ON u.id = tm.user_id
                      WHERE u.auth_id = (SELECT auth.uid()) AND tm.role = 'admin'));
CREATE POLICY channels_delete_admin ON public.channels
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (team_id IN (SELECT tm.team_id FROM public.team_members tm
                       JOIN public.users u ON u.id = tm.user_id
                      WHERE u.auth_id = (SELECT auth.uid()) AND tm.role = 'admin'));

-- teams (INSERT = teams_insert_globaladmin aus Phase 1, bleibt)
DROP POLICY IF EXISTS teams_select             ON public.teams;
DROP POLICY IF EXISTS teams_select_member      ON public.teams;
DROP POLICY IF EXISTS teams_update_admin       ON public.teams;
DROP POLICY IF EXISTS teams_update_globaladmin ON public.teams;
DROP POLICY IF EXISTS teams_delete_admin       ON public.teams;
DROP POLICY IF EXISTS teams_delete_globaladmin ON public.teams;
CREATE POLICY teams_select_member ON public.teams
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (id IN (SELECT public.rls_my_team_ids()));
CREATE POLICY teams_update_admin ON public.teams
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((SELECT public.is_global_admin()) OR id IN (SELECT public.rls_my_admin_team_ids()));
CREATE POLICY teams_delete_admin ON public.teams
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((SELECT public.is_global_admin()) OR id IN (SELECT public.rls_my_admin_team_ids()));

-- team_members
DROP POLICY IF EXISTS team_members_select ON public.team_members;
DROP POLICY IF EXISTS team_members_insert ON public.team_members;
DROP POLICY IF EXISTS team_members_update ON public.team_members;
DROP POLICY IF EXISTS team_members_delete ON public.team_members;
CREATE POLICY team_members_select ON public.team_members
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT public.is_global_admin())
         OR user_id = (SELECT public.get_app_user_id())
         OR team_id IN (SELECT public.rls_my_team_ids()));
CREATE POLICY team_members_insert ON public.team_members
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_global_admin()) OR team_id IN (SELECT public.rls_my_admin_team_ids()));
CREATE POLICY team_members_update ON public.team_members
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING      ((SELECT public.is_global_admin()) OR team_id IN (SELECT public.rls_my_admin_team_ids()))
  WITH CHECK ((SELECT public.is_global_admin()) OR team_id IN (SELECT public.rls_my_admin_team_ids()));
CREATE POLICY team_members_delete ON public.team_members
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((SELECT public.is_global_admin()) OR team_id IN (SELECT public.rls_my_admin_team_ids()));
