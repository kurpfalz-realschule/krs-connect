-- 25.09.2026 (Entscheidung Norbert): Feedback-Board bleibt fuer ALLE Lehrkraefte sichtbar
-- (hebt die Lese-Einschraenkung aus 2026-09-25_S2-H4-feedback-autor-admin.sql auf). IN PROD (Migration fix_feedback_board_fuer_alle).
-- Bleibt bestehen: Einreichen nur mit eigener user_id; Status aendern/loeschen nur Admin.
-- Feedback-Screenshots sind entsprechend fuer alle App-Nutzer lesbar (krs_can_read_object).
-- Nachtest Lehrkraft: 49 Rueckmeldungen sichtbar, Feedback-Bild lesbar.
alter policy feedback_select_appuser on public.feedback
  using ((select public.get_app_user_id()) is not null);
-- krs_can_read_object: Feedback-Zeile ohne "and f.user_id = get_app_user_id()" (siehe DB).
