-- ============================================================================
-- KRS Connect — Rolle 'owner' + Rollen-Guard
-- Datum: 11.09.2026
--
-- ZWECK 1 (Wunsch Norbert): Fremde Beitraege bearbeiten/loeschen darf nur noch
--   der Plattform-Inhaber, nicht mehr jeder globale Admin. Bisher galt
--   posts_update_own_or_admin -> is_global_admin(), d. h. auch Daniel Schmitt
--   (id 3) und der Sammelaccount "KRS Admin" (id 51) konnten jeden Beitrag
--   aendern. Die UI-Regel allein reicht nicht — sie ist per API umgehbar.
--
-- ZWECK 2 (Sicherheitsluecke, beim Review gefunden): Die Policy
--   users_update_own erlaubt USING/WITH CHECK (auth_id = auth.uid()) ohne
--   Spaltenbeschraenkung. Jede angemeldete Lehrkraft konnte damit
--     update public.users set role='admin' where auth_id = auth.uid();
--   ausfuehren und sich selbst zum globalen Admin machen. Der Guard-Trigger
--   unten schliesst das, ohne die bestehenden Policies umzubauen.
--
-- STATUS (11.09.2026)
--   Block A  + B2 (Rollen-Guard): AM 11.09.2026 BEREITS EINGESPIELT und geprueft.
--     Grund fuer das Vorziehen: B2 schliesst die Eskalationsluecke aus Zweck 2
--     und wirkt unabhaengig vom Frontend-Deploy — jede Stunde Wartezeit waere
--     unnoetiges Risiko gewesen.
--     Gegenprobe per SQL mit gesetzten JWT-Claims (alles in einer
--     zurueckgerollten Transaktion):
--       Lehrkraft (member) -> role='admin'  : BLOCKIERT
--       Lehrkraft (member) -> role='owner'  : BLOCKIERT
--       Lehrkraft aendert display_name      : ERLAUBT   (richtig)
--       Admin stuft Mitglied hoch           : ERLAUBT   (richtig)
--       Admin vergibt 'owner'               : BLOCKIERT (richtig)
--   Block B1 (posts-Policies): OFFEN — zusammen mit dem Deploy von v4.21.0.
--     Vorher eingespielt saehen die anderen Admins in der alten UI weiterhin
--     Bearbeiten/Loeschen an fremden Beitraegen, es liefe nur ins Leere.
--   Block C (role='owner' fuer id 1): OFFEN — ERST NACH dem Deploy. Die alte
--     UI prueft role === 'admin' und wuerde Norbert sonst alle
--     Admin-Funktionen ausblenden.
-- ============================================================================

-- ------------------------------------------- Block A — EINGESPIELT 11.09. --
-- CHECK-Constraint um 'owner' erweitern; is_global_admin() zaehlt den Inhaber
-- mit (sonst verliert er saemtliche uebrigen Admin-Rechte serverseitig).

alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role = any (array['admin'::text, 'member'::text, 'owner'::text]));

create or replace function public.is_global_admin()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.users u
     where u.role in ('admin','owner')
       and ( u.auth_id = auth.uid()
             or u.email = (select email from auth.users where id = auth.uid()) )
  );
$$;

create or replace function public.is_platform_owner()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.users u
     where u.role = 'owner'
       and ( u.auth_id = auth.uid()
             or u.email = (select email from auth.users where id = auth.uid()) )
  );
$$;

revoke execute on function public.is_platform_owner() from anon;

-- ------------------------------------------------------- Block B1 — OFFEN --
-- posts: fremde Beitraege nur noch fuer den Inhaber. Mit dem Deploy einspielen.

drop policy if exists "posts_update_own_or_admin" on public.posts;
drop policy if exists "posts_delete_own_or_admin" on public.posts;

create policy "posts_update_own_or_owner" on public.posts
  for update using     (author_id = public.get_app_user_id() or public.is_platform_owner())
              with check (author_id = public.get_app_user_id() or public.is_platform_owner());

create policy "posts_delete_own_or_owner" on public.posts
  for delete using     (author_id = public.get_app_user_id() or public.is_platform_owner());

-- ------------------------------------------ Block B2 — EINGESPIELT 11.09. --
-- Rollen-Guard: schliesst die Eskalation aus users_update_own und
--     schuetzt die Inhaber-Rolle vor anderen Admins.
--     auth.uid() is null = direkter SQL-/service_role-Zugriff (Migrationen,
--     Admin-Skripte) — der bleibt erlaubt, sonst koennte niemand mehr
--     Rollen pflegen.

create or replace function public.guard_user_role_change()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.role is distinct from old.role then
    if auth.uid() is null then
      return new;                              -- service_role / SQL-Editor
    end if;
    if new.role = 'owner' or old.role = 'owner' then
      raise exception 'Die Inhaber-Rolle kann nur direkt in der Datenbank vergeben oder entzogen werden.'
        using errcode = '42501';
    end if;
    if not public.is_global_admin() then
      raise exception 'Nur Admins duerfen Rollen aendern.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_user_role_change on public.users;
create trigger trg_guard_user_role_change
  before update on public.users
  for each row execute function public.guard_user_role_change();

-- ---------------------------------------------------------------- Block C --
-- ERST NACH DEM DEPLOY VON v4.21.0 AUSFUEHREN.

-- update public.users set role = 'owner' where id = 1;   -- Norbert Kotzan

-- ============================================================================
-- PRUEFUNG
-- ============================================================================
-- select id, username, role from public.users where role <> 'member' order by id;
-- select policyname, cmd from pg_policies
--   where schemaname='public' and tablename='posts' and cmd in ('UPDATE','DELETE');
--   -> genau posts_update_own_or_owner + posts_delete_own_or_owner
-- select tgname from pg_trigger where tgrelid='public.users'::regclass and not tgisinternal;

-- ============================================================================
-- UNDO (vollstaendig, Stand vor dieser Migration)
-- ============================================================================
-- update public.users set role = 'admin' where role = 'owner';
-- drop trigger if exists trg_guard_user_role_change on public.users;
-- drop function if exists public.guard_user_role_change();
-- drop policy if exists "posts_update_own_or_owner" on public.posts;
-- drop policy if exists "posts_delete_own_or_owner" on public.posts;
-- create policy "posts_update_own_or_admin" on public.posts
--   for update using     (author_id = public.get_app_user_id() or public.is_global_admin())
--               with check (author_id = public.get_app_user_id() or public.is_global_admin());
-- create policy "posts_delete_own_or_admin" on public.posts
--   for delete using     (author_id = public.get_app_user_id() or public.is_global_admin());
-- create or replace function public.is_global_admin()
-- returns boolean language sql stable security definer set search_path to 'public' as $$
--   select exists (select 1 from public.users u where u.role = 'admin'
--     and (u.auth_id = auth.uid() or u.email = (select email from auth.users where id = auth.uid())));
-- $$;
-- drop function if exists public.is_platform_owner();
-- alter table public.users drop constraint if exists users_role_check;
-- alter table public.users add constraint users_role_check
--   check (role = any (array['admin'::text, 'member'::text]));
