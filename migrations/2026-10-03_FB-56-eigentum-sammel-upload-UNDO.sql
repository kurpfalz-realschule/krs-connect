-- ============================================================================
-- FB-56 · UNDO zu 2026-10-03_FB-56-eigentum-sammel-upload.sql
-- ============================================================================
-- Setzt das Eigentum am Sammel-Upload vom 29.09.2026 zurück auf das Import-Konto:
--   • public.team_files.created_by      → users.id des Import-Kontos
--   • storage.objects.owner_id / owner  → auth_id des Import-Kontos
-- Betroffen ist genau der Unterbaum des Wurzelordners, und darin nur Einträge
-- aus dem Zeitfenster des Sammel-Uploads. Damals stammten dort alle Einträge
-- vom Import-Konto; der Rückweg braucht deshalb keine Sicherungstabelle und
-- keine Namensliste.
--
-- Unberührt: alles, was Lehrkräfte seither selbst hochgeladen haben (anderes
-- created_at), Namen, Struktur, updated_at, RLS. Was inzwischen gelöscht wurde,
-- bringt dieses Skript nicht zurück.
-- Idempotent, nicht-destruktiv, atomar.
-- ============================================================================
do $fb56_undo$
declare
  c_team     constant bigint      := 1;
  c_import   constant bigint      := 1;
  c_from     constant timestamptz := '2026-09-29 20:15:00+00';
  c_to       constant timestamptz := '2026-09-29 20:18:00+00';
  v_auth     uuid;
  v_before   bigint;
  v_after    bigint;
  v_rows     int;
  v_objs     int;
begin
  perform set_config('lock_timeout', '5s', true);
  select auth_id into v_auth from public.users where id = c_import;
  if v_auth is null then
    raise exception 'FB-56 UNDO: Import-Konto ohne auth_id — nichts geändert.';
  end if;
  select count(*) into v_before from public.team_files;

  create temp table _fb56_undo (id uuid primary key, kind text not null, storage_path text) on commit drop;
  insert into _fb56_undo (id, kind, storage_path)
  with recursive tree as (
    select f.id, f.kind, f.storage_path, f.created_at
      from public.team_files f
     where f.team_id = c_team and f.parent_id is null and f.kind = 'folder'
       and f.created_by = c_import
       and f.created_at >= c_from and f.created_at < c_to
    union all
    select f.id, f.kind, f.storage_path, f.created_at
      from public.team_files f join tree t on f.parent_id = t.id
  )
  select t.id, t.kind, t.storage_path from tree t
   where t.created_at >= c_from and t.created_at < c_to;

  alter table public.team_files disable trigger team_files_before_write;
  update public.team_files f
     set created_by = c_import
    from _fb56_undo x
   where f.id = x.id and f.created_by is distinct from c_import;
  get diagnostics v_rows = row_count;
  alter table public.team_files enable trigger team_files_before_write;

  update storage.objects o
     set owner_id = v_auth::text, owner = v_auth
    from _fb56_undo x
   where x.kind = 'file' and o.bucket_id = 'team-files' and o.name = x.storage_path
     and o.owner_id is distinct from v_auth::text;
  get diagnostics v_objs = row_count;

  select count(*) into v_after from public.team_files;
  if v_after <> v_before then
    raise exception 'FB-56 UNDO: Anzahl der Einträge hat sich geändert (% → %) — zurückgerollt.', v_before, v_after;
  end if;
  raise notice 'FB-56 UNDO: % Einträge und % Objekte zurück beim Import-Konto.', v_rows, v_objs;
end
$fb56_undo$;
