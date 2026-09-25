-- S-2 2.5 H-4 Teil feedback (Audit 24.09.2026) — IN PROD 25.09.2026 (Migration sec_s2_h4_feedback_author_admin)
-- Vorher: jede Lehrkraft sah alle 49 Rueckmeldungen (Name, Text, Screenshot). Jetzt: nur eigene, Admin alle.
-- Trockenlauf als Lehrkraft: vorher 49, nachher nur eigene; Admin 49; Einreichen + Rueckgabe (insert..select) ok;
-- Einreichen ohne/mit fremder user_id 42501. Client sendet immer user.id (index.html submitFeedback).
alter policy feedback_select_appuser on public.feedback
  using ((select public.get_app_user_id()) is not null
         and (user_id = (select public.get_app_user_id()) or (select public.is_global_admin())));
alter policy feedback_insert_appuser on public.feedback
  with check (user_id = (select public.get_app_user_id()));
-- UNDO: using (get_app_user_id() is not null); with check (get_app_user_id() is not null and (user_id is null or user_id = get_app_user_id()))
