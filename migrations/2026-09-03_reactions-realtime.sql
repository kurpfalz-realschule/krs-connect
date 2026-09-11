-- =====================================================================
-- KRS Connect — reactions in Realtime-Publication aufnehmen (Sprint Sonnet #1a)
-- Datum: 2026-09-03 · Projekt: ooejsfixxiuobrpqgfqm
--
-- AUSFÜHRUNG: Supabase SQL-Editor. Block 1 (CHECK) ZUERST lesen, dann Block 2
-- (ACTION). Block 4 (VERIFY) zur Kontrolle. Block 3 (UNDO) nur im Notfall.
-- Additiv & idempotent (2. Lauf crasht nicht).
--
-- HINTERGRUND: Reaktionen (👍 etc. auf Posts/Nachrichten) erscheinen bei
-- anderen Nutzern nicht live — die Tabelle `reactions` fehlt in der
-- `supabase_realtime`-Publication UND der Frontend-Code hat keine
-- Subscription darauf (index.html DataService.subscribeToReactions, neu
-- ab v4.20.0, siehe Changelog).
--
-- WARUM **KEINE** REPLICA IDENTITY FULL (Korrektur v4.20.1, Sicherheits-
-- Review 03.09.2026):
-- Ursprünglich war hier REPLICA IDENTITY FULL vorgesehen, damit ein
-- DELETE-Event auch target_type/target_id im payload.old mitliefert (bei
-- REPLICA IDENTITY DEFAULT steht dort nur die Primary-Key-Spalte, hier
-- reactions.id). Das Problem: Supabase Realtime wendet auf DELETE-Events
-- KEINE Row-Level-Security an (Postgres kann den Zugriff auf eine bereits
-- gelöschte Zeile nicht mehr prüfen). Mit REPLICA IDENTITY FULL hätte
-- deshalb jedes gelöschte Reaction-Event die komplette alte Zeile
-- (target_type, target_id, user_id, emoji) an ALLE abonnierten Sessions
-- geschickt — auch an Lehrkräfte aus fremden Teams, die diese Reaktion nie
-- hätten sehen dürfen. Das wäre ein neues, vermeidbares Metadaten-Leck
-- gewesen und liefe der parallel gehärteten RLS (2026-09-02_S3) zuwider.
-- Die Tabelle bleibt daher bei REPLICA IDENTITY DEFAULT (nur Primärschlüssel
-- im DELETE-Payload). Der Frontend-Code (index.html, subscribeToReactions)
-- nutzt bei DELETE keine target_id mehr, sondern lädt beim Löschen einer
-- Reaktion die Reaktionen aller aktuell dargestellten Posts/Nachrichten neu
-- (die darf der Client ohnehin lesen), debounced/gebündelt statt pro Event.
-- INSERT bleibt unverändert: payload.new liefert die volle neue Zeile UND
-- durchläuft RLS ganz normal, target_id ist dort sicher nutzbar.
-- posts/messages sind von alldem nicht betroffen (dort reicht die PK "id"
-- für DELETE, UPDATE liefert ohnehin die volle neue Zeile in payload.new).
-- =====================================================================


-- ============================================================
-- 1) CHECK  (NUR LESEN!)
-- ============================================================
-- 1a) Ist reactions schon in der Publication?
SELECT schemaname, tablename FROM pg_publication_tables
WHERE pubname='supabase_realtime' AND tablename='reactions';
-- erwartet: 0 Zeilen (Stand 03.09.2026 verifiziert)

-- 1b) Aktuelle Replica Identity von reactions
SELECT c.relname,
  CASE c.relreplident WHEN 'd' THEN 'default(pk)' WHEN 'n' THEN 'nothing' WHEN 'f' THEN 'full' WHEN 'i' THEN 'index' END AS replica_identity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='reactions';
-- erwartet: default(pk) (Stand 03.09.2026 verifiziert) — bleibt so, siehe
-- Begründung oben (KEIN Wechsel auf 'full')


-- ============================================================
-- 2) ACTION
-- ============================================================
-- Bewusst KEIN "ALTER TABLE public.reactions REPLICA IDENTITY FULL" — siehe
-- Begründung im Dateikopf. Nur die Publication wird ergänzt, die Replica
-- Identity bleibt bei DEFAULT (Primärschlüssel-only).
ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions;


-- ============================================================
-- 3) UNDO — nur im Notfall
-- ============================================================
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.reactions;


-- ============================================================
-- 4) VERIFY
-- ============================================================
SELECT schemaname, tablename FROM pg_publication_tables
WHERE pubname='supabase_realtime' ORDER BY tablename;
-- erwartet: feedback, messages, notes, posts, reactions, tasks

SELECT c.relname,
  CASE c.relreplident WHEN 'd' THEN 'default(pk)' WHEN 'n' THEN 'nothing' WHEN 'f' THEN 'full' WHEN 'i' THEN 'index' END AS replica_identity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='reactions';
-- erwartet: default(pk) — unverändert, siehe Begründung im Dateikopf


-- ============================================================
-- 5) Hinweis (nicht Teil dieser Migration — nur geprüft, nicht behoben)
-- ============================================================
-- channel_reads / conversation_reads fehlen ebenfalls in der Publication.
-- Auswirkung geprüft: Der Frontend-Code (index.html) abonniert diese beiden
-- Tabellen an KEINER Stelle per postgres_changes (nur posts/messages/
-- reactions). Die Unread-Zähler laufen über die globalen INSERT-Listener
-- auf messages/posts, nicht über channel_reads/conversation_reads. Das
-- Fehlen dieser zwei Tabellen in der Publication hat also aktuell KEINEN
-- Effekt auf die Live-Funktion — nur dokumentiert, nicht Teil der ACTION.
