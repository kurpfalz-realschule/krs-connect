-- =====================================================================
-- Paket A — DB-Teil (23.09.2026)
--  A4  Umfragen: Spalte posts.poll_data fehlte (Umfragen gingen live gar nicht);
--      Abstimmen nur noch atomar per RPC vote_poll (Mitgliedschaft geprüft),
--      poll_data sonst nicht änderbar, Stimmen beim Anlegen geleert.
--  A8  Storage images: Bucket-MIME-Liste statt „mimetype IS NULL"-Lücke;
--      breite Policies images_upload / images_delete_authenticated / images_update_own weg;
--      Löschen/Ändern nur Eigentümer:in (owner_id) oder globaler Admin.
--  A10 Kürzel der Superadmins (Ko, Ktz) nur durch Inhaber:in änderbar (sonst
--      könnte ein Admin sich per REST ein Superadmin-Kürzel geben → dashboard-admin).
-- UNDO: siehe Ende der Datei.
-- =====================================================================

-- ── A4 ───────────────────────────────────────────────────────────────
alter table public.posts add column if not exists poll_data jsonb;

create or replace function public.posts_poll_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.poll_data is not null and jsonb_typeof(new.poll_data->'options') = 'array' then
      new.poll_data := jsonb_set(
        jsonb_set(new.poll_data, '{options}',
          (select coalesce(jsonb_agg(o || '{"votes":[]}'::jsonb order by ord), '[]'::jsonb)
             from jsonb_array_elements(new.poll_data->'options') with ordinality t(o, ord))),
        '{totalVotes}', '0'::jsonb);
    end if;
  elsif new.poll_data is distinct from old.poll_data
        and coalesce(current_setting('krs.poll_rpc', true), '') <> 'on' then
    new.poll_data := old.poll_data;   -- nur vote_poll darf Stimmen ändern
  end if;
  return new;
end $$;

drop trigger if exists trg_posts_poll_guard on public.posts;
create trigger trg_posts_poll_guard before insert or update on public.posts
  for each row execute function public.posts_poll_guard();

create or replace function public.vote_poll(p_post_id bigint, p_option_id integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid bigint := public.get_app_user_id();
  v_pd jsonb;
  v_opts jsonb;
begin
  if v_uid is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  select p.poll_data into v_pd
    from public.posts p
    join public.channels c on c.id = p.channel_id
    join public.team_members tm on tm.team_id = c.team_id and tm.user_id = v_uid
   where p.id = p_post_id and coalesce(p.is_deleted, false) = false
   for update of p;
  if not found then
    raise exception 'Kein Zugriff auf diese Umfrage' using errcode = '42501';
  end if;
  if v_pd is null or jsonb_typeof(v_pd->'options') <> 'array' then
    raise exception 'Keine Umfrage' using errcode = '22023';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_pd->'options') o
                  where (o->>'id')::int = p_option_id) then
    raise exception 'Unbekannte Option' using errcode = '22023';
  end if;

  select jsonb_agg(
           o || jsonb_build_object('votes',
             coalesce((select jsonb_agg(v) from jsonb_array_elements(coalesce(o->'votes', '[]'::jsonb)) v
                        where v <> to_jsonb(v_uid)), '[]'::jsonb)
             || case when (o->>'id')::int = p_option_id then jsonb_build_array(v_uid) else '[]'::jsonb end)
           order by ord)
    into v_opts
    from jsonb_array_elements(v_pd->'options') with ordinality t(o, ord);

  v_pd := jsonb_set(v_pd, '{options}', v_opts);
  v_pd := jsonb_set(v_pd, '{totalVotes}',
            to_jsonb((select coalesce(sum(jsonb_array_length(o->'votes')), 0)::int
                        from jsonb_array_elements(v_opts) o)));

  perform set_config('krs.poll_rpc', 'on', true);
  update public.posts set poll_data = v_pd where id = p_post_id;
  perform set_config('krs.poll_rpc', 'off', true);
  return v_pd;
end $$;
revoke all on function public.vote_poll(bigint, integer) from public, anon;
grant execute on function public.vote_poll(bigint, integer) to authenticated;

-- ── A8 ───────────────────────────────────────────────────────────────
update storage.buckets set allowed_mime_types = array[
  'image/jpeg','image/jpg','image/png','image/gif','image/webp','image/heic',
  'application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain','text/csv','text/markdown']
where id = 'images';

drop policy if exists images_upload on storage.objects;
drop policy if exists images_delete_authenticated on storage.objects;
drop policy if exists images_update_own on storage.objects;

create policy images_update_owner on storage.objects for update to authenticated
  using (bucket_id = 'images' and owner_id = (select auth.uid())::text)
  with check (bucket_id = 'images' and owner_id = (select auth.uid())::text);
create policy images_delete_owner_or_admin on storage.objects for delete to authenticated
  using (bucket_id = 'images' and (owner_id = (select auth.uid())::text or (select public.is_global_admin())));

-- ── A10 ──────────────────────────────────────────────────────────────
create or replace function public.guard_user_role_change()
 returns trigger language plpgsql security definer set search_path to ''
as $function$
declare
  caller_is_admin boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  caller_is_admin := public.is_global_admin();

  if new.role is distinct from old.role then
    if new.role = 'owner' or old.role = 'owner' then
      raise exception 'Die Inhaber-Rolle kann nur direkt in der Datenbank vergeben oder entzogen werden.'
        using errcode = '42501';
    end if;
    if not caller_is_admin then
      raise exception 'Nur Admins duerfen Rollen aendern.'
        using errcode = '42501';
    end if;
  end if;

  -- A10: Superadmin-Kuerzel (dashboard-admin) nur durch Inhaber:in vergeben/entziehen.
  if new.kuerzel is distinct from old.kuerzel
     and (new.kuerzel in ('Ko', 'Ktz') or old.kuerzel in ('Ko', 'Ktz'))
     and not public.is_platform_owner() then
    raise exception 'Dieses Kuerzel kann nur die Inhaberin/der Inhaber vergeben.'
      using errcode = '42501';
  end if;

  if not caller_is_admin and (
    new.id is distinct from old.id
    or new.username is distinct from old.username
    or new.email is distinct from old.email
    or new.auth_uid is distinct from old.auth_uid
    or new.auth_id is distinct from old.auth_id
    or new.status is distinct from old.status
    or new.kuerzel is distinct from old.kuerzel
    or new.hub_editor is distinct from old.hub_editor
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Offizielle Kontodaten koennen nur zentral durch die Administration geaendert werden.'
      using errcode = '42501';
  end if;

  return new;
end
$function$;

-- ── UNDO ─────────────────────────────────────────────────────────────
-- drop trigger trg_posts_poll_guard on public.posts; drop function public.posts_poll_guard();
-- drop function public.vote_poll(bigint, integer);  (Spalte poll_data bleibt, schadet nicht)
-- update storage.buckets set allowed_mime_types = null where id = 'images';
-- drop policy images_update_owner on storage.objects; drop policy images_delete_owner_or_admin on storage.objects;
-- create policy images_upload on storage.objects for insert with check (bucket_id='images' and auth.uid() is not null);
-- create policy images_delete_authenticated on storage.objects for delete using (bucket_id='images');
-- create policy images_update_own on storage.objects for update using (bucket_id='images' and (storage.foldername(name))[1]='uploads') with check (bucket_id='images');
-- guard_user_role_change: A10-Block entfernen.
