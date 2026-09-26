-- =====================================================================
-- Paket D4 — ungelesene Dringend-Beiträge für die Hub-Startkarte (25.09.2026)
-- Liefert nur IDs + Team-/Kanalnamen, KEINEN Inhalt (E-2).
-- „Ungelesen" = nach dem Kanal-Lesestand (wie rpc_unread_channel_counts),
-- nur Haupt-Beiträge, nicht eigene, nicht gelöscht, letzte 30 Tage,
-- ohne ausgeblendete Teams. Nicht-destruktiv, UNDO unten.
-- =====================================================================

create or replace function public.rpc_unread_urgent(p_limit int default 3)
returns table(post_id bigint, channel_id bigint, team_id bigint, team_name text, channel_name text, total bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_uid bigint;
begin
  v_uid := public.get_app_user_id();
  if v_uid is null then raise exception 'Nicht angemeldet (kein App-User).' using errcode = '42501'; end if;

  return query
  with treffer as (
    select p.id, p.channel_id, c.team_id, t.name as tname, c.name as cname, p.created_at
      from public.posts p
      join public.channels c      on c.id = p.channel_id
      join public.teams t         on t.id = c.team_id
      join public.team_members tm on tm.team_id = c.team_id and tm.user_id = v_uid
      left join public.channel_reads cr on cr.user_id = v_uid and cr.channel_id = p.channel_id
     where p.is_urgent = true
       and p.parent_id is null
       and p.is_deleted = false
       and p.author_id is distinct from v_uid
       and coalesce(tm.hidden, false) = false
       and p.created_at > now() - interval '30 days'
       and p.created_at > coalesce(cr.last_read_at, '-infinity'::timestamptz)
  )
  select x.id, x.channel_id, x.team_id, x.tname, x.cname, (select count(*) from treffer)::bigint
    from treffer x
   order by x.created_at desc
   limit greatest(1, least(coalesce(p_limit, 3), 10));
end $$;

revoke all on function public.rpc_unread_urgent(int) from public, anon;
grant execute on function public.rpc_unread_urgent(int) to authenticated;

-- UNDO:
--   drop function if exists public.rpc_unread_urgent(int);
