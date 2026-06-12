-- KRS Connect Phase 6 Migration (Migration 3/7, S2 2026-06-12, idempotent angepasst)
-- ANPASSUNGEN S2: get_app_user_id behaelt RETURNS BIGINT (Typwechsel verboten), liest auth_id + Email-Fallback;
-- kollidierende Policies users_update_own/posts_update_own werden auf Phase-6-Definition umgestellt;
-- alle CREATE POLICY in IF-NOT-EXISTS-Guards; auth_id-Sync von Legacy-auth_uid.

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

UPDATE users SET auth_id = auth_uid WHERE auth_id IS NULL AND auth_uid IS NOT NULL;

CREATE OR REPLACE FUNCTION get_app_user_id()
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT id FROM users WHERE auth_id = auth.uid() LIMIT 1),
    (SELECT id FROM users WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid()) LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION get_user_team_ids()
RETURNS SETOF integer AS $$
  SELECT team_id FROM public.team_members WHERE user_id = (
    SELECT id FROM public.users WHERE auth_id = auth.uid()
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_user_conversation_ids()
RETURNS SETOF integer AS $$
  SELECT conversation_id FROM public.conversation_members WHERE user_id = (
    SELECT id FROM public.users WHERE auth_id = auth.uid()
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  read_receipts_enabled boolean DEFAULT true,
  notifications_enabled boolean DEFAULT true,
  saved_posts jsonb DEFAULT '[]'::jsonb,
  onboarding_done boolean DEFAULT false,
  theme text DEFAULT 'light',
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channel_reads (
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  channel_id integer REFERENCES channels(id) ON DELETE CASCADE,
  last_read_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, channel_id)
);

CREATE TABLE IF NOT EXISTS conversation_reads (
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  conversation_id integer REFERENCES conversations(id) ON DELETE CASCADE,
  last_read_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_reads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Kollidierende Migration-2-Policies (auth_uid-basiert) durch Phase-6-Versionen ersetzen
  DROP POLICY IF EXISTS "users_update_own" ON users;
  DROP POLICY IF EXISTS "posts_update_own" ON posts;

  -- USERS
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='users_select') THEN
    CREATE POLICY "users_select" ON users FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  CREATE POLICY "users_update_own" ON users FOR UPDATE USING (auth_id = auth.uid()) WITH CHECK (auth_id = auth.uid());
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='users_update_admin') THEN
    CREATE POLICY "users_update_admin" ON users FOR UPDATE USING (
      EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'admin')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='users_insert_admin') THEN
    CREATE POLICY "users_insert_admin" ON users FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'admin')
    );
  END IF;

  -- TEAMS
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='teams_select') THEN
    CREATE POLICY "teams_select" ON teams FOR SELECT USING (id IN (SELECT get_user_team_ids()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='teams_insert_admin') THEN
    CREATE POLICY "teams_insert_admin" ON teams FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'admin')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='teams_update_admin') THEN
    CREATE POLICY "teams_update_admin" ON teams FOR UPDATE USING (
      EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'admin')
    );
  END IF;

  -- TEAM_MEMBERS
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_members' AND policyname='team_members_select') THEN
    CREATE POLICY "team_members_select" ON team_members FOR SELECT USING (team_id IN (SELECT get_user_team_ids()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_members' AND policyname='team_members_insert_admin') THEN
    CREATE POLICY "team_members_insert_admin" ON team_members FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM team_members tm JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = team_members.team_id AND u.auth_id = auth.uid() AND tm.role = 'admin'
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_members' AND policyname='team_members_delete_admin') THEN
    CREATE POLICY "team_members_delete_admin" ON team_members FOR DELETE USING (
      EXISTS (
        SELECT 1 FROM team_members tm JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = team_members.team_id AND u.auth_id = auth.uid() AND tm.role = 'admin'
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_members' AND policyname='team_members_update_admin') THEN
    CREATE POLICY "team_members_update_admin" ON team_members FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM team_members tm JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = team_members.team_id AND u.auth_id = auth.uid() AND tm.role = 'admin'
      )
    );
  END IF;

  -- CHANNELS
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='channels' AND policyname='channels_select') THEN
    CREATE POLICY "channels_select" ON channels FOR SELECT USING (team_id IN (SELECT get_user_team_ids()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='channels' AND policyname='channels_insert') THEN
    CREATE POLICY "channels_insert" ON channels FOR INSERT WITH CHECK (team_id IN (SELECT get_user_team_ids()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='channels' AND policyname='channels_update_admin') THEN
    CREATE POLICY "channels_update_admin" ON channels FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM team_members tm JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = channels.team_id AND u.auth_id = auth.uid() AND tm.role = 'admin'
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='channels' AND policyname='channels_delete_admin') THEN
    CREATE POLICY "channels_delete_admin" ON channels FOR DELETE USING (
      EXISTS (
        SELECT 1 FROM team_members tm JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = channels.team_id AND u.auth_id = auth.uid() AND tm.role = 'admin'
      )
    );
  END IF;

  -- POSTS
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='posts' AND policyname='posts_select') THEN
    CREATE POLICY "posts_select" ON posts FOR SELECT USING (
      channel_id IN (SELECT c.id FROM channels c WHERE c.team_id IN (SELECT get_user_team_ids()))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='posts' AND policyname='posts_insert') THEN
    CREATE POLICY "posts_insert" ON posts FOR INSERT WITH CHECK (
      author_id = get_app_user_id()
      AND channel_id IN (SELECT c.id FROM channels c WHERE c.team_id IN (SELECT get_user_team_ids()))
    );
  END IF;
  CREATE POLICY "posts_update_own" ON posts FOR UPDATE USING (author_id = get_app_user_id()) WITH CHECK (author_id = get_app_user_id());
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='posts' AND policyname='posts_delete_own_or_admin') THEN
    CREATE POLICY "posts_delete_own_or_admin" ON posts FOR DELETE USING (
      author_id = get_app_user_id()
      OR EXISTS (
        SELECT 1 FROM channels c
        JOIN team_members tm ON tm.team_id = c.team_id
        JOIN users u ON u.id = tm.user_id
        WHERE c.id = posts.channel_id AND u.auth_id = auth.uid() AND tm.role = 'admin'
      )
    );
  END IF;

  -- REACTIONS
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='reactions' AND policyname='reactions_select') THEN
    CREATE POLICY "reactions_select" ON reactions FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='reactions' AND policyname='reactions_insert') THEN
    CREATE POLICY "reactions_insert" ON reactions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='reactions' AND policyname='reactions_delete') THEN
    CREATE POLICY "reactions_delete" ON reactions FOR DELETE USING (auth.uid() IS NOT NULL);
  END IF;

  -- POST_READS
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='post_reads' AND policyname='post_reads_select') THEN
    CREATE POLICY "post_reads_select" ON post_reads FOR SELECT USING (user_id = get_app_user_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='post_reads' AND policyname='post_reads_upsert') THEN
    CREATE POLICY "post_reads_upsert" ON post_reads FOR INSERT WITH CHECK (user_id = get_app_user_id());
  END IF;

  -- MESSAGES
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='messages' AND policyname='messages_select') THEN
    CREATE POLICY "messages_select" ON messages FOR SELECT USING (conversation_id IN (SELECT get_user_conversation_ids()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='messages' AND policyname='messages_insert') THEN
    CREATE POLICY "messages_insert" ON messages FOR INSERT WITH CHECK (
      sender_id = get_app_user_id()
      AND conversation_id IN (SELECT get_user_conversation_ids())
    );
  END IF;

  -- CONVERSATIONS
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='conversations' AND policyname='conversations_select') THEN
    CREATE POLICY "conversations_select" ON conversations FOR SELECT USING (id IN (SELECT get_user_conversation_ids()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='conversations' AND policyname='conversations_insert') THEN
    CREATE POLICY "conversations_insert" ON conversations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  -- CONVERSATION_MEMBERS
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='conversation_members' AND policyname='conv_members_select') THEN
    CREATE POLICY "conv_members_select" ON conversation_members FOR SELECT USING (conversation_id IN (SELECT get_user_conversation_ids()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='conversation_members' AND policyname='conv_members_insert') THEN
    CREATE POLICY "conv_members_insert" ON conversation_members FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  -- USER_PREFERENCES
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_preferences' AND policyname='prefs_select') THEN
    CREATE POLICY "prefs_select" ON user_preferences FOR SELECT USING (user_id = get_app_user_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_preferences' AND policyname='prefs_insert') THEN
    CREATE POLICY "prefs_insert" ON user_preferences FOR INSERT WITH CHECK (user_id = get_app_user_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_preferences' AND policyname='prefs_update') THEN
    CREATE POLICY "prefs_update" ON user_preferences FOR UPDATE USING (user_id = get_app_user_id()) WITH CHECK (user_id = get_app_user_id());
  END IF;

  -- CHANNEL_READS / CONVERSATION_READS
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='channel_reads' AND policyname='channel_reads_all') THEN
    CREATE POLICY "channel_reads_all" ON channel_reads FOR ALL USING (user_id = get_app_user_id()) WITH CHECK (user_id = get_app_user_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='conversation_reads' AND policyname='conversation_reads_all') THEN
    CREATE POLICY "conversation_reads_all" ON conversation_reads FOR ALL USING (user_id = get_app_user_id()) WITH CHECK (user_id = get_app_user_id());
  END IF;

  -- STORAGE (images Bucket)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='images_read') THEN
    CREATE POLICY "images_read" ON storage.objects FOR SELECT USING (bucket_id = 'images' AND auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='images_upload') THEN
    CREATE POLICY "images_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'images' AND auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='images_delete') THEN
    CREATE POLICY "images_delete" ON storage.objects FOR DELETE USING (bucket_id = 'images' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;
