-- =====================================================================
-- KRS Connect — O1: Direktnachricht landet im Gruppenchat (R8, R11)
-- Sprint "sprint opus teams 2.0.md", Aufgabe O1 (P0)
-- Datum: 2026-09-21 · Projekt: ooejsfixxiuobrpqgfqm (eu-west-1)
--
-- AUSFÜHRUNG: Supabase SQL-Editor. Block 1 (CHECK) ZUERST lesen, dann
-- Block 2 (ACTION), Block 4 (VERIFY) zur Kontrolle. Block 3 (UNDO) nur im
-- Notfall. Additiv & idempotent (zweiter Lauf crasht nicht).
--
-- BEFUND (im App-Code verifiziert, index.html v4.30.0, DataService.createConversation
-- ca. Z. 4378): Die Suche nach einer bestehenden Konversation filtert NICHT auf
-- conversations.is_group = false und prüft NICHT die Mitgliederzahl. Sind zwei
-- Personen gemeinsam in einer Gruppe, wird DIESE GRUPPE als Einzelchat
-- zurückgegeben (sogar mit is_group: false etikettiert). Wer glaubt, privat zu
-- schreiben, schreibt an alle Gruppenmitglieder. -> Datenschutzvorfall, kein
-- Schönheitsfehler.
--
-- ZWEITER BEFUND: conversation_members hatte DREI permissive INSERT-Policies,
-- davon zwei ohne jeden Bezug zur Konversation:
--   conv_members_insert          WITH CHECK (auth.uid() IS NOT NULL)
--   conv_members_insert_appuser  WITH CHECK (get_app_user_id() IS NOT NULL)
-- Damit durfte jeder angemeldete Nutzer beliebige Personen in beliebige
-- Konversationen einfügen. cm_insert_own (user_id = get_app_user_id()) ist
-- ebenfalls zu weit: es erlaubt, sich SELBST in eine fremde Konversation zu
-- setzen und danach deren Nachrichten zu lesen.
--
-- REIHENFOLGE / DEPLOY-SICHERHEIT (geprüft, s. Block 4):
--   Diese Migration ZUERST, Frontend-Deploy DANACH. Die neue Policy bricht den
--   noch ausgelieferten v4.30.0-Pfad NICHT: dort legt dieselbe Person die
--   Konversation an (conversations.created_by DEFAULT get_app_user_id()) und
--   fügt anschließend beide Mitgliedszeilen ein -> Zweig "Ersteller" greift.
--
-- BESTANDSDATEN: Es wird NICHTS umgebaut und NICHTS gelöscht. Falsch als DM
--   geöffnete Gruppen bleiben, wie sie sind (Entscheidung Norbert, s. HANDOVER).
-- =====================================================================


-- ============================================================
-- 1) CHECK  (NUR LESEN!)
-- ============================================================

-- 1a) Policy-Stand auf conversation_members
SELECT tablename, policyname, cmd, roles, qual AS using_expr, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename IN ('conversations','conversation_members')
ORDER BY tablename, cmd, policyname;

-- 1b) Schadensbild: Gruppen-Konversationen und gefährdete Nutzerpaare
WITH mc AS (SELECT conversation_id, count(*) n FROM conversation_members GROUP BY 1),
dm AS (
  SELECT a.user_id u1, b.user_id u2
  FROM conversation_members a
  JOIN conversation_members b ON b.conversation_id=a.conversation_id AND a.user_id<b.user_id
  JOIN conversations c ON c.id=a.conversation_id
  JOIN mc ON mc.conversation_id=c.id
  WHERE c.is_group=false AND mc.n=2
),
gp AS (
  SELECT c.id conv_id, c.name conv_name, a.user_id u1, b.user_id u2
  FROM conversation_members a
  JOIN conversation_members b ON b.conversation_id=a.conversation_id AND a.user_id<b.user_id
  JOIN conversations c ON c.id=a.conversation_id
  WHERE c.is_group=true
)
SELECT g.conv_id, g.conv_name, count(*) AS paare_gesamt,
       count(*) FILTER (WHERE d.u1 IS NULL) AS paare_ohne_dm_gefaehrdet
