-- S-2 2.7 M-11 (Audit 24.09.2026) — IN PROD 25.09.2026 (Migration sec_s2_m11_anon_execute_reaction)
-- Vorher: 16 SECURITY-DEFINER-Funktionen fuer anon ausfuehrbar, 27 Policies TO public, toggle_reaction auf fremde Beitraege moeglich.
-- Trockenlauf: anon get_app_user_id 42501; anon posts/feedback/team_links 0 Zeilen (kein Fehler);
-- Lehrkraft posts 84->84, Reaktion eigenes Team added/removed, fremder Beitrag 42501. Nachher: 0 anon-DEFINER, 0 public-Policies.
-- 1) Policies, die nur fuer eingeloggte gedacht sind, explizit auf authenticated (anon wertet sie dann nicht aus -> leere Ergebnisse statt Fehler)
do $p$ declare r record; begin
  for r in select schemaname, tablename, policyname from pg_policies
           where schemaname = 'public' and roles = array['public']::name[]
             and tablename in ('feedback','kalender_feed_tokens','kalender_quellen','kalender_termine','koffer_physisch',
                               'notes','tasks','team_links','team_termine','user_preferences')
  loop
    execute format('alter policy %I on %I.%I to authenticated', r.policyname, r.schemaname, r.tablename);
  end loop;
end $p$;

-- 2) SECURITY-DEFINER-Funktionen: kein EXECUTE fuer anon/PUBLIC
do $f$ declare r record; begin
  for r in select p.oid::regprocedure sig, p.prorettype = 'trigger'::regtype is_trg
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef
             and has_function_privilege('anon', p.oid, 'EXECUTE')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
    if not r.is_trg then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
  end loop;
end $f$;

-- 3) Neue Funktionen in public bekommen kuenftig kein EXECUTE fuer anon/PUBLIC mehr automatisch
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;

-- 4) toggle_reaction: nur auf sichtbare Beitraege/Nachrichten (Entfernen eigener Reaktion bleibt immer moeglich)
CREATE OR REPLACE FUNCTION public.toggle_reaction(p_target_type text, p_target_id bigint, p_user_id bigint, p_emoji text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- M-11 (Audit 24.09.2026): nur auf Beitraege/Nachrichten reagieren, die man sehen darf
  IF p_target_type = 'post' AND NOT EXISTS (
       SELECT 1 FROM posts p JOIN channels c ON c.id = p.channel_id
        WHERE p.id = p_target_id AND c.team_id IN (SELECT public.rls_my_team_ids())) THEN
    RAISE EXCEPTION 'Kein Zugriff auf diesen Beitrag.' USING ERRCODE = '42501';
  END IF;
  IF p_target_type = 'message' AND NOT EXISTS (
       SELECT 1 FROM messages m
        WHERE m.id = p_target_id AND m.conversation_id IN (SELECT public.rls_my_conversation_ids())) THEN
    RAISE EXCEPTION 'Kein Zugriff auf diese Nachricht.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO reactions (target_type, target_id, user_id, emoji)
  VALUES (p_target_type, p_target_id, p_user_id, p_emoji);
  RETURN 'added';
END;
$function$;
