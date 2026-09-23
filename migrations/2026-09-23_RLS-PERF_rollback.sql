-- ============================================================================
-- ROLLBACK RLS-PERF (Sprint 0AZ, Opus) — Stand vor jeder Änderung, 23.09.2026
-- Projekt: ooejsfixxiuobrpqgfqm (krs-connect)
-- Erzeugt aus pg_policies (live, nur lesend) für die 12 Ziel-Tabellen.
-- Wirkung: löscht ALLE aktuellen Policies dieser 12 Tabellen (egal wie sie
-- nach der Migration heißen) und stellt exakt den Stand vom 23.09. wieder her.
-- Anwendung: komplett in EINER Transaktion ausführen.
-- Indizes: siehe Abschnitt am Ende (nur relevant, falls Phase 3 lief).
-- ============================================================================
BEGIN;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies
           WHERE schemaname='public' AND tablename IN (
             'posts','messages','channels','teams','team_members','conversations',
             'conversation_members','reactions','post_reads','users',
             'channel_reads','conversation_reads')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

CREATE POLICY channel_reads_all ON public.channel_reads AS PERMISSIVE FOR ALL TO public
  USING ((user_id = get_app_user_id()))
  WITH CHECK ((user_id = get_app_user_id()));
CREATE POLICY channels_delete_admin ON public.channels AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM (team_members tm
     JOIN users u ON ((u.id = tm.user_id)))
  WHERE ((tm.team_id = channels.team_id) AND (u.auth_id = auth.uid()) AND (tm.role = 'admin'::text)))));
CREATE POLICY channels_insert ON public.channels AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((team_id IN ( SELECT get_user_team_ids() AS get_user_team_ids)));
CREATE POLICY channels_insert_admin ON public.channels AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM team_members
  WHERE ((team_members.team_id = channels.team_id) AND (team_members.user_id = get_app_user_id()) AND (team_members.role = 'admin'::text)))));
CREATE POLICY channels_insert_globaladmin ON public.channels AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (is_global_admin());
CREATE POLICY channels_select ON public.channels AS PERMISSIVE FOR SELECT TO public
  USING ((team_id IN ( SELECT get_user_team_ids() AS get_user_team_ids)));
CREATE POLICY channels_select_member ON public.channels AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM team_members
  WHERE ((team_members.team_id = channels.team_id) AND (team_members.user_id = get_app_user_id())))));
CREATE POLICY channels_update_admin ON public.channels AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM (team_members tm
     JOIN users u ON ((u.id = tm.user_id)))
  WHERE ((tm.team_id = channels.team_id) AND (u.auth_id = auth.uid()) AND (tm.role = 'admin'::text)))));
CREATE POLICY cm_insert_member_or_creator ON public.conversation_members AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (can_add_conversation_member(conversation_id));
CREATE POLICY cm_select_own ON public.conversation_members AS PERMISSIVE FOR SELECT TO public
  USING ((user_id = get_app_user_id()));
CREATE POLICY cm_update_own ON public.conversation_members AS PERMISSIVE FOR UPDATE TO public
  USING ((user_id = get_app_user_id()));
CREATE POLICY conv_members_delete_self ON public.conversation_members AS PERMISSIVE FOR DELETE TO public
  USING ((user_id = get_app_user_id()));
CREATE POLICY conv_members_select ON public.conversation_members AS PERMISSIVE FOR SELECT TO public
  USING ((conversation_id IN ( SELECT get_user_conversation_ids() AS get_user_conversation_ids)));
CREATE POLICY conv_members_select_member ON public.conversation_members AS PERMISSIVE FOR SELECT TO public
  USING (is_conversation_member(conversation_id));
CREATE POLICY conversation_reads_all ON public.conversation_reads AS PERMISSIVE FOR ALL TO public
  USING ((user_id = get_app_user_id()))
  WITH CHECK ((user_id = get_app_user_id()));
CREATE POLICY conv_insert_auth ON public.conversations AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY conv_select_member ON public.conversations AS PERMISSIVE FOR SELECT TO public
  USING ((id IN ( SELECT conversation_members.conversation_id
   FROM conversation_members
  WHERE (conversation_members.user_id = get_app_user_id()))));
CREATE POLICY conversations_delete_member ON public.conversations AS PERMISSIVE FOR DELETE TO public
  USING (is_conversation_member(id));
CREATE POLICY conversations_insert_appuser ON public.conversations AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((get_app_user_id() IS NOT NULL));
CREATE POLICY conversations_select ON public.conversations AS PERMISSIVE FOR SELECT TO public
  USING ((id IN ( SELECT get_user_conversation_ids() AS get_user_conversation_ids)));
