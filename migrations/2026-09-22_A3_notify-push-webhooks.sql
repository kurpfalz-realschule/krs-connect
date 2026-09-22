-- A3 iOS/TestFlight: Database-Webhooks fuer native Push-Benachrichtigungen
-- Erstellt: 22.09.2026
--
-- Sicherheitsprinzip:
-- Der bestehende E-Mail-Webhook enthaelt bereits den produktiven
-- x-krs-hook-secret-Header. Dieses Skript uebernimmt das Header-JSON
-- ausschliesslich innerhalb von Postgres. Der Secret-Wert wird weder
-- ausgegeben noch lokal gespeichert.

-- CHECK
select
  t.tgname,
  c.relname as table_name,
  p.proname as function_name,
  t.tgnargs
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal
  and t.tgname = 'notify_email_on_post';

-- ACTION
do $migration$
declare
  v_args text[];
  v_headers jsonb;
  v_url constant text :=
    'https://ooejsfixxiuobrpqgfqm.supabase.co/functions/v1/notify-push';
begin
  select string_to_array(encode(t.tgargs, 'escape'), E'\\000')
    into v_args
  from pg_catalog.pg_trigger t
  where t.tgname = 'notify_email_on_post'
    and t.tgrelid = 'public.posts'::regclass
    and not t.tgisinternal;

  if v_args is null then
    raise exception 'Bestehender Webhook notify_email_on_post nicht gefunden';
  end if;

  v_headers := v_args[3]::jsonb;

  if not (v_headers ? 'x-krs-hook-secret')
     or coalesce(length(v_headers ->> 'x-krs-hook-secret'), 0) = 0 then
    raise exception 'x-krs-hook-secret fehlt im bestehenden Webhook-Header';
  end if;

  drop trigger if exists notify_push_on_post on public.posts;
  execute format(
    'create trigger notify_push_on_post after insert on public.posts '
    'for each row execute function supabase_functions.http_request(%L, %L, %L, %L, %L)',
    v_url,
    'POST',
    v_headers::text,
    '{}'::text,
    '5000'
  );

  drop trigger if exists notify_push_on_message on public.messages;
  execute format(
    'create trigger notify_push_on_message after insert on public.messages '
    'for each row execute function supabase_functions.http_request(%L, %L, %L, %L, %L)',
    v_url,
    'POST',
    v_headers::text,
    '{}'::text,
    '5000'
  );
end
$migration$;

-- UNDO (nur bei bewusstem Rueckbau ausfuehren)
-- drop trigger if exists notify_push_on_post on public.posts;
-- drop trigger if exists notify_push_on_message on public.messages;

-- VERIFY (zeigt bewusst keine URL oder Header-Inhalte)
select
  c.relname as table_name,
  t.tgname as trigger_name,
  case
    when (t.tgtype & 4) <> 0 then 'INSERT'
    else 'OTHER'
  end as event,
  case
    when (t.tgtype & 2) <> 0 then 'BEFORE'
    else 'AFTER'
  end as timing,
  p.proname as function_name,
  t.tgnargs
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal
  and t.tgname in ('notify_push_on_post', 'notify_push_on_message')
order by c.relname, t.tgname;
