-- =====================================================================
-- KRS Connect — S10: Kanäle in der Reihenfolge sortieren (R14, Tanja Appel)
--
-- Zweck: Kanäle wurden bisher in Anlage-Reihenfolge geladen (`order('name')`
--        de facto, siehe unten — tatsächlich alphabetisch). Ein Team-Admin
--        soll wichtige Kanäle (z. B. "Kollegium") nach oben ziehen können.
--
-- Vorprüfung (21.09.2026, vor dem Schreiben dieser Migration durchgeführt):
--   - `channels` hat noch keine Sortier-Spalte (information_schema.columns).
--   - Policy `channels_update_admin` erlaubt Team-Admins bereits UPDATE auf
--     `channels` (RLS unverändert ausreichend — keine Policy-Arbeit nötig,
--     damit fällt dies NICHT unter Abschnitt 12 „an RLS/Policies arbeiten").
--
-- Nicht-destruktiv: fügt nur eine nullable Spalte + Index hinzu, ändert
-- keine bestehenden Policies. Reihenfolge: CHECK → ACTION → GEGENPROBE → UNDO.
-- =====================================================================


-- ─────────────────────────────────────────────────────────────────────
-- CHECK — vor dem Ausführen laufen lassen, Ergebnis notieren
-- ─────────────────────────────────────────────────────────────────────
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='channels';
-- Erwartet vor dem ersten Lauf: keine Spalte "position"


-- ─────────────────────────────────────────────────────────────────────
-- ACTION
-- ─────────────────────────────────────────────────────────────────────
begin;

alter table public.channels
  add column if not exists position int;

-- Backfill: bisherige Reihenfolge (created_at) je Team als Ausgangspunkt,
-- 0-basiert. NUR für Zeilen ohne Wert — idempotent, ein zweiter Lauf
-- verändert von Hand gesetzte Positionen nicht.
with ranked as (
  select id,
         row_number() over (partition by team_id order by created_at) - 1 as rn
    from public.channels
)
update public.channels c
   set position = ranked.rn
  from ranked
 where c.id = ranked.id
   and c.position is null;

-- Hilft beim sortierten Laden je Team (kleine Tabelle, aber additiv billig).
create index if not exists channels_team_position_idx
  on public.channels (team_id, position);

commit;


-- ─────────────────────────────────────────────────────────────────────
-- GEGENPROBE — nach dem Ausführen
-- ─────────────────────────────────────────────────────────────────────
-- select team_id, name, position from public.channels order by team_id, position;
-- -- jede Zeile hat eine Zahl, je Team lückenlos bei 0 beginnend
--
-- select policyname, cmd from pg_policies
--  where schemaname='public' and tablename='channels' order by policyname;
-- -- unverändert: channels_update_admin weiterhin vorhanden


-- ─────────────────────────────────────────────────────────────────────
-- UNDO — vollständig, falls etwas schiefgeht
-- ─────────────────────────────────────────────────────────────────────
-- begin;
--   drop index if exists public.channels_team_position_idx;
--   alter table public.channels drop column if exists position;
-- commit;
