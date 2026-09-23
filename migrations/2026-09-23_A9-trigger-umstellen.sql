-- =====================================================================
-- Paket A9 Teil 2 — Trigger auf public.krs_notify_hook() umstellen
-- (Secret steht danach NICHT mehr in pg_trigger). Altes Secret gilt als
-- kompromittiert; Edge Functions akzeptieren nach Teil 2 nur noch das Vault-Secret.
-- UNDO: Trigger mit supabase_functions.http_request(...) neu anlegen — erfordert
--       ein neues Env-Secret HOOK_SECRET (Norbert per CLI), NICHT das alte.
-- =====================================================================
drop trigger if exists notify_email_on_post on public.posts;
drop trigger if exists notify_push_on_post on public.posts;
drop trigger if exists notify_push_on_message on public.messages;

create trigger notify_email_on_post after insert on public.posts
  for each row execute function public.krs_notify_hook('https://ooejsfixxiuobrpqgfqm.supabase.co/functions/v1/notify-email');
create trigger notify_push_on_post after insert on public.posts
  for each row execute function public.krs_notify_hook('https://ooejsfixxiuobrpqgfqm.supabase.co/functions/v1/notify-push');
create trigger notify_push_on_message after insert on public.messages
  for each row execute function public.krs_notify_hook('https://ooejsfixxiuobrpqgfqm.supabase.co/functions/v1/notify-push');
