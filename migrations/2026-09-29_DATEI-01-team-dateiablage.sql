-- ============================================================================
-- DATEI-01 · Team-Dateiablage mit echtem Upload (Connect 4.48.0) · 29.09.2026
-- ============================================================================
-- Anlass: Rückmeldung aus dem Kollegium — die Elternabend-Unterlagen aus dem
-- alten Teams ließen sich nicht „genauso" wieder ablegen (nur Links möglich),
-- deshalb landeten sie im privaten OneDrive. Jetzt: Dateien + Ordner direkt im
-- Team, sichtbar NUR für Mitglieder dieses Teams.
--
-- Bausteine
--   1. Privater Bucket `team-files` (50 MB/Datei, feste Typ-Liste, kein SVG/HTML)
--      Objekt-Pfad: <team_id>/<uuid>.<ext>  (Originalname steht in der Tabelle,
--      Storage-Schlüssel erlauben keine Umlaute)
--   2. Tabelle `public.team_files` = Ordnerbaum (kind file|folder, parent_id)
--   3. RLS Tabelle: lesen/anlegen = Team-Mitglieder; umbenennen/löschen =
--      Ersteller:in (solange Mitglied) oder Team-Admin oder globale Admins.
--      Nicht-Admins löschen Ordner nur, wenn sie leer sind.
--   4. RLS Storage (nur Bucket team-files): lesen/hochladen = Team-Mitglieder
--      (Team aus dem 1. Pfadteil), löschen = Eigentümer:in oder Team-Admin.
--   5. Spalten-Rechte: UPDATE nur auf (name, updated_at) — kein Verschieben
--      in fremde Teams, kein Umbiegen von storage_path.
--
-- Löschen der Objekte: direkt per SQL gesperrt (storage.protect_delete) —
-- die App löscht zuerst die Zeile(n), dann per Storage-API die Objekte.
-- Verwaiste Objekte (z. B. nach Team-Löschung) findet ein Admin mit:
--   select o.name, o.created_at from storage.objects o
--    where o.bucket_id = 'team-files'
--      and not exists (select 1 from public.team_files f where f.storage_path = o.name);
-- ============================================================================

-- 1) Bucket -------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-files', 'team-files', false, 52428800,
  array[
    -- Bilder (bewusst OHNE image/svg+xml: SVG kann Skript tragen)
    'image/jpeg','image/jpg','image/png','image/gif','image/webp','image/heic','image/heif',
    -- PDF + Office
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
    -- OpenDocument (LibreOffice)
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',
    -- Text
    'text/plain','text/csv','text/markdown','application/rtf','text/rtf',
    -- Audio/Video (Musik, kurze Clips)
    'audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav',
    'video/mp4','video/quicktime'
  ]
)
on conflict (id) do update
   set public = false,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- 2) Tabelle ------------------------------------------------------------------
create table if not exists public.team_files (
  id          uuid primary key default gen_random_uuid(),
  team_id     bigint not null references public.teams(id) on delete cascade,
  parent_id   uuid references public.team_files(id) on delete cascade,
  kind        text not null check (kind in ('file','folder')),
  name        text not null,
  storage_path text,
  mime_type   text,
  size_bytes  bigint,
  created_by  bigint default public.get_app_user_id()
              constraint team_files_created_by_fkey references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  constraint team_files_name_chk check (
    char_length(btrim(name)) between 1 and 200
    and name !~ '[/\\[:cntrl:]]'
  ),
  constraint team_files_kind_chk check (
    (kind = 'file'   and storage_path is not null and size_bytes is not null)
    or (kind = 'folder' and storage_path is null and size_bytes is null)
  ),
  constraint team_files_path_chk check (
    storage_path is null
    or (storage_path like (team_id::text || '/%') and position('..' in storage_path) = 0)
  ),
  constraint team_files_size_chk check (size_bytes is null or size_bytes between 0 and 52428800)
);

comment on table public.team_files is
  'DATEI-01 (29.09.2026): Team-Dateiablage (Ordnerbaum). Dateien liegen im privaten Bucket team-files unter <team_id>/<uuid>.<ext>.';

create unique index if not exists team_files_storage_path_uq
  on public.team_files (storage_path) where storage_path is not null;
-- Kein doppelter Name im selben Ordner (Groß/klein egal); Wurzel = parent_id NULL
create unique index if not exists team_files_name_uq
  on public.team_files (team_id, parent_id, lower(name)) nulls not distinct;
create index if not exists team_files_parent_idx     on public.team_files (parent_id);
create index if not exists team_files_created_by_idx on public.team_files (created_by);

