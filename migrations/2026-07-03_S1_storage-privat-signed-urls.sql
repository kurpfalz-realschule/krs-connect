-- ============================================================
-- S1 · Storage-Bucket "images" privat + Signed URLs
-- Projekt: ooejsfixxiuobrpqgfqm ("krs-connect")
-- Datum: 2026-07-03
-- Ausführen im SQL-Editor:
--   https://supabase.com/dashboard/project/ooejsfixxiuobrpqgfqm/sql/new
--
-- Problem (P0/DSGVO): Jede hochgeladene Datei (potenziell Schülerbezug) ist
-- ohne Login über die öffentliche URL abrufbar — Bucket ist public UND es gibt
-- eine SELECT-Policy für die Rolle "public".
--
-- Lösung: Bucket auf private, öffentliche Lesepolicy droppen, Lesen nur noch
-- für eingeloggte App-User (get_app_user_id() IS NOT NULL). Das Frontend zieht
-- ab jetzt kurzlebige Signed URLs (createSignedUrl, TTL 1 h).
--
-- Muster: CHECK  → sehen, was IST
--         ACTION → nicht-destruktive, idempotente Änderung
--         UNDO   → exakter Rückweg, falls etwas klemmt
--
-- DEPLOY-REIHENFOLGE (wichtig, Connect ist live):
--   1) ZUERST das Frontend deployen (Signed-URL-Version).
--      createSignedUrl funktioniert auch noch am öffentlichen Bucket, und
--      alte /public/-Links laden weiter — kein Bruch für aktive Nutzer.
--   2) DANN diese Migration ausführen (Bucket privat).
--      Umgekehrt (Migration zuerst) würden aktuell offene alte Clients
--      sofort kaputte Bilder zeigen, weil public-URLs 400 liefern.
--   Rest-Risiko: Nutzer mit alt-gecachtem Client sehen Bilder erst nach
--   einem Reload wieder (bis PWA/SW-Update aus S15 greift).
-- ============================================================


-- ============================================================
-- 1) CHECK — Ist-Zustand VOR der Änderung (nur SELECT, ändert nichts)
-- ============================================================

-- 1a) Ist der Bucket öffentlich?  Erwartet VORHER: public = true
SELECT id, name, public
FROM storage.buckets
WHERE id = 'images';

-- 1b) Welche SELECT-Policies liegen auf storage.objects?
--     Erwartet: eine Policy "images_select_public" (roles = {public}).
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;

-- 1c) Wie viele Objekte liegen im Bucket? (nur zur Info / Größenordnung)
SELECT count(*) AS anzahl_objekte
FROM storage.objects
WHERE bucket_id = 'images';

-- 1d) Helper vorhanden? get_app_user_id() muss existieren (Beleg der Policy).
SELECT proname
FROM pg_proc
WHERE proname = 'get_app_user_id';


-- ============================================================
-- 2) ACTION — Bucket privat + Lesen nur für eingeloggte App-User
--    Idempotent: mehrfach ausführbar ohne Fehler.
-- ============================================================

-- 2a) Bucket auf privat schalten → getPublicUrl liefert keine gültige Datei mehr.
UPDATE storage.buckets
SET public = false
WHERE id = 'images';

-- 2b) Öffentliche Lese-Policy entfernen (das eigentliche Leck).
DROP POLICY IF EXISTS "images_select_public" ON storage.objects;

-- 2c) Neue Lese-Policy: nur eingeloggte App-User (via createSignedUrl).
--     get_app_user_id() ist NULL für anon / Nicht-Kollegium → kein Zugriff.
DROP POLICY IF EXISTS "images_select_appuser" ON storage.objects;
CREATE POLICY "images_select_appuser" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'images'
    AND public.get_app_user_id() IS NOT NULL
  );

-- Hinweis: INSERT-/UPDATE-/DELETE-Policies (images_insert_validated,
-- images_update_own, images_delete_authenticated) bleiben unverändert.


-- ============================================================
-- 3) VERIFY — Soll-Zustand NACH der Änderung
-- ============================================================

-- 3a) Bucket muss jetzt privat sein.  Erwartet NACHHER: public = false
SELECT id, public FROM storage.buckets WHERE id = 'images';

-- 3b) images_select_public darf NICHT mehr existieren,
--     images_select_appuser MUSS existieren (roles = {authenticated}).
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'images_select%';


-- ============================================================
-- 4) UNDO — exakter Rückweg (nur ausführen, wenn zurückgerollt werden muss)
--    ACHTUNG: Stellt den unsicheren öffentlichen Lesezugriff wieder her!
-- ============================================================
-- DROP POLICY IF EXISTS "images_select_appuser" ON storage.objects;
--
-- CREATE POLICY "images_select_public" ON storage.objects
--   FOR SELECT TO public
--   USING (bucket_id = 'images');
--
-- UPDATE storage.buckets SET public = true WHERE id = 'images';
-- ============================================================