FROM gp g LEFT JOIN dm d ON d.u1=g.u1 AND d.u2=g.u2
GROUP BY 1,2 ORDER BY 1;

-- 1c) Doppelte DMs desselben Paars (Beleg für das Rennen) und Geister-Konversationen
WITH mc AS (SELECT conversation_id, count(*) n FROM conversation_members GROUP BY 1),
pairs AS (
  SELECT c.id conv, least(a.user_id,b.user_id) lo, greatest(a.user_id,b.user_id) hi,
         (SELECT count(*) FROM messages m WHERE m.conversation_id=c.id) msgs
  FROM conversation_members a
  JOIN conversation_members b ON b.conversation_id=a.conversation_id AND a.user_id<b.user_id
  JOIN conversations c ON c.id=a.conversation_id
  JOIN mc ON mc.conversation_id=c.id
  WHERE c.is_group=false AND mc.n=2
)
SELECT 'doppeltes_paar' AS befund, conv, lo, hi, msgs FROM pairs
WHERE (lo,hi) IN (SELECT lo,hi FROM pairs GROUP BY 1,2 HAVING count(*)>1)
UNION ALL
SELECT 'konversation_ohne_mitglieder', c.id, NULL, NULL,
       (SELECT count(*) FROM messages m WHERE m.conversation_id=c.id)
FROM conversations c
WHERE NOT EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id=c.id)
ORDER BY 1,2;


-- ============================================================
-- 2) ACTION
-- ============================================================
BEGIN;

-- 2a) Paar-Schlüssel auf conversations. Format: '<kleinere id>:<größere id>',
--     nur für echte 1:1-Konversationen gesetzt, sonst NULL.
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS dm_key text;
COMMENT ON COLUMN public.conversations.dm_key IS
  'Sortiertes Nutzerpaar "lo:hi" für 1:1-Chats (is_group=false, genau 2 Mitglieder). '
  'NULL bei Gruppen und bei Alt-Dubletten. Eindeutiger Index verhindert Doppel-DMs.';

-- 2b) Backfill. Bei Alt-Dubletten desselben Paars gewinnt die Konversation mit
--     den meisten Nachrichten (Gleichstand: die neuere). Die Verliererin behält
--     dm_key = NULL, bleibt aber unverändert erhalten — es wird nichts gelöscht.
WITH mc AS (SELECT conversation_id, count(*) n FROM conversation_members GROUP BY 1),
pairs AS (
  SELECT c.id AS conv,
         least(a.user_id,b.user_id)::text || ':' || greatest(a.user_id,b.user_id)::text AS k,
         (SELECT count(*) FROM messages m WHERE m.conversation_id=c.id) AS msgs
  FROM conversation_members a
  JOIN conversation_members b ON b.conversation_id=a.conversation_id AND a.user_id<b.user_id
  JOIN conversations c ON c.id=a.conversation_id
  JOIN mc ON mc.conversation_id=c.id
  WHERE c.is_group=false AND mc.n=2
),
gewinner AS (
  SELECT DISTINCT ON (k) conv, k FROM pairs ORDER BY k, msgs DESC, conv DESC
)
UPDATE public.conversations c
   SET dm_key = g.k
  FROM gewinner g
 WHERE c.id = g.conv AND c.dm_key IS DISTINCT FROM g.k;

-- 2c) Eindeutigkeit. NULL-Werte sind in einem UNIQUE-Index mehrfach zulässig,
--     Gruppen und Alt-Dubletten stören also nicht.
CREATE UNIQUE INDEX IF NOT EXISTS conversations_dm_key_uidx
  ON public.conversations (dm_key);

