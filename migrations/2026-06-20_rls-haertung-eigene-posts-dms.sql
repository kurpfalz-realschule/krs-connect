-- =====================================================================
-- KRS Connect — RLS-Härtung: Mitglieder dürfen serverseitig nur EIGENE
-- Posts/DMs ändern/löschen; Superadmin darf Team-Mitglieder verwalten.
-- Sprint #4 (+ Server-Seite von Bug D "Mitglied hinzufügen passiert nichts")
-- Datum: 2026-06-20 · Projekt: ooejsfixxiuobrpqgfqm
--
-- AUSFÜHRUNG: Supabase SQL-Editor. Block 1 (CHECK) ZUERST laufen lassen und
-- lesen. Dann Block 2 (ACTION). Block 4 (VERIFY) zur Kontrolle. Block 3 (UNDO)
-- nur im Notfall. Migration ist additiv & idempotent (2. Lauf crasht nicht).
--
-- HINTERGRUND (im App-Code verifiziert, index.html):
--   • updateMessage/deleteMessage/updatePost/deletePost laufen als HARTE
--     UPDATE/DELETE OHNE Autor-Filter in der Query → RLS ist die EINZIGE
--     Schutzschicht. Aktuell fehlt für `messages` jede UPDATE/DELETE-Policy.
--   • UI-Regel (Soll = Server-Soll):
--       posts   UPDATE/DELETE = Autor ODER globaler Admin (users.role='admin')
--       messages UPDATE/DELETE = nur Absender (sender_id)
--   • Team-Mitglied hinzufügen: nur Team-Admins — PLUS globaler Superadmin
--     (Norbert) soll jedes Team verwalten können.
--
-- REIHENFOLGE (wichtig, Expert-Review P1): Diese Migration ZUERST im SQL-Editor
--   ausführen, ERST DANACH den Frontend-Deploy. So bricht kein UI-Feature, das
--   auf eine entfernte Alt-Policy zählt. Datenleck entsteht in keiner Richtung.
--
-- ENTSCHEIDUNG Team-Admin & Posts (Expert-Review P2): posts UPDATE/DELETE wird
--   bewusst auf "Autor ODER GLOBALER Admin" gesetzt — exakt wie die UI (sie
--   bietet Team-Admins KEIN Post-Editieren/-Pinnen). Falls Team-Admins später
--   im eigenen Team moderieren sollen, USING/WITH CHECK um einen team_members-
--   EXISTS-Zweig erweitern (Vorlage liegt in der Übergabe).
-- =====================================================================


-- ============================================================
-- 1) CHECK  (NUR LESEN!)  — aktueller Policy-Stand
--    Bitte Ergebnis lesen, bevor Block 2 läuft. Achte besonders auf
--    evtl. FOR ALL-Policies (cmd='ALL') auf messages/posts.
-- ============================================================
SELECT tablename, policyname, cmd, roles, qual AS using_expr, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename IN ('messages','posts','team_members')
ORDER BY tablename, cmd, policyname;

-- Schnellzähler: gibt es aktuell IRGENDEINE update/delete-Policy auf messages?
SELECT tablename, cmd, COUNT(*) AS policies
FROM pg_policies
WHERE schemaname='public' AND tablename IN ('messages','posts','team_members')
  AND cmd IN ('UPDATE','DELETE','ALL')
GROUP BY tablename, cmd ORDER BY tablename, cmd;

-- FK-Check: ist posts.parent_id ON DELETE CASCADE? (confdeltype 'c'=CASCADE)
-- Wichtig, weil deletePost Threads inkl. fremder Antworten entfernt — fremde
-- Antworten kann der App-DELETE unter RLS nicht löschen, die DB-Cascade schon.
SELECT con.conname, con.confdeltype AS del_type
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname='posts' AND con.contype='f'
  AND (SELECT attname FROM pg_attribute WHERE attrelid=con.conrelid AND attnum=con.conkey[1]) = 'parent_id';


-- ============================================================
-- 2) ACTION — erst ausführen, wenn CHECK plausibel ist
-- ============================================================

-- 2a) Helper: globaler Admin? (SECURITY DEFINER, wie get_app_user_id —
--     liest users.role anhand auth.uid(), keine Rekursion in fremden Policies)
CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- auth_id-Match ODER E-Mail-Fallback (konsistent mit get_app_user_id)
  SELECT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.role = 'admin'
       AND ( u.auth_id = auth.uid()
             OR u.email = (SELECT email FROM auth.users WHERE id = auth.uid()) )
  );
$$;

DO $$
DECLARE
  pol RECORD;
