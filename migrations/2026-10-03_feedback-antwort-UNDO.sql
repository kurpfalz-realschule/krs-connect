-- =====================================================================
-- KRS Connect — UNDO zu 2026-10-03_feedback-antwort.sql
-- NICHT eingespielt. Nur ausführen, wenn die Antwort-Funktion wieder weg soll.
--
-- Achtung: Die Spalte admin_reply enthält die geschriebenen Antworten.
-- Mit dem Entfernen der Spalte sind sie gelöscht. Wer sie behalten will,
-- sichert sie vorher:
--   select id, admin_reply, admin_reply_at from public.feedback
--    where admin_reply is not null order by id;
--
-- Reihenfolge App/Datenbank: Connect ab 4.53.0 schreibt beim Speichern
-- einer Antwort in admin_reply. Ohne die Spalte meldet die App dann
-- „Antwort konnte nicht gespeichert werden“. Lesen und Status ändern
-- funktionieren weiter.
-- =====================================================================

-- Alles oder nichts: Bricht ein Schritt ab, bleibt der Trigger stehen. Ohne
-- ihn, aber mit Spalte, könnte jede Lehrkraft beim Einreichen eine Antwort
-- mitschicken.
begin;

drop trigger if exists feedback_reply_guard on public.feedback;
drop function if exists public.feedback_reply_guard();

alter table public.feedback drop constraint if exists feedback_admin_reply_len;

alter table public.feedback
  drop column if exists admin_reply_at,
  drop column if exists admin_reply;

commit;

-- Gesicherte Antworten später wieder einspielen (nach erneuter Migration):
-- Der Trigger setzt bei jeder Änderung der Antwort die Zeit auf „jetzt“. Wer
-- die alten Zeiten behalten will, schaltet ihn für den Import kurz ab:
--   alter table public.feedback disable trigger feedback_reply_guard;
--   update public.feedback set admin_reply = …, admin_reply_at = … where id = …;
--   alter table public.feedback enable trigger feedback_reply_guard;

-- GEGENPROBE:
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='feedback'
--    and column_name in ('admin_reply','admin_reply_at');   → 0 Zeilen
-- select count(*) from public.feedback;                     → wie vorher