CREATE POLICY conversations_select_creator ON public.conversations AS PERMISSIVE FOR SELECT TO public
  USING ((created_by = get_app_user_id()));
CREATE POLICY conversations_select_member ON public.conversations AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM conversation_members
  WHERE ((conversation_members.conversation_id = conversations.id) AND (conversation_members.user_id = get_app_user_id())))));
CREATE POLICY conversations_update_member ON public.conversations AS PERMISSIVE FOR UPDATE TO public
  USING (is_conversation_member(id));
CREATE POLICY messages_delete_own ON public.messages AS PERMISSIVE FOR DELETE TO public
  USING ((sender_id = get_app_user_id()));
CREATE POLICY messages_insert_appuser ON public.messages AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((sender_id = get_app_user_id()) AND is_conversation_member(conversation_id)));
CREATE POLICY messages_select ON public.messages AS PERMISSIVE FOR SELECT TO public
  USING ((conversation_id IN ( SELECT get_user_conversation_ids() AS get_user_conversation_ids)));
CREATE POLICY messages_select_member ON public.messages AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM conversation_members
  WHERE ((conversation_members.conversation_id = messages.conversation_id) AND (conversation_members.user_id = get_app_user_id())))));
CREATE POLICY messages_update_own ON public.messages AS PERMISSIVE FOR UPDATE TO public
  USING ((sender_id = get_app_user_id()))
  WITH CHECK ((sender_id = get_app_user_id()));
CREATE POLICY msg_insert_member ON public.messages AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((sender_id = get_app_user_id()) AND (conversation_id IN ( SELECT conversation_members.conversation_id
   FROM conversation_members
  WHERE (conversation_members.user_id = get_app_user_id())))));
CREATE POLICY msg_select_member ON public.messages AS PERMISSIVE FOR SELECT TO public
  USING ((conversation_id IN ( SELECT conversation_members.conversation_id
   FROM conversation_members
  WHERE (conversation_members.user_id = get_app_user_id()))));
CREATE POLICY post_reads_select ON public.post_reads AS PERMISSIVE FOR SELECT TO public
  USING ((user_id = get_app_user_id()));
CREATE POLICY post_reads_select_teamscope ON public.post_reads AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM ((posts p
     JOIN channels c ON ((c.id = p.channel_id)))
     JOIN team_members tm ON ((tm.team_id = c.team_id)))
  WHERE ((p.id = post_reads.post_id) AND (tm.user_id = get_app_user_id())))));
CREATE POLICY post_reads_update_own ON public.post_reads AS PERMISSIVE FOR UPDATE TO public
  USING ((user_id = get_app_user_id()));
CREATE POLICY post_reads_upsert ON public.post_reads AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((user_id = get_app_user_id()));
CREATE POLICY post_reads_upsert_own ON public.post_reads AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((user_id = get_app_user_id()));
CREATE POLICY pr_insert_own ON public.post_reads AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((user_id = get_app_user_id()));
CREATE POLICY posts_delete_own_or_owner ON public.posts AS PERMISSIVE FOR DELETE TO public
  USING (((author_id = get_app_user_id()) OR is_platform_owner()));
CREATE POLICY posts_insert ON public.posts AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((author_id = get_app_user_id()) AND (channel_id IN ( SELECT c.id
   FROM channels c
  WHERE (c.team_id IN ( SELECT get_user_team_ids() AS get_user_team_ids))))));
CREATE POLICY posts_insert_auth ON public.posts AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((author_id = get_app_user_id()) AND ((COALESCE(is_urgent, false) = false) OR (EXISTS ( SELECT 1
   FROM (team_members tm
     JOIN channels c ON ((c.team_id = tm.team_id)))
  WHERE ((c.id = posts.channel_id) AND (tm.user_id = get_app_user_id()) AND (tm.role = 'admin'::text)))))));
CREATE POLICY posts_insert_authenticated ON public.posts AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((auth.uid() IS NOT NULL) AND (author_id = get_app_user_id())));
CREATE POLICY posts_select ON public.posts AS PERMISSIVE FOR SELECT TO public
  USING ((channel_id IN ( SELECT c.id
   FROM channels c
  WHERE (c.team_id IN ( SELECT get_user_team_ids() AS get_user_team_ids)))));
CREATE POLICY posts_select_member ON public.posts AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM (channels
     JOIN team_members ON ((team_members.team_id = channels.team_id)))
  WHERE ((channels.id = posts.channel_id) AND (team_members.user_id = get_app_user_id())))));