BEGIN
  -- 2b) MESSAGES: alle bestehenden UPDATE/DELETE/ALL-Policies entfernen,
  --     damit der Endzustand deterministisch "nur Absender" ist.
  --     (SELECT/INSERT-Policies bleiben — sie haben eigene cmd-Werte.)
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='messages' AND cmd IN ('UPDATE','DELETE','ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.messages', pol.policyname);
  END LOOP;

  CREATE POLICY "messages_update_own" ON public.messages
    FOR UPDATE USING (sender_id = public.get_app_user_id())
    WITH CHECK (sender_id = public.get_app_user_id());
  CREATE POLICY "messages_delete_own" ON public.messages
    FOR DELETE USING (sender_id = public.get_app_user_id());

  -- 2c) POSTS: alle bestehenden UPDATE/DELETE/ALL-Policies entfernen,
  --     dann kanonisch "Autor ODER globaler Admin" (= UI-Regel).
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='posts' AND cmd IN ('UPDATE','DELETE','ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.posts', pol.policyname);
  END LOOP;

  CREATE POLICY "posts_update_own_or_admin" ON public.posts
    FOR UPDATE USING (author_id = public.get_app_user_id() OR public.is_global_admin())
    WITH CHECK (author_id = public.get_app_user_id() OR public.is_global_admin());
  CREATE POLICY "posts_delete_own_or_admin" ON public.posts
    FOR DELETE USING (author_id = public.get_app_user_id() OR public.is_global_admin());

  -- 2d) TEAM_MEMBERS: globalen Superadmin zusätzlich zu Team-Admins erlauben
  --     (behebt "Mitglied hinzufügen passiert nichts" für Norbert serverseitig).
  --     Bestehende team-admin-Policies bleiben unangetastet.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='team_members' AND policyname='team_members_insert_globaladmin') THEN
    CREATE POLICY "team_members_insert_globaladmin" ON public.team_members
      FOR INSERT WITH CHECK (public.is_global_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='team_members' AND policyname='team_members_delete_globaladmin') THEN
    CREATE POLICY "team_members_delete_globaladmin" ON public.team_members
      FOR DELETE USING (public.is_global_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='team_members' AND policyname='team_members_update_globaladmin') THEN
    CREATE POLICY "team_members_update_globaladmin" ON public.team_members
      FOR UPDATE USING (public.is_global_admin());
  END IF;
END $$;

-- 2e) posts.parent_id FK auf ON DELETE CASCADE sicherstellen (idempotent).
--     Grund: deletePost(parent) entfernt Antworten; fremde Antworten kann der
--     App-DELETE unter RLS NICHT löschen → ohne Cascade scheitert das Löschen
--     eines Threads mit fremden Antworten an einer FK-Verletzung. Cascade räumt
--     verbleibende Antworten DB-seitig weg. Tut nichts, wenn FK schon CASCADE ist.
DO $$
DECLARE
  fk_name text;
  del_type "char";
BEGIN
  SELECT con.conname, con.confdeltype INTO fk_name, del_type
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname='posts' AND con.contype='f'
    AND (SELECT attname FROM pg_attribute WHERE attrelid=con.conrelid AND attnum=con.conkey[1]) = 'parent_id';

  IF fk_name IS NOT NULL AND del_type IS DISTINCT FROM 'c' THEN
    EXECUTE format('ALTER TABLE public.posts DROP CONSTRAINT %I', fk_name);
    fk_name := NULL;  -- erzwingt Neuanlage unten
  END IF;

  IF fk_name IS NULL THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_parent_id_fkey FOREIGN KEY (parent_id)
      REFERENCES public.posts(id) ON DELETE CASCADE;
  END IF;
END $$;


-- ============================================================
-- 3) UNDO — nur im Notfall (stellt den vorherigen, LOSEREN Zustand NICHT
--    automatisch wieder her; die alten Policies waren teils permissiv).
--    Entfernt die neuen Policies; danach sind messages-UPDATE/DELETE wieder
--    komplett gesperrt (RLS ohne Policy = deny). Vollständige Rückkehr nur
--    aus dem pg_policies-CSV-Dump (S2-Vorhersicherung).
-- ============================================================
-- DROP POLICY IF EXISTS "messages_update_own"           ON public.messages;
-- DROP POLICY IF EXISTS "messages_delete_own"           ON public.messages;
-- DROP POLICY IF EXISTS "posts_update_own_or_admin"     ON public.posts;
-- DROP POLICY IF EXISTS "posts_delete_own_or_admin"     ON public.posts;
-- DROP POLICY IF EXISTS "team_members_insert_globaladmin" ON public.team_members;
-- DROP POLICY IF EXISTS "team_members_delete_globaladmin" ON public.team_members;
-- DROP POLICY IF EXISTS "team_members_update_globaladmin" ON public.team_members;
-- DROP FUNCTION IF EXISTS public.is_global_admin();


-- ============================================================
-- 4) VERIFY — Soll-Zustand kontrollieren
--    Erwartung:
--      messages: genau 1x UPDATE (messages_update_own), 1x DELETE (messages_delete_own)
--      posts:    genau 1x UPDATE (posts_update_own_or_admin), 1x DELETE (posts_delete_own_or_admin)
--      team_members: je 1x *_globaladmin zusätzlich zu den team-admin-Policies
-- ============================================================
SELECT tablename, cmd, policyname, qual AS using_expr
FROM pg_policies
WHERE schemaname='public' AND tablename IN ('messages','posts','team_members')
  AND cmd IN ('UPDATE','DELETE')
ORDER BY tablename, cmd, policyname;

-- Es darf KEINE FOR ALL- (cmd='ALL') Policy mehr auf messages/posts geben:
SELECT tablename, policyname FROM pg_policies
WHERE schemaname='public' AND tablename IN ('messages','posts') AND cmd='ALL';
