-- =====================================================================
-- KRS Connect — S3: RLS-SELECT-Lockdown für posts / teams / post_reads / reactions
-- Datum: 2026-09-02 · Projekt: ooejsfixxiuobrpqgfqm (eu-west-1)
-- Vorlage/Struktur: migrations/2026-06-20_rls-haertung-eigene-posts-dms.sql
--
-- AUSFÜHRUNG: Supabase SQL-Editor.
--   Block 1 (CHECK) ZUERST laufen lassen und lesen.
--   Dann Block 2 (ACTION). Block 4 (VERIFY) zur Kontrolle.
--   Block 3 (UNDO) nur im Notfall.
-- Die Migration ist idempotent (2. Lauf crasht nicht) und nicht-destruktiv
-- (löscht keine Daten, nur zu weite Policies).
--
-- ---------------------------------------------------------------------
-- BEGRÜNDUNG
-- ---------------------------------------------------------------------
-- Gemessen am 02.09.2026 in der Produktiv-DB: eine echte Lehrkraft-Session
-- sah 27 von 27 Teams und 17 von 17 Beiträgen, obwohl sie nur in 1 Team ist.
-- Ursache sind überlagernde PERMISSIVE-Policies: Postgres ODER-verknüpft
-- alle PERMISSIVE-Policies derselben cmd — die weiteste gewinnt. Neben den
-- korrekten, member-scoped Policies stehen Allow-all-Policies mit dem
-- Prädikat `auth.uid() IS NOT NULL`, die jede Zeile freigeben.
--
-- Warum das bisher stehen blieb (in der Migrationshistorie belegt):
--   • 2026-06-20_rls-haertung-eigene-posts-dms.sql härtete bewusst nur
--     UPDATE/DELETE — SELECT war ausdrücklich nicht im Scope.
--   • S2-ausgefuehrt-2026-06-12/07_allowall-cleanup.sql droppte nur Policies,
--     deren NAME mit „allow all" beginnt. `posts_select_auth`,
--     `teams_select_all` usw. heißen anders und blieben stehen.
--
-- Warum es zählt: es gibt Teams wie „5b — nur KL", „ASS Förderung".
-- Die Oberfläche versteckt sie korrekt, die REST-/GraphQL-API nicht.
-- Der anon-Key steht bestimmungsgemäß im Quelltext — jede Lehrkraft mit
-- Entwicklerwerkzeugen käme heute an alle Inhalte.
--
-- ---------------------------------------------------------------------
-- WIRKUNGSANALYSE IM APP-CODE (krs-connect-deploy/index.html, v4.19.1)
-- ---------------------------------------------------------------------
-- Geprüft wurde jede Stelle, die posts/teams/post_reads/reactions liest:
--   • getTeams / getArchivedTeams  → filtern bereits selbst über team_members
--     (`.in('id', teamIds)`), werden IMMER mit userId aufgerufen. Unverändert.
--   • getPosts / getReplies / getChannelUnreadCounts → immer `.eq('channel_id', …)`
--     mit Kanälen der EIGENEN Teams. Unverändert.
--   • Es gibt KEINEN „Team beitreten"-Dialog (kein Treffer für joinTeam /
--     getAllTeams / availableTeams). Team-Anlage läuft über die RPC create_team().
--   • Admin-Panel liest nur `users` (getAllUsersAdmin) — nicht betroffen.
--   • Hub-Integration ist reine Auth per postMessage — liest keine Beiträge.
--   • „Dringend"/@alle ist KEIN Cross-Team-Broadcast: es ist ein normaler Post
--     in einem Kanal; alle 44 Lehrkräfte sind im Team „Kollegium", darüber
--     erreicht @alle das Kollegium. Kein Cross-Team-Zugriff nötig.
--   • search() liest posts OHNE eigenen Team-Filter und verlässt sich zu 100 %
--     auf RLS. Nach dieser Migration liefert die Suche nur noch Treffer aus
--     eigenen Teams — das ist die BEABSICHTIGTE Korrektur, kein Regressionsfall.
--   • Realtime `global-posts` abonniert posts-INSERT ohne Filter; Supabase
--     prüft pro Abonnent die SELECT-Policy. Nach dem Lockdown kommen fremde
--     Team-Posts nicht mehr an — ebenfalls beabsichtigt.
--
-- ZWEI STELLEN BRAUCHEN MEHR ALS „nur eigene Zeile" — deshalb bekommen sie
-- VOR dem Drop eine neue, member-scoped Policy (sonst gehen Features kaputt):
--   (a) post_reads: getPostReads() liest die Lesebestätigungen ANDERER Nutzer
--       („Gelesen von N", Feature ist per Default AN). Mit nur
--       `post_reads_select` (user_id = eigene ID) sähen die Testnutzer 0 Zeilen.
--   (b) reactions: es gibt heute ÜBERHAUPT keine enge SELECT-Policy. Ohne
--       Ersatz wären alle Reaktionen unsichtbar.
--   Beide werden auf „Beitrag liegt in einem Kanal meiner Teams" bzw.
--   „Nachricht liegt in einer meiner Konversationen" eingegrenzt.
--
-- SCOPE-GRENZE: smv_*-Tabellen (RLS an, 0 Policies = Default-Deny) und
-- Storage-Policies werden NICHT angefasst.
-- =====================================================================


-- ============================================================
-- 1) CHECK  (NUR LESEN!) — aktueller Policy-Stand + Sichtbarkeit
-- ============================================================

