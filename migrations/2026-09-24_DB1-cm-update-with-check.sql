-- DB-1 (Sicherheits-Audit 24.09.2026) — IN PROD eingespielt 24.09.2026 (Migration sec_db1_cm_update_with_check)
-- Befund: cm_update_own hatte kein WITH CHECK -> eigene Mitgliedschaft per PATCH in fremde conversation_id umhaengbar
--         -> kompletter Verlauf fremder DMs/Gruppen lesbar. Trockenlauf: Angriff vorher erfolgreich, danach 42501.
alter policy cm_update_own on public.conversation_members
  using (user_id = (select public.get_app_user_id()))
  with check (user_id = (select public.get_app_user_id())
              and conversation_id in (select public.rls_my_conversation_ids()));
-- UNDO (nicht empfohlen):
-- drop policy cm_update_own on public.conversation_members;
-- create policy cm_update_own on public.conversation_members for update to authenticated
--   using (user_id = (select public.get_app_user_id()));
