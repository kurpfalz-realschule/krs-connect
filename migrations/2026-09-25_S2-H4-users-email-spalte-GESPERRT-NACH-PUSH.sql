-- S-2 2.5 H-4 Teil E-Mail (Audit 24.09.2026) — NOCH NICHT IN PROD.
-- ERST AUSFUEHREN, wenn Connect 4.44.0, Hub 3.30.0 und iPad-Buchung 1.7.1 LIVE sind
-- UND alte Browser-Staende ausgelaufen sind (Pages max-age 600 + Update-Banner) -> fruehestens 1 Tag nach dem Push.
-- Vorab in PROD angelegt (Migration sec_s2_h4_profile_rpcs, 25.09.): RPC krs_my_profile(), krs_admin_users().
-- Trockenlauf 25.09. (Transaktion, zurueckgerollt) als Lehrkraft: eigene Zeile inkl. E-Mail per RPC ok;
-- krs_admin_users 42501; users.email 42501; users.* 42501; Spaltenliste 55 Zeilen; posts+author ok;
-- eigenes Profil-Update ok; channels (Policy mit users-Join) ok. Admin: krs_admin_users 55.
-- Vor dem Ausfuehren pruefen: pg_stat_statements auf '"users".*' bzw. 'users"."email"' von authenticated (seit Push 0 neue Aufrufe?).
revoke select on public.users from anon, authenticated;
grant select (id, username, display_name, avatar_color, role, last_seen, created_at, avatar_url,
              auth_id, status, kuerzel, hub_editor, nachname, anzeigename) on public.users to authenticated;
-- UNDO: grant select on public.users to authenticated;
-- ACHTUNG neue Spalten in users: muessen hier ergaenzt werden (sonst fuer Clients unsichtbar).
