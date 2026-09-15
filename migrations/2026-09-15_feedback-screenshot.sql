-- =====================================================================
-- KRS Connect — Screenshot am Feedback (v4.23.0)
-- Angewendet am 15.09.2026, Gegenprobe siehe unten. STATUS: EINGESPIELT ✅
--
-- Warum: Im Feedback-Formular ließ sich kein Bild anhängen — genau das,
-- was man bei einem Fehlerbericht am dringendsten braucht.
-- Rückmeldung Daniel Schmitt, 14.09.2026:
--   „Man kann hier im Feedbackbereich auch keine Bilder/Screenshot einfügen."
--
-- Was gespeichert wird: NICHT die Bild-URL, sondern der Storage-Objektpfad
-- im privaten Bucket `images` (z. B. uploads/1789…_ab12.png) — wie bei
-- Beiträgen und Chat-Anhängen. Die anzeigbare URL zieht das Frontend zur
-- Laufzeit als kurzlebige Signed URL (window.__krsResolveStorageUrl).
-- Additive, nullable Spalte: bestehende Zeilen und der alte Frontend-Stand
-- bleiben unberührt.
--
-- RLS: unverändert. Die Spalte erbt die Policies der Tabelle `feedback`;
-- neue Rechte entstehen nicht.
-- =====================================================================

-- ── CHECK (vorher ausführen) ─────────────────────────────────────────
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='feedback' and column_name='image_url';
--  → 0 Zeilen = Spalte fehlt noch.

-- ── ACTION ───────────────────────────────────────────────────────────
alter table public.feedback add column if not exists image_url text;

comment on column public.feedback.image_url is
  'Optionaler Screenshot zum Feedback: Storage-Objektpfad im privaten Bucket images (z. B. uploads/123_abc.png). v4.23.0';

-- ── GEGENPROBE (am 15.09.2026 gelaufen) ──────────────────────────────
-- select column_name, data_type, is_nullable from information_schema.columns
--  where table_schema='public' and table_name='feedback' and column_name='image_url';
--  → image_url | text | YES   ✅

-- ── UNDO ─────────────────────────────────────────────────────────────
-- Achtung: löscht die Zuordnung der bereits angehängten Screenshots.
-- Die Bilddateien selbst bleiben im Bucket `images` liegen.
-- alter table public.feedback drop column if exists image_url;