-- Eltern-Ordner muss im selben Team liegen und ein Ordner sein; Name trimmen.
create or replace function public.team_files_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'Ein Ordner kann nicht in sich selbst liegen' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.team_files p
       where p.id = new.parent_id and p.team_id = new.team_id and p.kind = 'folder'
    ) then
      raise exception 'Zielordner gehört nicht zu diesem Team' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end
$$;
revoke all on function public.team_files_before_write() from public, anon, authenticated;

drop trigger if exists team_files_before_write on public.team_files;
create trigger team_files_before_write
  before insert or update on public.team_files
  for each row execute function public.team_files_before_write();

-- 3) Rechte + RLS Tabelle ------------------------------------------------------
revoke all on public.team_files from anon;
revoke all on public.team_files from authenticated;
grant select, insert, delete on public.team_files to authenticated;
grant update (name, updated_at) on public.team_files to authenticated;

alter table public.team_files enable row level security;

drop policy if exists team_files_select_member on public.team_files;
create policy team_files_select_member on public.team_files
  for select to authenticated
  using (
    team_id in (select public.rls_my_team_ids())
    or (select public.is_global_admin())
  );

drop policy if exists team_files_insert_member on public.team_files;
create policy team_files_insert_member on public.team_files
  for insert to authenticated
  with check (
    created_by = (select public.get_app_user_id())
    and (
      team_id in (select public.rls_my_team_ids())
      or (select public.is_global_admin())
    )
  );

drop policy if exists team_files_update_owner_or_admin on public.team_files;
create policy team_files_update_owner_or_admin on public.team_files
  for update to authenticated
  using (
    (select public.is_global_admin())
    or public.is_team_admin(team_id::text)
    or (created_by = (select public.get_app_user_id()) and team_id in (select public.rls_my_team_ids()))
  )
  with check (
    (select public.is_global_admin())
    or public.is_team_admin(team_id::text)
    or (created_by = (select public.get_app_user_id()) and team_id in (select public.rls_my_team_ids()))
  );

-- Hilfsfunktion statt Unterabfrage in der Policy: eine Policy, die dieselbe
-- Tabelle abfragt, löst in Postgres „infinite recursion detected in policy" aus
-- (im RLS-Test am 29.09. so aufgetreten → als datei_01b nachgezogen).
create or replace function public.team_files_has_children(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.team_files c where c.parent_id = p_id);
$$;
revoke all on function public.team_files_has_children(uuid) from public, anon;
grant execute on function public.team_files_has_children(uuid) to authenticated;

drop policy if exists team_files_delete_owner_or_admin on public.team_files;
create policy team_files_delete_owner_or_admin on public.team_files
  for delete to authenticated
  using (
    (select public.is_global_admin())
    or public.is_team_admin(team_id::text)
    or (
      created_by = (select public.get_app_user_id())
      and team_id in (select public.rls_my_team_ids())
      and not public.team_files_has_children(id)
    )
  );

-- 4) RLS Storage (nur Bucket team-files) ----------------------------------------
drop policy if exists team_files_obj_select on storage.objects;
create policy team_files_obj_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'team-files'
    and (
      public.is_team_member((storage.foldername(name))[1])
      or (select public.is_global_admin())
    )
  );

drop policy if exists team_files_obj_insert on storage.objects;
create policy team_files_obj_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'team-files'
    and array_length(storage.foldername(name), 1) = 1
    and (storage.foldername(name))[1] ~ '^[0-9]+$'
    and (
      public.is_team_member((storage.foldername(name))[1])
      or (select public.is_global_admin())
    )
  );

drop policy if exists team_files_obj_delete on storage.objects;
create policy team_files_obj_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'team-files'
    and (
      owner_id = (select auth.uid())::text
      or public.is_team_admin((storage.foldername(name))[1])
      or (select public.is_global_admin())
    )
  );
-- Kein UPDATE-Policy: Dateien werden nie überschrieben (upsert: false).

-- 5) DATEI-01c (Nachtrag nach Experten-Review, 29.09.): Dateinamen brauchen eine
--    erlaubte Endung — auch beim Umbenennen. Der Bucket prüft nur den gemeldeten
--    Content-Type; ohne diese Regel könnte ein präparierter Client z. B.
--    „Zeugnisse.exe" mit angeblichem PDF-Typ ablegen, und der Download speichert
--    unter dem Anzeigenamen. Ordner sind ausgenommen.
alter table public.team_files drop constraint if exists team_files_ext_chk;
alter table public.team_files add constraint team_files_ext_chk check (
  kind = 'folder'
  or lower(name) ~ '\.(jpe?g|png|gif|webp|hei[cf]|pdf|docx?|xlsx?|pptx?|ppsx|od[tsp]|txt|csv|md|rtf|mp3|m4a|wav|mp4|mov)$'
);