CREATE POLICY posts_update_own_or_owner ON public.posts AS PERMISSIVE FOR UPDATE TO public
  USING (((author_id = get_app_user_id()) OR is_platform_owner()))
  WITH CHECK (((author_id = get_app_user_id()) OR is_platform_owner()));
CREATE POLICY reactions_delete_own ON public.reactions AS PERMISSIVE FOR DELETE TO public
  USING ((user_id = get_app_user_id()));
CREATE POLICY reactions_insert ON public.reactions AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY reactions_insert_own ON public.reactions AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((user_id = get_app_user_id()));
CREATE POLICY reactions_select_scoped ON public.reactions AS PERMISSIVE FOR SELECT TO public
  USING (((user_id = get_app_user_id()) OR ((target_type = 'post'::text) AND (EXISTS ( SELECT 1
   FROM ((posts p
     JOIN channels c ON ((c.id = p.channel_id)))
     JOIN team_members tm ON ((tm.team_id = c.team_id)))
  WHERE ((p.id = reactions.target_id) AND (tm.user_id = get_app_user_id()))))) OR ((target_type = 'message'::text) AND (EXISTS ( SELECT 1
   FROM (messages m
     JOIN conversation_members cm ON ((cm.conversation_id = m.conversation_id)))
  WHERE ((m.id = reactions.target_id) AND (cm.user_id = get_app_user_id())))))));
CREATE POLICY team_members_delete ON public.team_members AS PERMISSIVE FOR DELETE TO public
  USING ((is_global_admin() OR is_team_admin((team_id)::text)));
CREATE POLICY team_members_insert ON public.team_members AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((is_global_admin() OR is_team_admin((team_id)::text)));
CREATE POLICY team_members_select ON public.team_members AS PERMISSIVE FOR SELECT TO public
  USING ((is_global_admin() OR (user_id = get_app_user_id()) OR is_team_member((team_id)::text)));
CREATE POLICY team_members_update ON public.team_members AS PERMISSIVE FOR UPDATE TO public
  USING ((is_global_admin() OR is_team_admin((team_id)::text)))
  WITH CHECK ((is_global_admin() OR is_team_admin((team_id)::text)));
CREATE POLICY teams_delete_admin ON public.teams AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM team_members
  WHERE ((team_members.team_id = teams.id) AND (team_members.user_id = get_app_user_id()) AND (team_members.role = 'admin'::text)))));
CREATE POLICY teams_delete_globaladmin ON public.teams AS PERMISSIVE FOR DELETE TO public
  USING (is_global_admin());
CREATE POLICY teams_insert_admin ON public.teams AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.auth_id = auth.uid()) AND (u.role = 'admin'::text)))));
CREATE POLICY teams_insert_auth ON public.teams AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY teams_insert_authenticated ON public.teams AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY teams_insert_globaladmin ON public.teams AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (is_global_admin());
CREATE POLICY teams_select ON public.teams AS PERMISSIVE FOR SELECT TO public
  USING ((id IN ( SELECT get_user_team_ids() AS get_user_team_ids)));
CREATE POLICY teams_select_member ON public.teams AS PERMISSIVE FOR SELECT TO public
  USING ((id IN ( SELECT team_members.team_id
   FROM team_members
  WHERE (team_members.user_id = get_app_user_id()))));
CREATE POLICY teams_update_admin ON public.teams AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM team_members
  WHERE ((team_members.team_id = teams.id) AND (team_members.user_id = get_app_user_id()) AND (team_members.role = 'admin'::text)))));
CREATE POLICY teams_update_globaladmin ON public.teams AS PERMISSIVE FOR UPDATE TO public
  USING (is_global_admin())
  WITH CHECK (is_global_admin());
CREATE POLICY users_insert_admin ON public.users AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.auth_id = auth.uid()) AND (u.role = 'admin'::text)))));
CREATE POLICY users_select ON public.users AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() IS NOT NULL));
CREATE POLICY users_select_all ON public.users AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() IS NOT NULL));
CREATE POLICY users_select_auth ON public.users AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() IS NOT NULL));
CREATE POLICY users_update_admin ON public.users AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.auth_id = auth.uid()) AND (u.role = 'admin'::text)))));
CREATE POLICY users_update_own ON public.users AS PERMISSIVE FOR UPDATE TO public
  USING ((auth_id = auth.uid()))
  WITH CHECK ((auth_id = auth.uid()));

-- Kontrolle: muss 67 ergeben
DO $$ BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN (
      'posts','messages','channels','teams','team_members','conversations',
      'conversation_members','reactions','post_reads','users','channel_reads','conversation_reads')) <> 67
  THEN RAISE EXCEPTION 'Rollback unvollständig'; END IF;
END $$;

COMMIT;
