# S2 — Tatsächlich ausgeführte Migrationen (12.06.2026)

Ausgeführt im Supabase SQL-Editor (Projekt `ooejsfixxiuobrpqgfqm`), Reihenfolge MERGE-SPEC §4.
Vorher-Sicherung: vollständiger `pg_policies`-Dump als CSV-Export (Downloads, 57 Policies).
Echtes On-Demand-Backup ist im Free Tier nicht verfügbar; Migrationen sind additiv, kein Live-Betrieb.

## Abweichungen gegenüber den Quelldateien (alle nötig, alle verifiziert)

| Migration | Quelldatei | Abweichung | Grund |
|---|---|---|---|
| 2 | `macbook…/krs-connect-phase3-migration.sql` | `UPDATE users u SET auth_uid = (SELECT au.id FROM auth.users au WHERE au.email = u.email) …` | **Bug im Original:** `users.email` band im Subquery an `auth.users` (Relation heißt ebenfalls „users") → alle 9 E-Mail-losen Zeilen bekamen dieselbe auth_uid → Unique-Verletzung `idx_users_auth_uid`. Erster Lauf rollte komplett zurück. |
| 2 | dito | Emoji-Constraint in DO-Block mit `EXCEPTION WHEN duplicate_object` | `ADD CONSTRAINT` war nicht idempotent |
| 3 | `macbook…/PHASE-6-MIGRATION.sql` | `get_app_user_id()` behält `RETURNS BIGINT`, Body liest `auth_id` mit E-Mail-Fallback | Rückgabetyp-Wechsel (bigint→integer) ist bei `CREATE OR REPLACE` verboten; v4-App nutzt ausschließlich `auth_id` (auth_uid = Altlast) |
| 3 | dito | `UPDATE users SET auth_id = auth_uid WHERE …` ergänzt | Bridge: Norberts Zeile (id=1) hatte nur auth_uid gesetzt |
| 3 | dito | Alle `CREATE POLICY` in IF-NOT-EXISTS-Guards; `users_update_own`/`posts_update_own` per DROP+CREATE auf Phase-6-Definition umgestellt | Namen kollidierten mit Migration 2; Original war nicht idempotent |
| 4 | `migrations/2026-05-01_phase3-features.sql` | `DROP FUNCTION IF EXISTS public.toggle_reaction(…)` vorangestellt | Rückgabetyp-Wechsel BOOLEAN→TEXT; App ignoriert den Rückgabewert (verifiziert Z. 2347 ff.) |
| 5 | `migrations/2026-05-01_rls-konsolidierung.sql` | 5 `CREATE POLICY` in Guards gewrappt | Idempotenz |
| 6 | `migrations/2026-05-01_storage-upload-fix.sql` | unverändert | — |
| 7 | `migrations/2026-06_allowall-cleanup.sql` | **Zusatz:** `DROP POLICY "Allow public upload images"` und `"Allow public update images"` auf storage.objects | Anonyme Schreib-Policies hebelten `images_insert_validated` per ODER-Verknüpfung aus; vom Cleanup-Skript (nur public-Schema, nur „Allow all%") nicht erfasst. „Allow public read images" blieb bewusst (öffentliche Bild-URLs). |

## Verifikation (nach Migration 7)

- `Allow all%`-Policies im public-Schema: **0**
- Alle 13 public-Tabellen: `rls_enabled = true`, ≥1 Policy
  (channel_reads 1, channels 6, conversation_members 8, conversation_reads 1, conversations 8, messages 8, post_reads 7, posts 10, reactions 7, team_members 10, teams 8, user_preferences 3, users 6)
- Realtime-Publication `supabase_realtime`: `messages, posts` (genau die zwei Tabellen, die die v4-App abonniert; post_reads bewusst NICHT — Performance)
- Migration-4-Featurecheck: is_pinned / avatar_url / reactions / post_reads / toggle_reaction RPC = alle true

## Hinweis Restbestand (bewusst, dokumentiert)

Es existieren weiterhin parallele permissive Policies aus verschiedenen Generationen
(z. B. `tm_select_auth` (nur auth) ODER `team_members_select` (team-scoped)).
Effektiv gilt die schwächere (auth-only). Kein Datenleck über das Kollegium hinaus,
aber eine spätere Konsolidierung auf EINE Policy-Generation pro Tabelle ist sinnvoll (Backlog).
