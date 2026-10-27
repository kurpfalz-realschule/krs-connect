-- =====================================================================
-- U1 (27.10.2026) — Hooks der Probe auf die interne Test-Senke
--
-- Gilt nur für den Stack krs. Die Cloud bleibt unangetastet.
-- Die Senke prüft das Vault-Secret und versendet weder Mail noch Push.
-- H4 zeigt die Trigger wieder auf notify-email bzw. notify-push,
-- weiterhin über http://api-gw:8000 (Dienstname aus docker-compose.yml).
--
-- UNDO: die drei CREATE-TRIGGER-Zeilen aus
--       2026-09-23_A9-trigger-umstellen.sql (Cloud-URL).
--
-- Gegen die Cloud nie ausführen. psql bricht ohne Variable ab:
--   psql -v krs_stack=1 -f diese-datei.sql
-- =====================================================================

\if :{?krs_stack}
\else
\warn STOPP: U1 nur mit psql -v krs_stack=1 auf dem Stack krs. Nichts geändert.
\quit
\endif

create or replace trigger notify_email_on_post
  after insert on public.posts
  for each row execute function public.krs_notify_hook('http://api-gw:8000/functions/v1/notify-sink');

create or replace trigger notify_push_on_post
  after insert on public.posts
  for each row execute function public.krs_notify_hook('http://api-gw:8000/functions/v1/notify-sink');

create or replace trigger notify_push_on_message
  after insert on public.messages
  for each row execute function public.krs_notify_hook('http://api-gw:8000/functions/v1/notify-sink');
