-- =====================================================================
-- KRS — Tabelle push_tokens (Gerätetoken für native iOS-Benachrichtigungen)
--
-- Zweck: Die iOS-App (krs-ios) bekommt von Apple einen APNs-Gerätetoken.
--        Der Hub schickt ihn hierher; die Edge Function `notify-push`
--        liest ihn mit service_role und verschickt die Benachrichtigung.
--
-- Nicht-destruktiv: legt nur eine neue Tabelle an, ändert nichts Bestehendes.
-- Reihenfolge: CHECK → ACTION → UNDO (siehe Projektregel).
--
-- Datenschutz: Ein APNs-Token identifiziert ein Gerät einer namentlich
--   bekannten Lehrkraft. Er gehört damit zu den personenbezogenen Daten und
--   wird genauso abgeriegelt wie alles andere: kein anon-Zugriff, jede Person
--   sieht ausschließlich die eigenen Zeilen.
-- =====================================================================


-- ─────────────────────────────────────────────────────────────────────
-- CHECK — vor dem Ausführen laufen lassen, Ergebnis notieren
-- ─────────────────────────────────────────────────────────────────────
-- select 'push_tokens existiert schon?' as frage,
--        count(*) as antwort
--   from information_schema.tables
--  where table_schema = 'public' and table_name = 'push_tokens';
-- Erwartet vor dem ersten Lauf: 0


-- ─────────────────────────────────────────────────────────────────────
-- ACTION
-- ─────────────────────────────────────────────────────────────────────
begin;

create table if not exists public.push_tokens (
  id              bigint generated always as identity primary key,
  user_id         bigint      not null references public.users(id) on delete cascade,
  token           text        not null,
  platform        text        not null default 'ios'
                              check (platform in ('ios', 'android')),
  -- APNs hat getrennte Umgebungen. Ein Sandbox-Token (Xcode-Build vom Gerät)
  -- funktioniert NICHT auf dem Produktiv-Gateway und umgekehrt — daher mitführen,
  -- sonst sucht man den Fehler später im Code statt in der Umgebung.
  environment     text        not null default 'production'
                              check (environment in ('production', 'sandbox')),
  device_label    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_success_at timestamptz,
  -- Apple meldet abgelaufene Token mit 410. Solche Zeilen werden stillgelegt
  -- statt gelöscht, damit man im Zweifel nachvollziehen kann, warum jemand
  -- keine Benachrichtigungen mehr bekommt.
  disabled_at     timestamptz,
  disabled_reason text,

  -- Ein Gerätetoken ist geräteweit eindeutig. Meldet sich auf demselben iPad
  -- eine andere Lehrkraft an, wandert die Zeile per upsert zur neuen Person —
  -- sonst bekäme die vorherige weiterhin deren Benachrichtigungen.
  constraint push_tokens_token_key unique (token)
);

comment on table public.push_tokens is
  'APNs-Gerätetoken für die native iOS-App. Personenbezogen — kein anon-Zugriff, nur eigene Zeilen.';

create index if not exists push_tokens_user_idx
  on public.push_tokens (user_id);

-- Für den Versand zählt nur, was aktiv ist.
create index if not exists push_tokens_aktiv_idx
  on public.push_tokens (user_id)
  where disabled_at is null;

drop trigger if exists push_tokens_touch on public.push_tokens;
create trigger push_tokens_touch
  before update on public.push_tokens
  for each row execute function public.touch_updated_at();

-- ── Zugriff ──────────────────────────────────────────────────────────
alter table public.push_tokens enable row level security;

-- anon hat hier nichts verloren (nimmt die Tabelle auch aus dem GraphQL-Schema).
revoke all on public.push_tokens from anon;
grant select, insert, update, delete on public.push_tokens to authenticated;

-- Bewusst VIER getrennte Policies statt einer for-all-Policy: bei
-- überlagernden PERMISSIVE-Policies gewinnt in Postgres immer die weiteste.
-- Genau daran hing im September das teamübergreifende Leseleck.
drop policy if exists push_tokens_select_own on public.push_tokens;
create policy push_tokens_select_own on public.push_tokens
  for select to authenticated
  using (user_id = public.get_app_user_id());

drop policy if exists push_tokens_insert_own on public.push_tokens;
create policy push_tokens_insert_own on public.push_tokens
  for insert to authenticated
  with check (user_id = public.get_app_user_id());

drop policy if exists push_tokens_update_own on public.push_tokens;
create policy push_tokens_update_own on public.push_tokens
  for update to authenticated
  using (user_id = public.get_app_user_id())
  with check (user_id = public.get_app_user_id());

drop policy if exists push_tokens_delete_own on public.push_tokens;
create policy push_tokens_delete_own on public.push_tokens
  for delete to authenticated
  using (user_id = public.get_app_user_id());

commit;


-- ─────────────────────────────────────────────────────────────────────
-- GEGENPROBE — nach dem Ausführen
-- ─────────────────────────────────────────────────────────────────────
-- select tablename, rowsecurity from pg_tables
--  where schemaname='public' and tablename='push_tokens';          -- rowsecurity = true
--
-- select policyname, cmd from pg_policies
--  where schemaname='public' and tablename='push_tokens'
--  order by policyname;                                            -- 4 Policies
--
-- select has_table_privilege('anon','public.push_tokens','select'); -- false


-- ─────────────────────────────────────────────────────────────────────
-- UNDO — vollständig, falls etwas schiefgeht
-- ─────────────────────────────────────────────────────────────────────
-- begin;
--   drop table if exists public.push_tokens cascade;
-- commit;
