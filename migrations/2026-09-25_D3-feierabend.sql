-- =====================================================================
-- Paket D3 — Feierabend-Modus (25.09.2026) · Connect 4.45.0
-- Quelle: _lokal/SPRINT-PAKET-D-KONZEPT-2026-09-25.md, Entscheidung E-3:
--   werktags 18:00–07:00 still, Wochenende + Ferien still, DRINGEND kommt
--   immer durch, jede Person kann Zeiten ändern oder den Modus ausschalten.
-- Nicht-destruktiv: nur neue Spalten/Tabelle/Funktionen. UNDO unten.
-- =====================================================================

-- 1) Einstellungen je Person (Standard = Modus an, 18–7, Wochenende, Ferien)
alter table public.user_preferences
  add column if not exists quiet_enabled  boolean not null default true,
  add column if not exists quiet_start    time    not null default '18:00',
  add column if not exists quiet_end      time    not null default '07:00',
  add column if not exists quiet_weekend  boolean not null default true,
  add column if not exists quiet_holidays boolean not null default true;

-- 2) Ferientage (ein Datensatz je Tag). Leer = keine Ferienruhe.
create table if not exists public.school_holidays (
  day   date primary key,
  label text
);
alter table public.school_holidays enable row level security;

drop policy if exists school_holidays_select on public.school_holidays;
create policy school_holidays_select on public.school_holidays
  for select to authenticated using (true);

drop policy if exists school_holidays_admin_write on public.school_holidays;
create policy school_holidays_admin_write on public.school_holidays
  for all to authenticated
  using ((select public.is_global_admin()))
  with check ((select public.is_global_admin()));

revoke all on public.school_holidays from anon, public;
grant select, insert, update, delete on public.school_holidays to authenticated;

-- 3) Kern: ist Person p_user zum Zeitpunkt p_at im Feierabend?
--    Rechnet in Europe/Berlin. Ohne user_preferences-Zeile gelten die Standards.
create or replace function public.krs_is_quiet(p_user bigint, p_at timestamptz default now())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with p as (
    select coalesce(up.quiet_enabled,  true)             as en,
           coalesce(up.quiet_start,    time '18:00')     as qs,
           coalesce(up.quiet_end,      time '07:00')     as qe,
           coalesce(up.quiet_weekend,  true)             as we,
           coalesce(up.quiet_holidays, true)             as ho
      from (select 1) x
      left join public.user_preferences up on up.user_id = p_user
  ), t as (
    select (p_at at time zone 'Europe/Berlin') as lt
  )
  select case
    when not p.en then false
    when p.we and extract(isodow from t.lt) in (6, 7) then true
    when p.ho and exists (select 1 from public.school_holidays h where h.day = t.lt::date) then true
    when p.qs = p.qe then false
    when p.qs < p.qe then t.lt::time >= p.qs and t.lt::time < p.qe
    else t.lt::time >= p.qs or t.lt::time < p.qe      -- Fenster über Mitternacht
  end
  from p, t;
$$;

-- 4) Ein Aufruf für die ganze Empfängerliste: liefert die Stillen zurück.
create or replace function public.krs_quiet_users(p_users bigint[], p_at timestamptz default now())
returns setof bigint
language sql
stable
security definer
set search_path = ''
as $$
  select u from unnest(coalesce(p_users, '{}'::bigint[])) as u
   where public.krs_is_quiet(u, p_at);
$$;

-- Nur die Edge Functions (service_role) dürfen fragen — sonst ließe sich
-- der Tagesrhythmus Dritter abfragen.
revoke all on function public.krs_is_quiet(bigint, timestamptz)      from public, anon, authenticated;
revoke all on function public.krs_quiet_users(bigint[], timestamptz) from public, anon, authenticated;
grant execute on function public.krs_is_quiet(bigint, timestamptz)      to service_role;
grant execute on function public.krs_quiet_users(bigint[], timestamptz) to service_role;

-- =====================================================================
-- UNDO (nur bei Bedarf, in dieser Reihenfolge):
--   drop function if exists public.krs_quiet_users(bigint[], timestamptz);
--   drop function if exists public.krs_is_quiet(bigint, timestamptz);
--   drop table if exists public.school_holidays;
--   alter table public.user_preferences
--     drop column if exists quiet_enabled, drop column if exists quiet_start,
--     drop column if exists quiet_end, drop column if exists quiet_weekend,
--     drop column if exists quiet_holidays;
-- Danach Edge Functions notify-push/notify-email auf die Vorversion
-- (ohne krs_quiet_users) zurücksetzen — sonst loggen sie einen RPC-Fehler
-- und schicken (fail-open) weiter an alle.
-- =====================================================================
