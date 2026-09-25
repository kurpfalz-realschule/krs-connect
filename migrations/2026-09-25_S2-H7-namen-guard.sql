-- S-2 H-7 (Audit 24.09.2026) — IN PROD 25.09.2026 (Migration sec_s2_h7_guard_names)
-- Vorher: Lehrkraft konnte eigenen display_name/nachname/anzeigename frei setzen (Identitaet vortaeuschen).
-- Trockenlauf + Nachtest als Lehrkraft: 3x 42501; avatar_color/avatar_url/last_seen ok; Admin darf Namen aendern.
-- Client: updateProfile-Whitelist enthaelt display_name, aber kein Aufruf aendert Namen (nur avatar_url).
-- UNDO: die drei Zeilen display_name/nachname/anzeigename aus der Liste entfernen.
CREATE OR REPLACE FUNCTION public.guard_user_role_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if new.kuerzel is distinct from old.kuerzel
     and (new.kuerzel in ('Ko', 'Ktz') or old.kuerzel in ('Ko', 'Ktz'))
     and not public.is_platform_owner() then
    raise exception 'Dieses Kuerzel kann nur die Inhaberin/der Inhaber vergeben.'
      using errcode = '42501';
  end if;

  -- H-7 (Audit 24.09.2026): Namen gehoeren zu den offiziellen Kontodaten (Identitaet/Impersonation).
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
    or new.display_name is distinct from old.display_name
    or new.nachname is distinct from old.nachname
    or new.anzeigename is distinct from old.anzeigename
  ) then
    raise exception 'Offizielle Kontodaten koennen nur zentral durch die Administration geaendert werden.'
      using errcode = '42501';
  end if;

  return new;
end
$function$;
