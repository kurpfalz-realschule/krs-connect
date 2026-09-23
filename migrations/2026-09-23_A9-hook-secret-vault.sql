-- =====================================================================
-- Paket A9 (23.09.2026) — Webhook-Secret aus dem Vault statt Klartext im Trigger
-- Teil 1: Secret im Vault erzeugen (nie außerhalb der DB sichtbar),
--         RPC nur für service_role, neue Trigger-Funktion.
-- Teil 2 (eigene Migration, nach Edge-Deploy): Trigger umstellen.
-- UNDO Teil 1: drop function public.krs_notify_hook(); drop function public.krs_hook_secret();
--              delete from vault.secrets where name = 'krs_hook_secret';
-- =====================================================================
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'krs_hook_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'krs_hook_secret',
      'Webhook notify-push/notify-email (Paket A9, 23.09.2026)');
  end if;
end $$;

create or replace function public.krs_hook_secret()
returns text language sql stable security definer set search_path = ''
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'krs_hook_secret' $$;
revoke all on function public.krs_hook_secret() from public, anon, authenticated;
grant execute on function public.krs_hook_secret() to service_role;

create or replace function public.krs_notify_hook()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'krs_hook_secret';
  if v_secret is null or tg_nargs < 1 then
    return new;
  end if;
  perform net.http_post(
    url := tg_argv[0],
    body := jsonb_build_object('type', tg_op, 'table', tg_table_name, 'schema', tg_table_schema,
                               'record', to_jsonb(new), 'old_record', null),
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-krs-hook-secret', v_secret),
    timeout_milliseconds := 5000);
  return new;
exception when others then
  -- Benachrichtigung darf niemals einen Beitrag/eine Nachricht verhindern.
  raise warning 'krs_notify_hook: %', sqlerrm;
  return new;
end $$;
revoke all on function public.krs_notify_hook() from public, anon, authenticated;
