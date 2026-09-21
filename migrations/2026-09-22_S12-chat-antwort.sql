-- =====================================================================
-- KRS Connect — S12: Im Chat direkt auf eine Nachricht antworten (R15, Norbert)
--
-- Zweck: In "Beiträgen" gibt es Antworten (posts.parent_id) bereits, im
--        Chat (messages) nicht. In lebhaften Gruppenchats weiß niemand mehr,
--        worauf sich eine Antwort bezieht.
--
-- Vorprüfung (21.09.2026, vor dem Schreiben dieser Migration durchgeführt):
--   - `messages`-Policies sind zeilenbezogen (sender_id, conversation_id),
--     keine spaltenbezogene Einschränkung — eine zusätzliche Spalte braucht
--     keine Policy-Änderung (fällt NICHT unter Abschnitt 12).
--   - `messages.content` ist NOT NULL, `is_deleted boolean default false`
--     existiert bereits als Spalte, wird aber vom Frontend bisher NIRGENDS
--     gelesen oder geschrieben (deleteMessage() macht bisher ein hartes
--     DELETE). Diese Migration allein ändert daran nichts — das Softdelete-
--     Verhalten wird im Frontend (dataService.deleteMessage) ergänzt, siehe
--     HANDOVER.md. Grund: ON DELETE SET NULL (s.u.) würde bei einem harten
--     DELETE der Originalnachricht das reply_to_id JEDER Antwort auf NULL
--     setzen — dann liesse sich "Nachricht gelöscht" im Zitatbalken nicht
--     mehr von "war nie eine Antwort" unterscheiden.
--
-- Nicht-destruktiv: fügt nur eine nullable Spalte + Index hinzu, ändert
-- keine bestehenden Policies. Reihenfolge: CHECK → ACTION → GEGENPROBE → UNDO.
-- =====================================================================


-- ─────────────────────────────────────────────────────────────────────
-- CHECK — vor dem Ausführen laufen lassen, Ergebnis notieren
-- ─────────────────────────────────────────────────────────────────────
-- select policyname, cmd, qual, with_check from pg_policies
--  where schemaname='public' and tablename='messages';
-- Erwartet: alle Policies pruefen sender_id/conversation_id, keine Spalte


-- ─────────────────────────────────────────────────────────────────────
-- ACTION
-- ─────────────────────────────────────────────────────────────────────
begin;

alter table public.messages
  add column if not exists reply_to_id bigint references public.messages(id) on delete set null;
  -- ON DELETE SET NULL, nicht CASCADE: wer seine eigene Nachricht löscht,
  -- darf nicht die Antworten anderer mitlöschen (Sprint 9d, Aufgabe 2).

create index if not exists messages_reply_to_id_idx
  on public.messages (reply_to_id);

commit;


-- ─────────────────────────────────────────────────────────────────────
-- GEGENPROBE — nach dem Ausführen
-- ─────────────────────────────────────────────────────────────────────
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='messages' and column_name='reply_to_id';
--
-- select policyname, cmd from pg_policies
--  where schemaname='public' and tablename='messages' order by policyname;
-- -- unverändert: dieselben Policies wie vor der Migration


-- ─────────────────────────────────────────────────────────────────────
-- UNDO — vollständig, falls etwas schiefgeht
-- ─────────────────────────────────────────────────────────────────────
-- begin;
--   drop index if exists public.messages_reply_to_id_idx;
--   alter table public.messages drop column if exists reply_to_id;
-- commit;
