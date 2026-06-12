-- Migration 7/7: 2026-06_allowall-cleanup.sql
-- + S2-ZUSATZ: Drop der anonymen Storage-Schreib-Policies (Allow public upload/update images),
--   die sonst images_insert_validated per ODER aushebeln. Lesen (Allow public read) bleibt.
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname ILIKE 'allow all%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   pol.policyname, pol.schemaname, pol.tablename);
    RAISE NOTICE 'Dropped policy % on %.%',
                 pol.policyname, pol.schemaname, pol.tablename;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Allow public upload images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update images" ON storage.objects;

-- Verifikation: erwartet 0
SELECT count(*) AS verbleibende_allow_all
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname ILIKE 'allow all%';
