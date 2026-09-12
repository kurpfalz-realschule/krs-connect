-- =====================================================================
-- KRS Connect — Sicherheitsfix: Bucket "images" war anonym lesbar
-- Datum: 11.09.2026 · Projekt: ooejsfixxiuobrpqgfqm
-- Ablegen unter: krs-connect-deploy/migrations/
--
-- BEFUND (live reproduziert, 11.09.2026):
--   Der Bucket `images` ist korrekt auf public = false gesetzt, und das
--   Frontend zieht seit dem S1-Umbau ausschliesslich Signed URLs
--   (createSignedUrl, TTL 1 h) — aber auf storage.objects lag zusaetzlich
--   die Alt-Policy:
--       "Allow public read images"  SELECT  TO public  USING (bucket_id = 'images')
--   ohne jede auth-Bedingung. Permissive Policies verknuepfen mit ODER,
--   also hat diese eine Zeile die beiden korrekten Policies
--   (images_read, images_select_appuser) ausgehebelt.
--
--   Nachgewiesen mit dem oeffentlichen anon-Key:
--     POST /storage/v1/object/list/images           -> 200, 3 Objekte + Ordner "uploads"
--     POST /storage/v1/object/list/images (uploads) -> 200, 13 Objekte
--     GET  /storage/v1/object/images/<datei>        -> 200, 5.005.599 Bytes (voller Download)
--   Inhalt: 16 Dateien aus Beitraegen — Bilder, PDFs, ein Word-Dokument.
--   Signed URLs waren damit wertlos: die Objektnamen waren ohnehin listbar.
--
-- BEWERTUNG: schwerer als die Archivtabellen vom 09.09. Dort lagen nur
--   Demo-/Testdaten, hier echte Anhaenge aus dem Kollegiums-Betrieb.
--   Ob personenbezogene Inhalte dabei waren, kann nur Norbert beurteilen.
--   Ein tatsaechlicher Abfluss ist nicht feststellbar — die Storage-Logs
--   reichen im Free-Tier nur rund einen Tag zurueck.
-- =====================================================================


-- ============================================================
-- 1) CHECK — Policies auf storage.objects
-- ============================================================
-- select policyname, cmd, roles::text, qual, with_check
--   from pg_policies where schemaname = 'storage' and tablename = 'objects'
--  order by cmd, policyname;


-- ============================================================
-- 2) ACTION — am 11.09.2026 angewendet
-- ============================================================
drop policy if exists "Allow public read images" on storage.objects;

-- Danach greifen weiterhin (unveraendert, fuer eingeloggte Nutzer):
--   images_read           SELECT TO public        USING (bucket_id='images' AND auth.uid() IS NOT NULL)
--   images_select_appuser SELECT TO authenticated USING (bucket_id='images' AND get_app_user_id() IS NOT NULL)


-- ============================================================
-- 3) VERIFY — am 11.09.2026 gelaufen
-- ============================================================
--   anon  : list images -> [] , list images/uploads -> []   (vorher 3 bzw. 13 Objekte)
--   auth. : 20 Objekte weiterhin sichtbar (SET LOCAL ROLE authenticated
--           + request.jwt.claims gegen die Live-DB) -> App laeuft weiter
--   Frontend: nur createSignedUrl, kein getPublicUrl -> keine Regression
--   Hinweis: der direkte Datei-GET liess sich zuletzt nicht mehr messen,
--   weil der Agent-Proxy Binaer-Downloads blockte. Listing und Download
--   haengen an derselben SELECT-Policy, daher ist beides zu.


-- ============================================================
-- 4) UNDO
-- ============================================================
-- create policy "Allow public read images" on storage.objects
--   for select to public using (bucket_id = 'images');
-- (Nur wiederherstellen, wenn wirklich oeffentliche Bilder gebraucht werden —
--  dann besser einen eigenen, bewusst oeffentlichen Bucket anlegen.)


-- ============================================================
-- 5) NOCH OFFEN — nicht in dieser Migration, braucht einen Test
-- ============================================================
-- images_delete_authenticated  DELETE TO authenticated USING (bucket_id='images')
--   -> jede eingeloggte Person kann JEDE Datei im Bucket loeschen.
--   Im Live-Frontend gibt es nur EINEN .remove()-Aufruf (cleanupOldFiles,
--   Dateien aelter als 90 Tage), fuer den keine Aufrufstelle gefunden wurde.
--   Vorschlag fuer den Opus-Sprint:
--     drop policy "images_delete_authenticated" on storage.objects;
--     create policy images_delete_admin on storage.objects
--       for delete to authenticated
--       using (bucket_id = 'images' and public.is_global_admin());
--   Vorher pruefen, ob im Admin-Bereich ein Aufraeum-Button existiert.