-- 2d) Die RPC. Muster: create_team() im selben Projekt.
CREATE OR REPLACE FUNCTION public.get_or_create_dm(p_other_user_id bigint)
RETURNS TABLE (conversation_id bigint, is_group boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_me  bigint;
  v_lo  bigint;
  v_hi  bigint;
  v_key text;
  v_id  bigint;
BEGIN
  v_me := public.get_app_user_id();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet (kein App-User).';
  END IF;
  IF p_other_user_id IS NULL THEN
    RAISE EXCEPTION 'Kein Gegenüber angegeben.';
  END IF;
  IF p_other_user_id = v_me THEN
    RAISE EXCEPTION 'Ein Chat mit sich selbst ist nicht vorgesehen.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_other_user_id) THEN
    RAISE EXCEPTION 'Unbekannte Person (id=%).', p_other_user_id;
  END IF;

  v_lo  := least(v_me, p_other_user_id);
  v_hi  := greatest(v_me, p_other_user_id);
  v_key := v_lo::text || ':' || v_hi::text;

  -- (1) Schneller Weg: über den Paar-Schlüssel
  SELECT c.id INTO v_id
    FROM public.conversations c
   WHERE c.dm_key = v_key AND c.is_group = false
   LIMIT 1;

  -- (2) Alt-Bestand ohne dm_key: is_group=false UND GENAU diese zwei Mitglieder
  IF v_id IS NULL THEN
    SELECT c.id INTO v_id
      FROM public.conversations c
     WHERE c.is_group = false
       AND (SELECT count(*) FROM public.conversation_members m WHERE m.conversation_id = c.id) = 2
       AND EXISTS (SELECT 1 FROM public.conversation_members m WHERE m.conversation_id = c.id AND m.user_id = v_lo)
       AND EXISTS (SELECT 1 FROM public.conversation_members m WHERE m.conversation_id = c.id AND m.user_id = v_hi)
     ORDER BY c.id
     LIMIT 1;
  END IF;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, false;
    RETURN;
  END IF;

  -- (3) Anlegen. Der Vorhänge-Lock auf dem sortierten Paar serialisiert
  --     gleichzeitige Aufrufe, damit nicht zwei DMs entstehen und damit der
  --     Verlierer eines Rennens erst weiterläuft, wenn die Mitgliedszeilen des
  --     Gewinners committed sind (sonst liefert er eine leere Konversation aus).
  PERFORM pg_advisory_xact_lock(hashtextextended(v_key, 0));

  SELECT c.id INTO v_id
    FROM public.conversations c
   WHERE c.dm_key = v_key AND c.is_group = false
   LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.conversations (is_group, name, created_by, dm_key)
    VALUES (false, NULL, v_me, v_key)
    ON CONFLICT (dm_key) DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      SELECT c.id INTO v_id FROM public.conversations c WHERE c.dm_key = v_key LIMIT 1;
    ELSE
      -- Konversation und beide Mitgliedszeilen entstehen in EINER Transaktion.
      -- Bricht etwas ab, bleibt kein Geist ohne Mitglieder zurück.
      INSERT INTO public.conversation_members (conversation_id, user_id)
      VALUES (v_id, v_lo), (v_id, v_hi)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Chat konnte nicht angelegt werden.';
  END IF;

  RETURN QUERY SELECT v_id, false;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_or_create_dm(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_or_create_dm(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_dm(bigint) TO authenticated;

-- 2e) INSERT auf conversation_members härten.
--     Vorher (permissiv, OR-verknüpft):
--       cm_insert_own                user_id = get_app_user_id()          -> zu weit:
--                                    erlaubt Selbsteintrag in FREMDE Konversationen
--       conv_members_insert          auth.uid() IS NOT NULL               -> offen
--       conv_members_insert_appuser  get_app_user_id() IS NOT NULL        -> offen
--     Nachher: genau eine Policy.
--     Wirkungsanalyse der schreibenden Code-Stellen (index.html v4.30.0):
--       createConversation      Z.4392/4395  -> künftig RPC (SECURITY DEFINER, umgeht RLS);
--                                              der noch ausgelieferte Altpfad greift über "Ersteller"
--       createGroupConversation Z.4678/4681  -> "Ersteller" (created_by DEFAULT get_app_user_id())
--       addConversationMember   Z.4695       -> "Mitglied" (is_conversation_member)
--       Weiterleiten-Dialog     Z.10497      -> ruft createConversation, s. o.
DROP POLICY IF EXISTS conv_members_insert            ON public.conversation_members;
DROP POLICY IF EXISTS conv_members_insert_appuser    ON public.conversation_members;
DROP POLICY IF EXISTS conv_members_insert_authenticated ON public.conversation_members;
DROP POLICY IF EXISTS cm_insert_own                  ON public.conversation_members;
DROP POLICY IF EXISTS cm_insert_member_or_creator    ON public.conversation_members;

-- REKURSIONSFALLE (im Testlauf am 21.09. tatsächlich ausgelöst): Eine Policy auf
-- conversation_members, die conversations DIREKT liest, lässt Postgres beim
-- Auswerten erneut die Policies von conversation_members entfalten
-- (conversations_select_member liest conversation_members) und bricht mit
-- "infinite recursion detected in policy for relation conversation_members" ab.
-- Deshalb steckt die Bedingung in einem SECURITY-DEFINER-Helper — dasselbe
-- Muster wie public.is_team_admin(text) / public.is_conversation_member(bigint).
CREATE OR REPLACE FUNCTION public.can_add_conversation_member(p_conversation_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
           SELECT 1 FROM public.conversation_members m
            WHERE m.conversation_id = p_conversation_id
              AND m.user_id = public.get_app_user_id()
         )
      OR EXISTS (
           SELECT 1 FROM public.conversations c
            WHERE c.id = p_conversation_id
              AND c.created_by = public.get_app_user_id()
         );
$function$;

REVOKE ALL ON FUNCTION public.can_add_conversation_member(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_add_conversation_member(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_add_conversation_member(bigint) TO authenticated;

CREATE POLICY cm_insert_member_or_creator
  ON public.conversation_members
  FOR INSERT TO authenticated
  WITH CHECK ( public.can_add_conversation_member(conversation_id) );

COMMIT;


-- ============================================================
-- 3) UNDO  (nur im Notfall — stellt den Stand vom 21.09.2026 wortgleich her)
-- ============================================================
-- BEGIN;
--
-- DROP POLICY IF EXISTS cm_insert_member_or_creator ON public.conversation_members;
--
-- CREATE POLICY cm_insert_own ON public.conversation_members
--   FOR INSERT TO public WITH CHECK (user_id = get_app_user_id());
-- CREATE POLICY conv_members_insert ON public.conversation_members
--   FOR INSERT TO public WITH CHECK (auth.uid() IS NOT NULL);
-- CREATE POLICY conv_members_insert_appuser ON public.conversation_members
--   FOR INSERT TO public WITH CHECK (get_app_user_id() IS NOT NULL);
--
-- DROP FUNCTION IF EXISTS public.get_or_create_dm(bigint);
-- DROP FUNCTION IF EXISTS public.can_add_conversation_member(bigint);
-- DROP INDEX IF EXISTS public.conversations_dm_key_uidx;
-- ALTER TABLE public.conversations DROP COLUMN IF EXISTS dm_key;
--
-- COMMIT;
--
-- HINWEIS: Nach einem UNDO läuft wieder der fehlerhafte Heuristik-Pfad, sobald
-- ein Client < v4.31.0 aktiv ist. Frontend gleichzeitig zurückrollen.


-- ============================================================
-- 4) VERIFY
-- ============================================================

-- 4a) Genau eine INSERT-Policy, und sie ist konversationsbezogen
SELECT policyname, cmd, roles, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='conversation_members' AND cmd='INSERT';

-- 4b) Rechte auf der RPC: authenticated ja, anon nein
SELECT grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema='public' AND routine_name='get_or_create_dm'
ORDER BY grantee;

-- 4c) dm_key-Abdeckung
SELECT count(*) FILTER (WHERE dm_key IS NOT NULL) AS mit_key,
       count(*) FILTER (WHERE dm_key IS NULL AND is_group=false) AS dm_ohne_key,
       count(*) FILTER (WHERE is_group) AS gruppen
FROM public.conversations;

-- 4d) Verhaltenstest in einer Transaktion, die zurückgerollt wird.
--     Erwartung: (a) bestehende DM wird gefunden, (b) gemeinsame Gruppe führt zu
--     einer NEUEN DM, (c) nichts vorhanden -> neue DM. Siehe HANDOVER, Abschnitt O1.
