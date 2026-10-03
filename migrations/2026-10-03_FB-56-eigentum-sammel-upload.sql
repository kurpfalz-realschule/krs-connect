-- ============================================================================
-- FB-56 · Eigentum am Sammel-Upload der Team-Dateiablage · 03.10.2026
-- ============================================================================
-- Anlass: Rückmeldung FB-56. Am 29.09.2026 wurden Unterlagen gesammelt von einem
-- Konto mit Rolle `owner` in die Team-Dateiablage geladen: ein Wurzelordner,
-- darin je Lehrkraft ein Ordner. `team_files.created_by` und
-- `storage.objects.owner_id` zeigen seitdem auf dieses Konto. Wer die Unterlagen
-- fachlich verantwortet, konnte sie deshalb weder umbenennen noch löschen
-- (Policies team_files_update_owner_or_admin, team_files_delete_owner_or_admin,
-- team_files_obj_delete — alle unverändert richtig).
--
-- Was diese Migration tut
--   Jeder Personen-Ordner (1. Ebene unter dem Wurzelordner des Sammel-Uploads)
--   geht samt allem darunter an die Person, deren Namen der Ordner trägt:
--     • public.team_files.created_by      → users.id der Person
--     • storage.objects.owner_id / owner  → auth_id der Person (Bucket team-files)
--   Beides zusammen in einer Transaktion. Ohne den zweiten Schritt dürfte die
--   Person die Zeile löschen, das Objekt im Speicher bliebe aber als Waise liegen.
--
-- Zuordnung (bewusst als Regel, nicht als Namensliste — keine Personennamen im Repo)
--   Ordnername = users.nachname (Groß/klein egal, beide Seiten NFC-normalisiert:
--   Uploads vom Mac liefern Umlaute zerlegt als NFD). Bei gleichem Nachnamen
--   heißt der Ordner „Nachname, Vorname"; dann muss display_name mit dem Vornamen
--   beginnen. Die Regel muss je Ordner GENAU EIN aktives Konto treffen, das
--   Mitglied des Teams ist und sich anmelden kann — sonst bricht der Lauf ab und
--   ändert nichts.
--
-- Was unverändert bleibt
--   Rechte-Regeln (RLS), Namen, Ordnerstruktur, Speicher-Pfade, updated_at; der
--   Wurzelordner des Sammel-Uploads; der Ordner des Import-Kontos selbst;
--   alles, was nicht aus dem Sammel-Upload stammt (anderes Konto oder andere Zeit).
--
-- Eigenschaften
--   Idempotent (zweiter Lauf ändert 0 Zeilen), nicht-destruktiv (kein DELETE,
--   kein Verschieben), atomar (ein DO-Block). Rückweg:
--   2026-10-03_FB-56-eigentum-sammel-upload-UNDO.sql
--
-- Reihenfolge: 1) CHECK lesen  2) AKTION  3) NACH-PRÜFUNG lesen.
-- Vor dem Deploy der zugehörigen App-Version ausführen (wirkt sofort, auch mit
-- der bisherigen App-Version).
--
-- AUSGEFÜHRT am 03.10.2026 gegen 18:10 Uhr (Live-Datenbank): 33 Personen-Ordner,
-- 298 Einträge umgestellt (179 Dateien, 119 Ordner), 179 Objekte im Speicher,
-- gesamt 466 → 466. Vorher als Probelauf (c_probe = true) und einmal komplett
-- mit Rückweg in einer zurückgerollten Transaktion geprüft. Ein zweiter Lauf
-- ändert 0 Einträge.
-- ============================================================================


-- 1) CHECK (nur lesen) --------------------------------------------------------
-- Erwartung am 03.10.2026: gesamt 466, dateien_ohne_objekt 0, waisen 0,
-- abweichende_eigentuemer 0.
select
  (select count(*) from public.team_files)                                   as gesamt,
  (select count(*) from public.team_files where kind = 'file')               as dateien,
  (select count(*) from public.team_files where kind = 'folder')             as ordner,
  (select count(*) from public.team_files f
    where f.kind = 'file' and not exists (
      select 1 from storage.objects o
       where o.bucket_id = 'team-files' and o.name = f.storage_path))        as dateien_ohne_objekt,
  (select count(*) from storage.objects o
    where o.bucket_id = 'team-files' and not exists (
      select 1 from public.team_files f where f.storage_path = o.name))      as waisen,
  (select count(*) from storage.objects o
     join public.team_files f on f.storage_path = o.name
     left join public.users u on u.id = f.created_by
    where o.bucket_id = 'team-files'
      and o.owner_id is distinct from u.auth_id::text)                       as abweichende_eigentuemer;


