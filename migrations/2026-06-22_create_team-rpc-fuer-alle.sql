-- =====================================================================
-- KRS Connect — Team-Anlegen für ALLE angemeldeten Nutzer (Sprint #9c)
-- Projekt: ooejsfixxiuobrpqgfqm · 2026-06-22
-- (Bereits per Supabase-MCP als Migration "create_team_rpc_all_users" angewandt.)
--
-- WARUM RPC statt Policy-Lockerung:
--   Beim Anlegen muss der Ersteller sich selbst als ERSTES (Admin-)Mitglied
--   eintragen. Würde man dafür team_members-Self-Insert per Policy erlauben,
--   könnte sich jede:r heimlich in JEDES bestehende Team eintragen (Privatsphäre-
--   Lücke); eine "nur wenn Team leer"-Bedingung würde team_members in einer
--   team_members-Policy abfragen → Rekursion. Eine SECURITY-DEFINER-Funktion
--   legt alles atomar an und umgeht RLS sauber, ohne etwas zu öffnen.
--
-- Frontend ruft: this.sb.rpc('create_team', { p_name, p_description, p_icon_text, p_icon_color })
-- =====================================================================

create or replace function public.create_team(
  p_name text,
  p_description text default null,
  p_icon_text text default null,
  p_icon_color text default null
) returns public.teams
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid bigint;
  v_team public.teams;
begin
  v_uid := public.get_app_user_id();
  if v_uid is null then
    raise exception 'Nicht angemeldet (kein App-User).';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Team-Name fehlt.';
  end if;

  insert into public.teams (name, description, icon_text, icon_color, category)
  values (btrim(p_name), nullif(btrim(coalesce(p_description,'')),''),
          p_icon_text, p_icon_color, 'Teams')
  returning * into v_team;

  insert into public.team_members (team_id, user_id, role)
  values (v_team.id, v_uid, 'admin');

  insert into public.channels (team_id, name, is_default)
  values (v_team.id, 'Allgemein', true);

  return v_team;
end;
$$;

grant execute on function public.create_team(text,text,text,text) to authenticated;

-- VERIFY
-- select proname, prosecdef from pg_proc where proname='create_team';
