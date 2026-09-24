-- S-2 H-4/H-3 (Audit 24.09.2026) — IN PROD 24.09.2026 (Migration sec_s2_h4_orphans_untis_storage)
-- Trockenlauf: verwaister Auth-Account sieht users/Dateien/Koffer/untis = 0/0/0/0; Lehrkraft unveraendert 55/127/30.
-- Erst-Login bleibt: get_app_user_id() hat E-Mail-Rueckfall. untis_* von keiner App genutzt; Bucket uploads 0 Objekte.
drop policy if exists untis_audit_auth on public.untis_audit;
drop policy if exists untis_login_auth on public.untis_login_status;
drop policy if exists untis_settings_auth on public.untis_settings;
alter policy users_select_auth on public.users using ((select public.get_app_user_id()) is not null);
alter policy koffer_select on public.koffer_physisch using ((select public.get_app_user_id()) is not null);
drop policy if exists images_read on storage.objects;
drop policy if exists images_delete on storage.objects;
drop policy if exists uploads_select_auth on storage.objects;
drop policy if exists uploads_insert_auth on storage.objects;
drop policy if exists uploads_delete_own on storage.objects;
