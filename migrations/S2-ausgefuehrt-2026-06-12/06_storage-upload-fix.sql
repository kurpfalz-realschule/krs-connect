-- ============================================================
-- KRS Connect — Storage-Upload-Fix
-- ============================================================
-- Datum: 01.05.2026
-- Bug: User berichten "Datei-Upload funktioniert nicht"
--
-- Ursache: Die Policy "images_insert_validated" (sofort-fixes.sql, FIX 5)
-- listet nur einen Teil der MIME-Types, obwohl das Frontend mehr erlaubt.
-- Fehlend: .pptx, .ppt, .txt
-- Folge: Upload schlägt mit Policy-Violation fehl, Frontend zeigt nur
-- generische "Datei konnte nicht hochgeladen werden"-Meldung.
--
-- Fix: Policy ersetzen mit vollständiger, mit Frontend-`accept`-Liste
-- konsistenter MIME-Whitelist + Bucket-Größenlimit auf 25 MB.
-- ============================================================

-- 1. Bucket-Größenlimit setzen (25 MB pro Datei)
UPDATE storage.buckets
   SET file_size_limit = 25 * 1024 * 1024
 WHERE id = 'images';

-- 2. Alte INSERT-Policy entfernen
DROP POLICY IF EXISTS "images_insert_validated" ON storage.objects;
DROP POLICY IF EXISTS "images_insert_authenticated" ON storage.objects;

-- 3. Neue, vollständige Policy
CREATE POLICY "images_insert_validated" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'images'
    AND (storage.foldername(name))[1] IN ('uploads', 'avatars')
    AND (
      -- Upload-Start hat oft noch kein mimetype → erlauben (final wird vom Bucket-Size-Limit geprüft)
      (metadata->>'mimetype') IS NULL
      OR (metadata->>'mimetype') IN (
        -- Bilder
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/svg+xml',
        -- PDF
        'application/pdf',
        -- Word
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        -- Excel
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        -- PowerPoint  ← FEHLTE BISHER
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        -- Plain Text  ← FEHLTE BISHER
        'text/plain', 'text/csv', 'text/markdown'
      )
    )
  );

-- 4. Avatare lesbar machen (für Profilbilder)
DROP POLICY IF EXISTS "avatars_select_public" ON storage.objects;
-- (images_select_public aus sofort-fixes.sql gilt schon für ALLE Dateien im images-Bucket)

-- 5. Verifikation: Aktive Policies auf storage.objects auflisten
SELECT polname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
 ORDER BY polname;
