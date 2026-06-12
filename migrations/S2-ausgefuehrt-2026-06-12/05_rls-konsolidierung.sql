-- Migration 5/7: 2026-05-01_rls-konsolidierung.sql (S2: CREATE POLICY mit Guards)
CREATE OR REPLACE FUNCTION public.is_conversation_member(conv_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
     WHERE conversation_id = conv_id
       AND user_id = public.get_app_user_id()
  );
$$;

DROP POLICY IF EXISTS "Allow all insert" ON conversation_members;
DROP POLICY IF EXISTS "Allow all read" ON conversation_members;
DROP POLICY IF EXISTS "Allow all update" ON conversation_members;
DROP POLICY IF EXISTS "Allow all delete" ON conversation_members;
DROP POLICY IF EXISTS "Enable read access for all users" ON conversation_members;
DROP POLICY IF EXISTS "conv_members_insert_authenticated" ON conversation_members;
DROP POLICY IF EXISTS "conv_members_select_own" ON conversation_members;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='conversation_members' AND policyname='conv_members_select_member') THEN
    CREATE POLICY "conv_members_select_member" ON conversation_members
      FOR SELECT USING (public.is_conversation_member(conversation_id));
  END IF;
  CREATE POLICY "conv_members_insert_authenticated" ON conversation_members
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='conversation_members' AND policyname='conv_members_delete_self') THEN
    CREATE POLICY "conv_members_delete_self" ON conversation_members
      FOR DELETE USING (user_id = public.get_app_user_id());
  END IF;
END $$;

DROP POLICY IF EXISTS "Allow all" ON conversations;
DROP POLICY IF EXISTS "Allow all read" ON conversations;
DROP POLICY IF EXISTS "Allow all update" ON conversations;
DROP POLICY IF EXISTS "Allow all delete" ON conversations;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='conversations' AND policyname='conversations_update_member') THEN
    CREATE POLICY "conversations_update_member" ON conversations
      FOR UPDATE USING (public.is_conversation_member(id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='conversations' AND policyname='conversations_delete_member') THEN
    CREATE POLICY "conversations_delete_member" ON conversations
      FOR DELETE USING (public.is_conversation_member(id));
  END IF;
END $$;

DROP POLICY IF EXISTS "Allow all" ON messages;
DROP POLICY IF EXISTS "Allow all read" ON messages;