-- 1a) Alle SELECT-Policies der vier betroffenen Tabellen.
--     Erwartung VOR der Migration: je Tabelle mindestens eine Policy mit
--     dem Prädikat `(auth.uid() IS NOT NULL)`.
SELECT tablename, policyname, cmd, permissive, roles::text, qual AS using_expr
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('posts','teams','post_reads','reactions')
  AND cmd IN ('SELECT','ALL')
ORDER BY tablename, policyname;

-- 1b) Zähler: wie viele Allow-all-SELECT-Policies gibt es noch?
--     Erwartung VOR: 7 · Erwartung NACH: 0
SELECT count(*) AS allow_all_select_policies
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('posts','teams','post_reads','reactions')
  AND cmd IN ('SELECT','ALL')
  AND qual = '(auth.uid() IS NOT NULL)';

-- 1c) Sichtbarkeit für einen Testnutzer messen (auth_id einer Lehrkraft
--     einsetzen). VOR der Migration liefert das teams=27 / posts=17.
-- BEGIN;
-- SET LOCAL role authenticated;
-- SET LOCAL request.jwt.claims = '{"sub":"<auth_id>","role":"authenticated"}';
-- SELECT (SELECT count(*) FROM public.teams)      AS teams,
--        (SELECT count(*) FROM public.channels)   AS channels,
--        (SELECT count(*) FROM public.posts)      AS posts,
--        (SELECT count(*) FROM public.messages)   AS dms,
--        (SELECT count(*) FROM public.post_reads) AS post_reads,
--        (SELECT count(*) FROM public.reactions)  AS reactions;
-- ROLLBACK;


-- ============================================================
-- 2) ACTION — erst ausführen, wenn CHECK plausibel ist
--    Reihenfolge ist wichtig: ERST die Ersatz-Policies anlegen,
--    DANN die Allow-all-Policies droppen. Sonst sind Reaktionen und
--    Lesebestätigungen zwischenzeitlich tot.
-- ============================================================

