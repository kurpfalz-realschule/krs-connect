-- =====================================================================
-- Paket D2 — „Zur Kenntnis genommen" bei Dringend-Beiträgen (25.09.2026)
-- Client-Funktion bleibt AUS (FEATURES.ACK = false), bis der Personalrat
-- informiert ist (mögliche Verhaltens-/Leistungskontrolle). Solange niemand
-- ack_post aufruft, entstehen keine Daten.
--
-- Entscheidung Norbert (25.09.2026): Namensliste „fehlt noch" sehen NUR
-- Verfasser:in und Schulleitung (is_global_admin()); alle anderen nur die Zahl.
-- Strenger als Konzept: kein direktes INSERT auf post_acks (nur per RPC, der
-- Mitgliedschaft + Dringend prüft). Nicht-destruktiv, UNDO unten.
-- =====================================================================

-- ⚠ 26.09.: Ursprünglich mit PRIMARY KEY (post_id, user_id) → Ausfall „Kanäle leer"
--   (HANDOVER 0BJ, Hotfix 2026-09-26_HOTFIX-…). Hier der KORRIGIERTE Stand.
create table if not exists public.post_acks (
  id       bigint generated always as identity primary key,
  post_id  bigint      not null references public.posts(id) on delete cascade,
  user_id  bigint      not null references public.users(id) on delete cascade,
  acked_at timestamptz not null default now(),
  constraint post_acks_post_id_user_id_key unique (post_id, user_id)
);
create index if not exists idx_post_acks_user on public.post_acks(user_id);
alter table public.post_acks enable row level security;

drop policy if exists post_acks_select_own on public.post_acks;
create policy post_acks_select_own on public.post_acks
  for select to authenticated using (user_id = (select public.get_app_user_id()));
revoke all on public.post_acks from anon, public, authenticated;
grant select on public.post_acks to authenticated;

-- Hilfsprüfung: Aufrufer ist Mitglied im Team des Beitrags.
create or replace function public.krs_ack_post_team(p_post_id bigint, p_uid bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select c.team_id
    from public.posts p
    join public.channels c on c.id = p.channel_id
    join public.team_members tm on tm.team_id = c.team_id and tm.user_id = p_uid
   where p.id = p_post_id
$$;
revoke all on function public.krs_ack_post_team(bigint, bigint) from public, anon, authenticated;

create or replace function public.ack_post(p_post_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_uid bigint;
begin
  v_uid := public.get_app_user_id();
  if v_uid is null then raise exception 'Nicht angemeldet.' using errcode = '42501'; end if;
  if public.krs_ack_post_team(p_post_id, v_uid) is null then
    raise exception 'Kein Zugriff auf Beitrag %', p_post_id using errcode = '42501';
  end if;
  if not exists (select 1 from public.posts where id = p_post_id and is_urgent = true
                   and parent_id is null and is_deleted = false) then
    raise exception 'Nur Dringend-Beiträge können bestätigt werden.' using errcode = '22023';
  end if;
  insert into public.post_acks (post_id, user_id) values (p_post_id, v_uid)
  on conflict (post_id, user_id) do nothing;
  return true;
end $$;

create or replace function public.ack_status(p_post_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid bigint; v_team bigint; v_author bigint; v_admin boolean;
  v_total int; v_acked int; v_mine boolean; v_missing jsonb := null;
begin
  v_uid := public.get_app_user_id();
  if v_uid is null then raise exception 'Nicht angemeldet.' using errcode = '42501'; end if;
  v_admin := public.is_global_admin();
  select c.team_id, p.author_id into v_team, v_author
    from public.posts p join public.channels c on c.id = p.channel_id
   where p.id = p_post_id;
  if v_team is null then raise exception 'Beitrag % nicht gefunden', p_post_id using errcode = '42501'; end if;
  if not v_admin and public.krs_ack_post_team(p_post_id, v_uid) is null then
    raise exception 'Kein Zugriff auf Beitrag %', p_post_id using errcode = '42501';
  end if;

  -- Soll: aktive Teammitglieder ohne Verfasser:in
  with soll as (
    select u.id, coalesce(nullif(u.anzeigename, ''), u.display_name) as name
      from public.team_members tm join public.users u on u.id = tm.user_id
     where tm.team_id = v_team and u.id is distinct from v_author
       and coalesce(u.status, 'active') = 'active'
  )
  select count(*),
         count(*) filter (where exists (select 1 from public.post_acks a where a.post_id = p_post_id and a.user_id = soll.id)),
         case when v_uid = v_author or v_admin then
           coalesce(jsonb_agg(soll.name order by soll.name)
                    filter (where not exists (select 1 from public.post_acks a where a.post_id = p_post_id and a.user_id = soll.id)),
                    '[]'::jsonb)
         end
    into v_total, v_acked, v_missing
    from soll;

  v_mine := exists (select 1 from public.post_acks a where a.post_id = p_post_id and a.user_id = v_uid);
  return jsonb_build_object('acked', v_acked, 'total', v_total, 'mine', v_mine, 'missing', v_missing);
end $$;

revoke all on function public.ack_post(bigint)   from public, anon;
revoke all on function public.ack_status(bigint) from public, anon;
grant execute on function public.ack_post(bigint)   to authenticated;
grant execute on function public.ack_status(bigint) to authenticated;

-- UNDO:
--   drop function if exists public.ack_status(bigint);
--   drop function if exists public.ack_post(bigint);
--   drop function if exists public.krs_ack_post_team(bigint, bigint);
--   drop table if exists public.post_acks;