-- 2) AKTION -------------------------------------------------------------------
do $fb56$
declare
  c_team     constant bigint      := 1;   -- Team mit dem Sammel-Upload
  c_import   constant bigint      := 1;   -- users.id des Import-Kontos (Rolle owner)
  c_from     constant timestamptz := '2026-09-29 20:15:00+00';
  c_to       constant timestamptz := '2026-09-29 20:18:00+00';
  c_probe    constant boolean     := false; -- true = Probelauf: alles rechnen, nichts speichern
  v_total_before  bigint;
  v_total_after   bigint;
  v_mismatch_before bigint;
  v_mismatch_after  bigint;
  v_no_object     bigint;
  v_folders       int;
  v_unclear       int;
  v_rows          int;
  v_files         int;
  v_objs          int;
begin
  perform set_config('lock_timeout', '5s', true);

  select count(*) into v_total_before from public.team_files;
  select count(*) into v_mismatch_before
    from storage.objects o
    join public.team_files f on f.storage_path = o.name
    left join public.users u on u.id = f.created_by
   where o.bucket_id = 'team-files' and o.owner_id is distinct from u.auth_id::text;

  -- Personen-Ordner des Sammel-Uploads + Zuordnung nach Regel
  create temp table _fb56_map (top uuid primary key, hits int not null, uid bigint, ok boolean not null) on commit drop;
  insert into _fb56_map (top, hits, uid, ok)
  with root as (
    select f.id from public.team_files f
     where f.team_id = c_team and f.parent_id is null and f.kind = 'folder'
       and f.created_by = c_import
       and f.created_at >= c_from and f.created_at < c_to
  ),
  pf as (
    select f.id, normalize(f.name, NFC) as nm
      from public.team_files f join root r on f.parent_id = r.id
     where f.kind = 'folder' and f.created_at >= c_from and f.created_at < c_to
  ),
  cand as (
    select pf.id as top, u.id as uid,
           (u.auth_id is not null and u.status = 'active'
            and exists (select 1 from public.team_members tm
                         where tm.team_id = c_team and tm.user_id = u.id)) as ok
      from pf join public.users u
        on lower(normalize(u.nachname, NFC)) = lower(btrim(split_part(pf.nm, ',', 1)))
       and (position(',' in pf.nm) = 0
            or lower(normalize(u.display_name, NFC))
               like lower(btrim(split_part(pf.nm, ',', 2))) || ' %')
  )
  select pf.id, count(c.uid)::int, min(c.uid), coalesce(bool_and(c.ok), false)
    from pf left join cand c on c.top = pf.id
   group by pf.id;

  -- Noch umzustellende Einträge: im Unterbaum, vom Import-Konto, aus dem Sammel-Upload
  create temp table _fb56_plan (id uuid primary key, top uuid not null, kind text not null, storage_path text) on commit drop;
  insert into _fb56_plan (id, top, kind, storage_path)
  with recursive tree as (
    select m.top, f.id, f.kind, f.storage_path, f.created_by, f.created_at
      from _fb56_map m join public.team_files f on f.id = m.top
    union all
    select t.top, f.id, f.kind, f.storage_path, f.created_by, f.created_at
      from public.team_files f join tree t on f.parent_id = t.id
  )
  select t.id, t.top, t.kind, t.storage_path
    from tree t
   where t.created_by = c_import and t.created_at >= c_from and t.created_at < c_to;

  select count(*) into v_folders from _fb56_map;

  -- Abbruch, wenn für einen Ordner mit offenen Einträgen die Zuordnung nicht eindeutig ist
  select count(*) into v_unclear
    from _fb56_map m
   where (m.hits <> 1 or not m.ok)
     and exists (select 1 from _fb56_plan p where p.top = m.top);
  if v_unclear > 0 then
    raise exception 'FB-56: % Personen-Ordner ohne eindeutiges, aktives Konto im Team — nichts geändert.', v_unclear;
  end if;

  -- a) Tabelle. Trigger aus, damit updated_at (= „umbenannt am") unberührt bleibt.
  alter table public.team_files disable trigger team_files_before_write;
  update public.team_files f
     set created_by = m.uid
    from _fb56_plan p join _fb56_map m on m.top = p.top
   where f.id = p.id and m.uid <> c_import and f.created_by = c_import;
  get diagnostics v_rows = row_count;
  alter table public.team_files enable trigger team_files_before_write;

  select count(*) into v_files
    from _fb56_plan p join _fb56_map m on m.top = p.top
   where p.kind = 'file' and m.uid <> c_import;

  -- b) Speicher: Eigentümer der Objekte passend zur Person
  update storage.objects o
     set owner_id = u.auth_id::text, owner = u.auth_id
    from _fb56_plan p
    join _fb56_map m on m.top = p.top
    join public.users u on u.id = m.uid
   where p.kind = 'file' and m.uid <> c_import
     and o.bucket_id = 'team-files' and o.name = p.storage_path;
  get diagnostics v_objs = row_count;

  -- Selbstprüfung: stimmt etwas nicht, wird alles zurückgerollt
  select count(*) into v_total_after from public.team_files;
  select count(*) into v_mismatch_after
    from storage.objects o
    join public.team_files f on f.storage_path = o.name
    left join public.users u on u.id = f.created_by
   where o.bucket_id = 'team-files' and o.owner_id is distinct from u.auth_id::text;
  select count(*) into v_no_object
    from public.team_files f
   where f.kind = 'file' and not exists (
     select 1 from storage.objects o where o.bucket_id = 'team-files' and o.name = f.storage_path);

  if v_total_after <> v_total_before then
    raise exception 'FB-56: Anzahl der Einträge hat sich geändert (% → %) — zurückgerollt.', v_total_before, v_total_after;
  end if;
  if v_objs <> v_files then
    raise exception 'FB-56: % Dateien umgestellt, aber % Objekte im Speicher — zurückgerollt.', v_files, v_objs;
  end if;
  if v_mismatch_after > v_mismatch_before then
    raise exception 'FB-56: Eigentümer in Tabelle und Speicher weichen ab (% → %) — zurückgerollt.', v_mismatch_before, v_mismatch_after;
  end if;
  if v_no_object > 0 then
    raise exception 'FB-56: % Dateien ohne Objekt im Speicher — zurückgerollt.', v_no_object;
  end if;

  if c_probe then
    raise exception 'FB-56 PROBELAUF, nichts gespeichert: % Personen-Ordner, % Einträge (davon % Dateien), % Objekte, gesamt % → %.',
      v_folders, v_rows, v_files, v_objs, v_total_before, v_total_after;
  end if;
  raise notice 'FB-56: % Personen-Ordner, % Einträge umgestellt (davon % Dateien), % Objekte, gesamt % → %.',
    v_folders, v_rows, v_files, v_objs, v_total_before, v_total_after;
end
$fb56$;


-- 3) NACH-PRÜFUNG (nur lesen) ---------------------------------------------------
-- Erwartung: gesamt wie im CHECK, noch_beim_import = nur Wurzelordner + eigener
-- Ordner des Import-Kontos (am 03.10.2026: 5), abweichende_eigentuemer 0,
-- dateien_ohne_objekt 0.
select
  (select count(*) from public.team_files)                                   as gesamt,
  (select count(*) from public.team_files
    where team_id = 1 and created_by = 1
      and created_at >= '2026-09-29 20:15:00+00'
      and created_at <  '2026-09-29 20:18:00+00')                            as noch_beim_import,
  (select count(*) from storage.objects o
     join public.team_files f on f.storage_path = o.name
     left join public.users u on u.id = f.created_by
    where o.bucket_id = 'team-files'
      and o.owner_id is distinct from u.auth_id::text)                       as abweichende_eigentuemer,
  (select count(*) from public.team_files f
    where f.kind = 'file' and not exists (
      select 1 from storage.objects o
       where o.bucket_id = 'team-files' and o.name = f.storage_path))        as dateien_ohne_objekt;