DO $$
BEGIN
  -- ---------------------------------------------------------------
  -- 2a) ERSATZ für post_reads: Lesebestätigungen anderer Nutzer bleiben
  --     sichtbar, aber NUR für Beiträge in Kanälen meiner eigenen Teams.
  --     (Eigene Zeilen deckt post_reads_select bereits ab.)
  --     get_app_user_id() ist SECURITY DEFINER und hat den E-Mail-Fallback —
  --     bewusst nicht get_user_team_ids(), das nur auth_id matcht.
  -- ---------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='post_reads'
                    AND policyname='post_reads_select_teamscope') THEN
    CREATE POLICY "post_reads_select_teamscope" ON public.post_reads
      FOR SELECT USING (
        EXISTS (
          SELECT 1
          FROM public.posts p
          JOIN public.channels c     ON c.id = p.channel_id
          JOIN public.team_members tm ON tm.team_id = c.team_id
          WHERE p.id = post_reads.post_id
            AND tm.user_id = public.get_app_user_id()
        )
      );
  END IF;

  -- ---------------------------------------------------------------
  -- 2b) ERSATZ für reactions: es gibt bisher KEINE enge SELECT-Policy.
  --     Sichtbar sind Reaktionen auf
  --       • Beiträge in Kanälen meiner Teams   (target_type = 'post')
  --       • Nachrichten meiner Konversationen  (target_type = 'message')
  --       • sowie immer meine eigenen Reaktionen (Optimistic-UI-Sicherheitsnetz)
  -- ---------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='reactions'
                    AND policyname='reactions_select_scoped') THEN
    CREATE POLICY "reactions_select_scoped" ON public.reactions
      FOR SELECT USING (
        user_id = public.get_app_user_id()
        OR (
          target_type = 'post' AND EXISTS (
            SELECT 1
            FROM public.posts p
            JOIN public.channels c      ON c.id = p.channel_id
            JOIN public.team_members tm ON tm.team_id = c.team_id
            WHERE p.id = reactions.target_id
              AND tm.user_id = public.get_app_user_id()
          )
        )
        OR (
          target_type = 'message' AND EXISTS (
            SELECT 1
            FROM public.messages m
            JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
            WHERE m.id = reactions.target_id
              AND cm.user_id = public.get_app_user_id()
          )
        )
      );
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 2c) Allow-all-SELECT-Policies droppen.
--     Die engen Policies bleiben ausdrücklich unangetastet:
--       posts      : posts_select, posts_select_member
--       teams      : teams_select, teams_select_member
--       post_reads : post_reads_select (+ neu post_reads_select_teamscope)
--       reactions  : (neu) reactions_select_scoped
--     Beide engen Varianten je Tabelle werden BEWUSST behalten: die
--     „…_select"-Variante nutzt get_user_team_ids() (nur auth_id-Match),
--     die „…_select_member"-Variante get_app_user_id() (mit E-Mail-Fallback).
--     Zusammen decken sie auch Konten ab, deren auth_id noch nicht verknüpft ist.
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "posts_select_auth"              ON public.posts;
-- Hinweis: `posts_select_authenticated` ist in der Sprint-Tabelle als
-- SELECT-Policy gelistet, existiert in der DB am 02.09.2026 aber NICHT als
-- SELECT (nur als INSERT-Policy, die hier bewusst bleibt). Der Drop steht
-- trotzdem hier, falls er auf einem anderen Stand doch existiert — er ist
-- durch IF EXISTS folgenlos, wenn nichts da ist.
-- DROP POLICY IF EXISTS "posts_select_authenticated"   ON public.posts;

DROP POLICY IF EXISTS "teams_select_all"               ON public.teams;

DROP POLICY IF EXISTS "post_reads_select_authenticated" ON public.post_reads;
DROP POLICY IF EXISTS "pr_select_auth"                  ON public.post_reads;

DROP POLICY IF EXISTS "reactions_select"               ON public.reactions;
DROP POLICY IF EXISTS "reactions_select_all"           ON public.reactions;
DROP POLICY IF EXISTS "reactions_select_authenticated" ON public.reactions;

-- reactions_delete war `USING (auth.uid() IS NOT NULL)` — jede angemeldete
-- Person konnte FREMDE Reaktionen löschen. Die enge Policy
-- `reactions_delete_own` (user_id = get_app_user_id()) bleibt bestehen.
-- Die App löscht Reaktionen ohnehin über die SECURITY-DEFINER-RPC
-- toggle_reaction(), die RLS umgeht und den Aufrufer selbst prüft.
DROP POLICY IF EXISTS "reactions_delete"               ON public.reactions;


-- ============================================================
-- 3) UNDO — nur im Notfall. Stellt den Zustand vom 02.09.2026 exakt
--    wieder her: legt jede gedroppte Policy WORTGLEICH neu an und
--    entfernt die beiden in 2a/2b neu angelegten Policies.
--    Zum Ausführen: Kommentarzeichen entfernen.
-- ============================================================
-- -- 3a) Allow-all-Policies wortgleich wiederherstellen
-- CREATE POLICY "posts_select_auth"               ON public.posts      FOR SELECT USING (auth.uid() IS NOT NULL);
-- CREATE POLICY "teams_select_all"                ON public.teams      FOR SELECT USING (auth.uid() IS NOT NULL);
-- CREATE POLICY "post_reads_select_authenticated" ON public.post_reads FOR SELECT USING (auth.uid() IS NOT NULL);
-- CREATE POLICY "pr_select_auth"                  ON public.post_reads FOR SELECT USING (auth.uid() IS NOT NULL);
-- CREATE POLICY "reactions_select"                ON public.reactions  FOR SELECT USING (auth.uid() IS NOT NULL);
-- CREATE POLICY "reactions_select_all"            ON public.reactions  FOR SELECT USING (auth.uid() IS NOT NULL);
-- CREATE POLICY "reactions_select_authenticated"  ON public.reactions  FOR SELECT USING (auth.uid() IS NOT NULL);
-- CREATE POLICY "reactions_delete"                ON public.reactions  FOR DELETE USING (auth.uid() IS NOT NULL);
--
-- -- 3b) Neue Policies wieder entfernen
-- DROP POLICY IF EXISTS "post_reads_select_teamscope" ON public.post_reads;
-- DROP POLICY IF EXISTS "reactions_select_scoped"     ON public.reactions;


