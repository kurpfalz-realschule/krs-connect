-- S-2 2.9 H-5 (Audit 24.09.2026) — IN PROD 25.09.2026 (Migration sec_s2_h5_drop_admin_pins)
-- dashboard-admin v11 (verify_jwt=true, Login-JWT + role=admin, Feld-Allowlist validation.mjs) nutzt keine PIN mehr.
-- Live-Code versioniert unter teams 2.0/supabase/functions/dashboard-admin/ (index.ts + validation.mjs, Stand v11).
-- admin_pins (1 veralteter Hash) und admin_rate_limit (0) ohne Verweis in Code/Funktionen; Trockenlauf DROP ok.
drop table public.admin_pins, public.admin_rate_limit;
