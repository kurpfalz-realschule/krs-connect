-- =====================================================================
-- Paket D1 — Antworten im eigenen Thread zählen als ungelesen (25.09.2026)
-- Push-Logik (@Name, Antworten) liegt in der Edge Function notify-push.
-- Hier nur der Lesestand je Thread + zwei RPCs. Nicht-destruktiv, UNDO unten.
--
-- Semantik:
--   „Mein Thread"   = ich habe den Beitrag geschrieben oder darin geantwortet.
--   „gesehen bis"   = max(thread_reads.last_read_at, meine letzte Antwort darin).
--   unread_count    = fremde Antworten nach „gesehen bis" (Badge am Beitrag,
--                     bleibt bis der Thread geöffnet wird).
--   unread_since_channel_read = davon nur die nach dem Kanal-Lesestand
--                     (fließt in den Kanal-Punkt; verschwindet beim Öffnen des
--                     Kanals — wie bisher, S15-Vertrag bleibt).
--   Nur Antworten der letzten 14 Tage zählen (kein Alt-Stau beim Start).
-- =====================================================================

-- ⚠ 26.09.: Ursprünglich mit PRIMARY KEY (user_id, parent_id) eingespielt → PostgREST
--   sah eine m2m-Verknüpfung posts↔users, author:users(...) wurde mehrdeutig (HTTP 300),
--   alle Kanäle wirkten leer (HANDOVER 0BJ). Live korrigiert durch
--   2026-09-26_HOTFIX-posts-users-embed-mehrdeutig.sql. Diese Datei zeigt den
--   KORRIGIERTEN Stand (eigene id als PK, Paar als UNIQUE).
create table if not exists public.thread_reads (
  id           bigint generated always as identity primary key,
  user_id      bigint      not null references public.users(id) on delete cascade,
  parent_id    bigint      not null references public.posts(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  constraint thread_reads_user_id_parent_id_key unique (user_id, parent_id)
);
create index if not exists idx_thread_reads_parent on public.thread_reads(parent_id);
alter table public.thread_reads enable row level security;

drop policy if exists thread_reads_select_own on public.thread_reads;
create policy thread_reads_select_own on public.thread_reads
  for select to authenticated using (user_id = (select public.get_app_user_id()));
-- Schreiben nur über rpc_mark_thread_read (prüft Mitgliedschaft).
revoke all on public.thread_reads from anon, public, authenticated;
grant select on public.thread_reads to authenticated;

-- Thread als gelesen markieren (Serverzeit, nie rückwärts).
create or replace function public.rpc_mark_thread_read(p_parent_id bigint)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare v_uid bigint; v_ts timestamptz;
begin
  v_uid := public.get_app_user_id();
  if v_uid is null then raise exception 'Nicht angemeldet (kein App-User).' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.posts p
      join public.channels c on c.id = p.channel_id
      join public.team_members tm on tm.team_id = c.team_id and tm.user_id = v_uid
     where p.id = p_parent_id and p.parent_id is null
  ) then
    raise exception 'Kein Zugriff auf Beitrag %', p_parent_id using errcode = '42501';
  end if;
  insert into public.thread_reads (user_id, parent_id, last_read_at)
  values (v_uid, p_parent_id, now())
  on conflict (user_id, parent_id) do update
     set last_read_at = greatest(public.thread_reads.last_read_at, now())
  returning last_read_at into v_ts;
  return v_ts;
end $$;

create or replace function public.rpc_unread_thread_counts(p_channel_ids bigint[] default null)
returns table(channel_id bigint, parent_id bigint, unread_count bigint, unread_since_channel_read bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_uid bigint; v_ab timestamptz := now() - interval '14 days';
begin
  v_uid := public.get_app_user_id();
  if v_uid is null then raise exception 'Nicht angemeldet (kein App-User).' using errcode = '42501'; end if;

  return query
  with acc as (
    select c.id as cid
      from public.channels c
      join public.team_members tm on tm.team_id = c.team_id and tm.user_id = v_uid
     where p_channel_ids is null or c.id = any (p_channel_ids)
  ),
  neu as (           -- fremde Antworten der letzten 14 Tage in meinen Kanälen
    select r.parent_id as pid, r.channel_id as cid, r.created_at
      from public.posts r
     where r.parent_id is not null
       and r.channel_id in (select a.cid from acc a)
       and r.created_at > v_ab
       and r.is_deleted = false
       and r.author_id is distinct from v_uid
  ),
  meine as (         -- davon nur Threads, an denen ich beteiligt bin
    select distinct n.pid, n.cid
      from neu n
      join public.posts par on par.id = n.pid and par.is_deleted = false
     where par.author_id = v_uid
        or exists (select 1 from public.posts m where m.parent_id = n.pid and m.author_id = v_uid)
  ),
  stand as (
    select t.pid, t.cid,
           greatest(
             coalesce((select tr.last_read_at from public.thread_reads tr where tr.user_id = v_uid and tr.parent_id = t.pid), '-infinity'::timestamptz),
             coalesce((select max(m.created_at) from public.posts m where m.parent_id = t.pid and m.author_id = v_uid), '-infinity'::timestamptz)
           ) as gesehen,
           coalesce((select cr.last_read_at from public.channel_reads cr where cr.user_id = v_uid and cr.channel_id = t.cid), '-infinity'::timestamptz) as kanal_gelesen
      from meine t
  )
  select s.cid, s.pid,
         count(*) filter (where n.created_at > s.gesehen)::bigint,
         count(*) filter (where n.created_at > greatest(s.gesehen, s.kanal_gelesen))::bigint
    from stand s
    join neu n on n.pid = s.pid
   group by s.cid, s.pid
  having count(*) filter (where n.created_at > s.gesehen) > 0;
end $$;

revoke all on function public.rpc_mark_thread_read(bigint)        from public, anon;
revoke all on function public.rpc_unread_thread_counts(bigint[])  from public, anon;
grant execute on function public.rpc_mark_thread_read(bigint)       to authenticated;
grant execute on function public.rpc_unread_thread_counts(bigint[]) to authenticated;

-- =====================================================================
-- UNDO:
--   drop function if exists public.rpc_unread_thread_counts(bigint[]);
--   drop function if exists public.rpc_mark_thread_read(bigint);
--   drop table if exists public.thread_reads;
-- Client ab 4.45.0 fängt fehlende RPCs ab (keine Thread-Badges, sonst normal).
-- =====================================================================