-- ============================================================
-- 4) VERIFY — Soll-Zustand kontrollieren
-- ============================================================

-- 4a) Es darf KEINE Allow-all-SELECT/ALL-Policy mehr geben. Erwartung: 0 Zeilen.
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('posts','teams','post_reads','reactions')
  AND cmd IN ('SELECT','ALL')
  AND qual = '(auth.uid() IS NOT NULL)';

-- 4b) Soll-Policies je Tabelle. Erwartung:
--     posts      : posts_select, posts_select_member
--     teams      : teams_select, teams_select_member
--     post_reads : post_reads_select, post_reads_select_teamscope
--     reactions  : reactions_select_scoped
SELECT tablename, policyname, qual AS using_expr
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('posts','teams','post_reads','reactions')
  AND cmd='SELECT'
ORDER BY tablename, policyname;

-- 4c) Sichtbarkeit erneut messen (gleiche auth_id wie in 1c).
--     Erwartung: teams = Anzahl eigener Teams, posts = Beiträge der eigenen
--     Kanäle, dms UNVERÄNDERT gegenüber 1c.
-- BEGIN;
-- SET LOCAL role authenticated;
-- SET LOCAL request.jwt.claims = '{"sub":"<auth_id>","role":"authenticated"}';
-- SELECT (SELECT count(*) FROM public.teams)      AS teams,
--        (SELECT count(*) FROM public.channels)   AS channels,
--        (SELECT count(*) FROM public.posts)      AS posts,
--        (SELECT count(*) FROM public.messages)   AS dms,
--        (SELECT count(*) FROM public.post_reads) AS post_reads,
--        (SELECT count(*) FROM public.reactions)  AS reactions;
-- ROLLBACK;


-- =====================================================================
-- NICHT IN DIESER MIGRATION (bewusst; separat entscheiden)
-- ---------------------------------------------------------------------
-- Beim Erstellen gefunden, aber außerhalb des SELECT-Lockdown-Scopes:
--
--  (A) reactions_insert: `WITH CHECK (auth.uid() IS NOT NULL)` — erlaubt es,
--      Reaktionen mit FREMDER user_id einzutragen (Identitäts-Spoofing).
--      Die enge Policy reactions_insert_own existiert bereits. Die App
--      schreibt ausschließlich über toggle_reaction(). Fix wäre:
--        DROP POLICY IF EXISTS "reactions_insert" ON public.reactions;
--
--  (B) posts_insert_authenticated: `WITH CHECK (auth.uid() IS NOT NULL AND
--      author_id = get_app_user_id())` hebt die Admin-Beschränkung für
--      is_urgent aus posts_insert_auth per ODER wieder auf — jede Lehrkraft
--      kann serverseitig einen 🚨-Dringend-Post absetzen, obwohl die UI den
--      Knopf nur Admins zeigt. Außerdem fehlt ihr die Kanal-Mitgliedschafts-
--      prüfung aus posts_insert. Fix wäre:
--        DROP POLICY IF EXISTS "posts_insert_authenticated" ON public.posts;
--        DROP POLICY IF EXISTS "posts_insert_auth"          ON public.posts;
--      und eine einzige Policy, die beide Bedingungen UND-verknüpft.
--
--  (C) teams_insert_auth / teams_insert_authenticated: `auth.uid() IS NOT NULL`
--      — jede angemeldete Person kann Teams anlegen. Entspricht dem gewollten
--      Verhalten von create_team(), ist also KEIN Fehler, nur redundant.
--
-- Beides braucht einen eigenen Rauchtest (Posten, Dringend-Posten,
-- Reagieren) und gehört deshalb nicht in dieselbe Migration.
-- =====================================================================
