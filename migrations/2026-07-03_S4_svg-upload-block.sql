-- ============================================================
-- S4 · SVG-Upload serverseitig blocken (Stored-XSS-Pfad schließen)
-- Projekt: ooejsfixxiuobrpqgfqm ("krs-connect")
-- Datum: 2026-07-03
-- Ausführen im SQL-Editor:
--   https://supabase.com/dashboard/project/ooejsfixxiuobrpqgfqm/sql/new
--
-- Problem (P1/Sicherheit): image/svg+xml war in der Upload-Whitelist. Eine SVG
-- kann aktiven Code tragen (<script>, on*-Handler). Da eine hochgeladene Datei
-- über eine (Signed) URL als eigenständiges Dokument mit Content-Type
-- image/svg+xml geöffnet werden kann, führt das zu Stored-XSS im Origin.
--
-- Lösung: image/svg+xml aus der INSERT-Policy "images_insert_validated"
-- streichen. Das Frontend (UPLOAD_CONFIG.ALLOWED_MIME/ALLOWED_EXT,
-- BLOCKED_EXTENSIONS, isSafeImageSrc) wurde im selben Commit angepasst; diese
-- Migration zieht den serverseitigen Check nach, damit ein manipulierter Client
-- die Whitelist nicht umgehen kann.
--
-- Muster: CHECK  → sehen, was IST
--         ACTION → nicht-destruktive, idempotente Änderung
--         VERIFY → Soll-Zustand
--         UNDO   → exakter Rückweg
--
-- Reihenfolge unkritisch (rein additiv/verschärfend). Kann vor oder nach dem
-- Frontend-Deploy laufen; bestehende Bilder/Dateien bleiben unberührt.
-- Bereits hochgeladene SVGs (falls vorhanden) siehe CHECK 1c — ggf. manuell
-- löschen (Frontend rendert sie ohnehin nicht mehr inline).
-- ============================================================


-- ============================================================
-- 1) CHECK — Ist-Zustand VOR der Änderung (nur SELECT, ändert nichts)
-- ============================================================

-- 1a) Aktuelle INSERT-Policy. Erwartet VORHER: with_check-Liste enthält
--     'image/svg+xml'.
SELECT policyname, cmd, roles, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname = 'images_insert_validated';

-- 1b) Bucket-Ebene: allowed_mime_types (Info). Erwartet: NULL → Enforcement
--     läuft ausschließlich über die Policy oben.
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'images';

-- 1c) Liegen bereits SVGs im Bucket? (nur Info — ggf. manuell entfernen)
SELECT id, name, (metadata->>'mimetype') AS mimetype, created_at
FROM storage.objects
WHERE bucket_id = 'images'
  AND ( (metadata->>'mimetype') = 'image/svg+xml'
        OR lower(name) LIKE '%.svg'
        OR lower(name) LIKE '%.svgz' );


-- ============================================================
-- 2) ACTION — Policy ohne image/svg+xml neu erstellen
--    Idempotent: DROP IF EXISTS + CREATE.
--    Liste identisch zu migrations/S2-ausgefuehrt-2026-06-12/
--    06_storage-upload-fix.sql, NUR ohne 'image/svg+xml'.
-- ============================================================

DROP POLICY IF EXISTS "images_insert_validated" ON storage.objects;

CREATE POLICY "images_insert_validated" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'images'
    AND (storage.foldername(name))[1] IN ('uploads', 'avatars')
    AND (
      -- Upload-Start hat oft noch kein mimetype → erlauben
      -- (finaler Schutz zusätzlich über Frontend-Whitelist + Bucket-Größenlimit)
      (metadata->>'mimetype') IS NULL
      OR (metadata->>'mimetype') IN (
        -- Bilder  ← image/svg+xml BEWUSST ENTFERNT (S4, Stored-XSS)
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic',
        -- PDF
        'application/pdf',
        -- Word
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        -- Excel
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        -- PowerPoint
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        -- Plain Text
        'text/plain', 'text/csv', 'text/markdown'
      )
    )
  );


-- ============================================================
-- 3) VERIFY — Soll-Zustand NACH der Änderung
-- ============================================================

-- 3a) Policy darf 'image/svg+xml' NICHT mehr enthalten. Erwartet: 0 Zeilen.
SELECT policyname
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname = 'images_insert_validated'
  AND with_check LIKE '%svg+xml%';

-- 3b) Policy existiert weiterhin (roles = {authenticated}). Erwartet: 1 Zeile.
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname = 'images_insert_validated';


-- ============================================================
-- 4) UNDO — exakter Rückweg (nur ausführen, wenn zurückgerollt werden muss)
--    ACHTUNG: Stellt den unsicheren SVG-Upload wieder her!
-- ============================================================
-- DROP POLICY IF EXISTS "images_insert_validated" ON storage.objects;
--
-- CREATE POLICY "images_insert_validated" ON storage.objects
--   FOR INSERT TO authenticated
--   WITH CHECK (
--     bucket_id = 'images'
--     AND (storage.foldername(name))[1] IN ('uploads', 'avatars')
--     AND (
--       (metadata->>'mimetype') IS NULL
--       OR (metadata->>'mimetype') IN (
--         'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/svg+xml',
--         'application/pdf',
--         'application/msword',
--         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
--         'application/vnd.ms-excel',
--         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
--         'application/vnd.ms-powerpoint',
--         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
--         'text/plain', 'text/csv', 'text/markdown'
--       )
--     )
--   );
-- ============================================================
