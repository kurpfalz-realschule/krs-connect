-- S-2 H-7b (25.09.2026, Wunsch Norbert): Lehrkraefte duerfen ihren Anzeigenamen SELBST auf den Rufnamen kuerzen.
-- Erlaubt ohne Admin: nur Namensteile weglassen (Reihenfolge bleibt, keine neuen Woerter), letzter Teil (Nachname) bleibt,
-- mind. 2 Teile, und kein anderes Konto heisst danach genauso (kein Vortaeuschen fremder Identitaet).
-- Alles andere (neuer Name, Nachname, anzeigename) weiterhin nur Admin.
create or replace function public.krs_name_change_ok(p_user_id bigint, p_old text, p_new text)
returns boolean language plpgsql stable security definer set search_path = '' as $f$
declare o text[]; n text[]; t text; j int := 1; lo int; ln int;
begin
  if p_new is null or btrim(p_new) = '' or p_old is null then return false; end if;
  if p_new ~ '[<>&"]' or length(p_new) > 120 then return false; end if;
  o := regexp_split_to_array(btrim(p_old), '[[:space:]-]+');
  n := regexp_split_to_array(btrim(p_new), '[[:space:]-]+');
  lo := coalesce(array_length(o, 1), 0); ln := coalesce(array_length(n, 1), 0);
  if ln < 2 or ln > lo then return false; end if;
  if n[ln] <> o[lo] then return false; end if;
  foreach t in array n loop
    while j <= lo and o[j] <> t loop j := j + 1; end loop;
    if j > lo then return false; end if;
    j := j + 1;
  end loop;
  if exists (select 1 from public.users u where u.id <> p_user_id and lower(btrim(u.display_name)) = lower(btrim(p_new))) then
    return false;
  end if;
  return true;
end $f$;
revoke execute on function public.krs_name_change_ok(bigint, text, text) from public, anon;
grant execute on function public.krs_name_change_ok(bigint, text, text) to authenticated, service_role;

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
  -- H-7b (25.09.2026): Ausnahme — display_name selbst auf den Rufnamen kuerzen (krs_name_change_ok).
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
    or (new.display_name is distinct from old.display_name
        and not public.krs_name_change_ok(old.id, old.display_name, new.display_name))
    or new.nachname is distinct from old.nachname
    or new.anzeigename is distinct from old.anzeigename
  ) then
    raise exception 'Offizielle Kontodaten koennen nur zentral durch die Administration geaendert werden.'
      using errcode = '42501';
  end if;

  return new;
end
$function$;
