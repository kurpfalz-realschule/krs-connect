-- S-2 2.10 Altlasten (Audit 24.09.2026) — IN PROD 25.09.2026 (Migration sec_s2_altlasten_drop)
-- Vorab: smv_* (25 Tabellen) 0 Zeilen, untis_audit/login_status 0, untis_settings 1 (phase=vorbereitung),
-- _archiv_2026_09_03_* 14/17/4 Zeilen. Kein Verweis in Funktionen, Views, Publikationen, FKs von aussen,
-- Client-Code oder pg_stat_statements. Trockenlauf DROP ohne CASCADE ok.
-- Export: 2026-09-25_S2-altlasten-export.json; volle Zeilen zusaetzlich in backup.*__<datum> (Wochensicherung).
drop table public._archiv_2026_09_03_channels, public._archiv_2026_09_03_team_members, public._archiv_2026_09_03_teams,
  public.smv_aemter, public.smv_announcements, public.smv_attendance, public.smv_budget, public.smv_candidates,
  public.smv_channels, public.smv_events, public.smv_helper_shifts, public.smv_helper_signups, public.smv_helpers,
  public.smv_ideas, public.smv_meetings, public.smv_messages, public.smv_poll_options, public.smv_polls,
  public.smv_protocols, public.smv_schuelerrat, public.smv_schulkonferenz, public.smv_sk_antraege, public.smv_tasks,
  public.smv_teams, public.smv_users, public.smv_votes, public.untis_audit, public.untis_login_status, public.untis_settings;
