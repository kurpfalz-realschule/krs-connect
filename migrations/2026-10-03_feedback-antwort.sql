-- =====================================================================
-- KRS Connect — Antwort im Feedback-Board (v4.53.0)
-- Angewendet am 03.10.2026 (Migrationen feedback_antwort und
-- feedback_antwort_rollen_positivliste). STATUS: EINGESPIELT ✅
--
-- Wozu: Unter einer Rückmeldung soll eine kurze Antwort stehen können
-- (was geändert wurde, wie es geht). Lesen dürfen alle, die das Board
-- sehen. Schreiben dürfen nur globale Admins (users.role admin/owner) und
-- der Feedback-Automat (läuft als Datenbank-Rolle, nicht über die App).
--
-- Was sich NICHT ändert: die vier Regeln der Tabelle (lesen alle App-Nutzer,
-- einreichen nur mit eigener user_id, ändern und löschen nur globale Admins).
-- Die Antwort ist eine Spalte derselben Zeile und erbt genau diese Regeln.
--
-- Die eine Lücke, die eine Spalte allein offen ließe: Wer einreicht, legt
-- die Zeile selbst an und könnte dabei eine „Antwort“ gleich mitschicken.
-- Der Trigger unten leert die Antwort deshalb bei jedem Einreichen, außer
-- für die drei Datenbank-Rollen postgres, supabase_admin und service_role
-- (Positivliste: jede unbekannte Rolle gilt als App). Den Zeitpunkt der
-- Antwort setzt der Server, nicht das Gerät.
--
-- Additiv und ohne Datenänderung: zwei neue Spalten (leer), eine Prüfung,
-- ein Trigger. Der bisherige App-Stand (4.52.3) läuft unverändert weiter.
-- =====================================================================

-- ── CHECK (vorher) ───────────────────────────────────────────────────
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='feedback'
--    and column_name in ('admin_reply','admin_reply_at');
--  → 0 Zeilen = noch nicht eingespielt.

-- ── AKTION ───────────────────────────────────────────────────────────
alter table public.feedback
  add column if not exists admin_reply    text,
  add column if not exists admin_reply_at timestamptz;

comment on column public.feedback.admin_reply is
  'Antwort des Admin-Teams auf die Rückmeldung (Klartext, max. 2000 Zeichen). Lesbar für alle App-Nutzer, schreibbar nur für globale Admins. v4.53.0';
comment on column public.feedback.admin_reply_at is
  'Zeitpunkt der letzten Änderung der Antwort. Setzt der Trigger feedback_reply_guard (Serverzeit). v4.53.0';

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.feedback'::regclass
                    and conname  = 'feedback_admin_reply_len') then
    alter table public.feedback
      add constraint feedback_admin_reply_len
      check (admin_reply is null or char_length(admin_reply) <= 2000);
  end if;
end $$;

create or replace function public.feedback_reply_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Leere Antwort heißt: keine Antwort.
  new.admin_reply := nullif(btrim(new.admin_reply), '');

  if tg_op = 'INSERT' then
    if current_user not in ('postgres', 'supabase_admin', 'service_role') then
      -- Einreichen über die App (Rollen authenticated/anon) und über jede
      -- andere, hier nicht genannte Rolle: nie mit Antwort. Antworten
      -- entstehen nur per UPDATE, und das lässt die Regel
      -- feedback_update_globaladmin ausschließlich globalen Admins zu.
      new.admin_reply    := null;
      new.admin_reply_at := null;
    elsif new.admin_reply is null then
      new.admin_reply_at := null;
    else
      -- Datenbank-Rollen (Rücksicherung, Wartung): mitgegebene Zeit behalten.
      new.admin_reply_at := coalesce(new.admin_reply_at, now());
    end if;
  elsif new.admin_reply is distinct from old.admin_reply then
    new.admin_reply_at := case when new.admin_reply is null then null else now() end;
  else
    -- Antwort unverändert: Zeitpunkt lässt sich nicht von außen umstellen.
    new.admin_reply_at := old.admin_reply_at;
  end if;

  return new;
end $$;

comment on function public.feedback_reply_guard() is
  'Feedback-Antwort: leert sie beim Einreichen über die App, setzt admin_reply_at serverseitig. v4.53.0';

-- Trigger-Funktionen ruft niemand direkt auf.
revoke all on function public.feedback_reply_guard() from public, anon, authenticated;

create or replace trigger feedback_reply_guard
  before insert or update on public.feedback
  for each row execute function public.feedback_reply_guard();

-- ── GEGENPROBE (nachher) ─────────────────────────────────────────────
-- select column_name, data_type, is_nullable from information_schema.columns
--  where table_schema='public' and table_name='feedback'
--    and column_name in ('admin_reply','admin_reply_at');
--  → admin_reply | text | YES ; admin_reply_at | timestamp with time zone | YES
-- select tgname from pg_trigger
--  where tgrelid='public.feedback'::regclass and not tgisinternal;
--  → feedback_reply_guard
-- select count(*) from public.feedback;   → wie vorher
--
-- Rechte-Probe: siehe HANDOVER.md, Abschnitt zu 4.53.0 (Mitglied reicht mit
-- Antwort ein → Antwort leer; Mitglied ändert Antwort → 0 Zeilen; Admin
-- setzt, ändert, entfernt → je 1 Zeile; 2001 Zeichen → abgelehnt).

-- ── UNDO ─────────────────────────────────────────────────────────────
-- Siehe 2026-10-03_feedback-antwort-UNDO.sql (löscht alle Antworten).
