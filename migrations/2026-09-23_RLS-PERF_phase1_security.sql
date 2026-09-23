-- ============================================================================
-- RLS-PERF Phase 1 — Sicherheitslücken S-1…S-4 schließen (Sprint 0AZ, Opus)
-- Projekt: ooejsfixxiuobrpqgfqm · Rollback: 2026-09-23_RLS-PERF_rollback.sql
-- Entscheidung Norbert 23.09.2026: „Dringend" darf posten, wer globaler Admin
-- (users.role admin/owner) ODER Team-Admin des Kanals ist — immer nur als
-- Mitglied des Teams.
-- Alle neuen Regeln: TO authenticated, Funktionsaufrufe in (SELECT …) → einmal
-- pro Abfrage statt pro Zeile.
-- ============================================================================

-- S-1 posts INSERT: drei ODER-verknüpfte Regeln → eine
DROP POLICY IF EXISTS posts_insert               ON public.posts;
DROP POLICY IF EXISTS posts_insert_auth          ON public.posts;
DROP POLICY IF EXISTS posts_insert_authenticated ON public.posts;
CREATE POLICY posts_insert_member ON public.posts
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (SELECT public.get_app_user_id())
    AND EXISTS (
      SELECT 1 FROM public.channels c
        JOIN public.team_members tm ON tm.team_id = c.team_id
       WHERE c.id = posts.channel_id
         AND tm.user_id = (SELECT public.get_app_user_id()))
    AND (
      COALESCE(is_urgent, false) = false
      OR (SELECT public.is_global_admin())
      OR EXISTS (
        SELECT 1 FROM public.channels c
          JOIN public.team_members tm ON tm.team_id = c.team_id
         WHERE c.id = posts.channel_id
           AND tm.user_id = (SELECT public.get_app_user_id())
           AND tm.role = 'admin'))
  );

-- S-2 reactions INSERT: nur eigene user_id (toggle_reaction-RPC bleibt der Normalweg)
DROP POLICY IF EXISTS reactions_insert     ON public.reactions;
DROP POLICY IF EXISTS reactions_insert_own ON public.reactions;
CREATE POLICY reactions_insert_own ON public.reactions
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.get_app_user_id()));

-- S-3 teams INSERT: nur globale Admins direkt; alle anderen über create_team-RPC
-- (teams_insert_admin ist Teilmenge von is_global_admin() → zusammengelegt)
DROP POLICY IF EXISTS teams_insert_auth          ON public.teams;
DROP POLICY IF EXISTS teams_insert_authenticated ON public.teams;
DROP POLICY IF EXISTS teams_insert_admin         ON public.teams;
DROP POLICY IF EXISTS teams_insert_globaladmin   ON public.teams;
CREATE POLICY teams_insert_globaladmin ON public.teams
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_global_admin()));

-- S-4 post_reads INSERT: drei identische Regeln → eine
DROP POLICY IF EXISTS post_reads_upsert     ON public.post_reads;
DROP POLICY IF EXISTS post_reads_upsert_own ON public.post_reads;
DROP POLICY IF EXISTS pr_insert_own         ON public.post_reads;
CREATE POLICY post_reads_insert_own ON public.post_reads
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.get_app_user_id()));
