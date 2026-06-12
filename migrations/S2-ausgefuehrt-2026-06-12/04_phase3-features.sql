-- Migration 4/7: 2026-05-01_phase3-features.sql (S2-Anpassung: DROP toggle_reaction wegen Rueckgabetyp-Wechsel BOOLEAN->TEXT; App ignoriert Rueckgabewert)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_posts_pinned ON posts(channel_id, is_pinned) WHERE is_pinned = TRUE;

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT;

CREATE TABLE IF NOT EXISTS reactions (
  id          BIGSERIAL PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('post','message')),
  target_id   BIGINT NOT NULL,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL CHECK (length(emoji) BETWEEN 1 AND 16),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_reactions_target ON reactions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user ON reactions(user_id);

ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reactions_select_authenticated" ON reactions;
CREATE POLICY "reactions_select_authenticated" ON reactions
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "reactions_insert_own" ON reactions;
CREATE POLICY "reactions_insert_own" ON reactions
  FOR INSERT WITH CHECK (user_id = public.get_app_user_id());

DROP POLICY IF EXISTS "reactions_delete_own" ON reactions;
CREATE POLICY "reactions_delete_own" ON reactions
  FOR DELETE USING (user_id = public.get_app_user_id());

CREATE TABLE IF NOT EXISTS post_reads (
  post_id    BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_post_reads_user ON post_reads(user_id);

ALTER TABLE post_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_reads_select_authenticated" ON post_reads;
CREATE POLICY "post_reads_select_authenticated" ON post_reads
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "post_reads_upsert_own" ON post_reads;
CREATE POLICY "post_reads_upsert_own" ON post_reads
  FOR INSERT WITH CHECK (user_id = public.get_app_user_id());

DROP POLICY IF EXISTS "post_reads_update_own" ON post_reads;
CREATE POLICY "post_reads_update_own" ON post_reads
  FOR UPDATE USING (user_id = public.get_app_user_id());

DROP FUNCTION IF EXISTS public.toggle_reaction(TEXT, BIGINT, BIGINT, TEXT);

CREATE OR REPLACE FUNCTION public.toggle_reaction(
  p_target_type TEXT,
  p_target_id   BIGINT,
  p_user_id     BIGINT,
  p_emoji       TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id BIGINT;
  v_existing  BIGINT;
BEGIN
  v_caller_id := public.get_app_user_id();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF v_caller_id <> p_user_id THEN
    RAISE EXCEPTION 'reactions can only be toggled for own user';
  END IF;

  IF p_emoji IS NULL OR length(p_emoji) > 16 OR p_emoji ~ '[<>&"'']' THEN
    RAISE EXCEPTION 'invalid emoji';
  END IF;

  IF p_target_type NOT IN ('post','message') THEN
    RAISE EXCEPTION 'invalid target_type';
  END IF;

  SELECT id INTO v_existing FROM reactions
   WHERE target_type = p_target_type
     AND target_id   = p_target_id
     AND user_id     = p_user_id
     AND emoji       = p_emoji
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    DELETE FROM reactions WHERE id = v_existing;
    RETURN 'removed';
  END IF;

  INSERT INTO reactions (target_type, target_id, user_id, emoji)
  VALUES (p_target_type, p_target_id, p_user_id, p_emoji);
  RETURN 'added';
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_reaction TO authenticated;
