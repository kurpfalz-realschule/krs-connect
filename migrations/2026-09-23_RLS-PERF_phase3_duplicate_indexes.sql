-- ============================================================================
-- RLS-PERF Phase 3 — doppelte Indizes entfernen (Advisor duplicate_index, 6 Befunde / 7 Indizes)
-- Projekt: ooejsfixxiuobrpqgfqm · keiner der Indizes gehört zu einer Constraint (geprüft 23.09.)
-- Behalten wird jeweils der Name mit sprechendem Suffix (_id bzw. conversation_members_*).
-- Rückweg: die CREATE INDEX-Zeilen unten auskommentiert.
-- ============================================================================

SET LOCAL lock_timeout = '5s';

DROP INDEX IF EXISTS public.idx_channels_team;              -- = idx_channels_team_id (team_id)
DROP INDEX IF EXISTS public.idx_conv_members_conv;          -- = idx_conversation_members_conv (conversation_id)
DROP INDEX IF EXISTS public.idx_conv_members_user;          -- = idx_conversation_members_user_id (user_id)
DROP INDEX IF EXISTS public.idx_conversation_members_user;  -- = idx_conversation_members_user_id (user_id)
DROP INDEX IF EXISTS public.idx_messages_conversation;      -- = idx_messages_conversation_id (conversation_id)
DROP INDEX IF EXISTS public.idx_posts_channel;              -- = idx_posts_channel_id (channel_id)
DROP INDEX IF EXISTS public.idx_team_members_user;          -- = idx_team_members_user_id (user_id)

-- Rollback:
-- CREATE INDEX idx_channels_team ON public.channels USING btree (team_id);
-- CREATE INDEX idx_conv_members_conv ON public.conversation_members USING btree (conversation_id);
-- CREATE INDEX idx_conv_members_user ON public.conversation_members USING btree (user_id);
-- CREATE INDEX idx_conversation_members_user ON public.conversation_members USING btree (user_id);
-- CREATE INDEX idx_messages_conversation ON public.messages USING btree (conversation_id);
-- CREATE INDEX idx_posts_channel ON public.posts USING btree (channel_id);
-- CREATE INDEX idx_team_members_user ON public.team_members USING btree (user_id);
