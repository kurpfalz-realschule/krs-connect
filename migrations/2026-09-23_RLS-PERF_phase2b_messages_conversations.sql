-- ============================================================================
-- RLS-PERF Phase 2b — messages, conversations, conversation_members
-- Projekt: ooejsfixxiuobrpqgfqm · Voraussetzung: Phase 2a (Hilfsfunktionen)
-- ============================================================================

SET LOCAL lock_timeout = '5s';

-- messages
DROP POLICY IF EXISTS messages_select          ON public.messages;
DROP POLICY IF EXISTS messages_select_member   ON public.messages;
DROP POLICY IF EXISTS msg_select_member        ON public.messages;
DROP POLICY IF EXISTS messages_insert_appuser  ON public.messages;
DROP POLICY IF EXISTS msg_insert_member        ON public.messages;
DROP POLICY IF EXISTS messages_update_own      ON public.messages;
DROP POLICY IF EXISTS messages_delete_own      ON public.messages;
CREATE POLICY messages_select_member ON public.messages
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (conversation_id IN (SELECT public.rls_my_conversation_ids()));
CREATE POLICY messages_insert_member ON public.messages
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (sender_id = (SELECT public.get_app_user_id())
              AND conversation_id IN (SELECT public.rls_my_conversation_ids()));
CREATE POLICY messages_update_own ON public.messages
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING      (sender_id = (SELECT public.get_app_user_id()))
  WITH CHECK (sender_id = (SELECT public.get_app_user_id()));
CREATE POLICY messages_delete_own ON public.messages
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (sender_id = (SELECT public.get_app_user_id()));

-- conversations
DROP POLICY IF EXISTS conv_select_member             ON public.conversations;
DROP POLICY IF EXISTS conversations_select           ON public.conversations;
DROP POLICY IF EXISTS conversations_select_creator   ON public.conversations;
DROP POLICY IF EXISTS conversations_select_member    ON public.conversations;
DROP POLICY IF EXISTS conv_insert_auth               ON public.conversations;
DROP POLICY IF EXISTS conversations_insert_appuser   ON public.conversations;
DROP POLICY IF EXISTS conversations_update_member    ON public.conversations;
DROP POLICY IF EXISTS conversations_delete_member    ON public.conversations;
CREATE POLICY conversations_select_member ON public.conversations
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (created_by = (SELECT public.get_app_user_id())
         OR id IN (SELECT public.rls_my_conversation_ids()));
CREATE POLICY conversations_insert_auth ON public.conversations
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY conversations_update_member ON public.conversations
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (id IN (SELECT public.rls_my_conversation_ids()));
CREATE POLICY conversations_delete_member ON public.conversations
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (id IN (SELECT public.rls_my_conversation_ids()));

-- conversation_members (INSERT cm_insert_member_or_creator bleibt unverändert)
DROP POLICY IF EXISTS cm_select_own              ON public.conversation_members;
DROP POLICY IF EXISTS conv_members_select        ON public.conversation_members;
DROP POLICY IF EXISTS conv_members_select_member ON public.conversation_members;
DROP POLICY IF EXISTS cm_update_own              ON public.conversation_members;
DROP POLICY IF EXISTS conv_members_delete_self   ON public.conversation_members;
CREATE POLICY cm_select_member ON public.conversation_members
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_id = (SELECT public.get_app_user_id())
         OR conversation_id IN (SELECT public.rls_my_conversation_ids()));
CREATE POLICY cm_update_own ON public.conversation_members
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (user_id = (SELECT public.get_app_user_id()));
CREATE POLICY cm_delete_own ON public.conversation_members
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (user_id = (SELECT public.get_app_user_id()));
