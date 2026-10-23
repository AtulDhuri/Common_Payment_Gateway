# Row Level Security (Supabase)

Migration: `backend/src/database/migrations/1700000000008-EnableRowLevelSecurity.ts`
Verification: `npm run security:verify-rls` (in `backend/`)

## Why this exists
Supabase publishes every table in the `public` schema through an HTTP API (PostgREST). Anyone holding the project's public `anon` key can call it. Supabase's default grants give the `anon` and `authenticated` roles full rights on new tables, so before this migration no table had RLS and both roles could read, change and delete everything, including `users` (password hashes) and `payment_gateway_configs` (encrypted gateway secrets).

## Access model
| Path | Role | Row security | Used by |
|---|---|---|---|
| Payment Hub backend | `postgres` (table owner, `BYPASSRLS`) over a direct database connection | Bypassed. Tenant isolation is enforced in application code (`tenant_id` on every query) | The only reader and writer of all data |
| Supabase API with the public key | `anon` | No privileges, no policies. Denied everything | Nothing. Payment Hub does not use the Supabase API |
| Supabase API with a signed-in user's token | `authenticated` | Read-only, own rows only (below) | Nothing today. Policies exist so isolation holds if direct client access is ever enabled |
| Supabase service key | `service_role` (`BYPASSRLS`) | Bypassed | Not used. Keep this key secret |

Two independent locks protect the closed tables: privileges are revoked, and RLS is on with no policy (default deny). Removing one by mistake does not open the table.

## What the migration does
1. `ENABLE ROW LEVEL SECURITY` on every table in `public` (including `migrations`).
2. `REVOKE ALL` on every table from `anon` and `authenticated`.
3. `ALTER DEFAULT PRIVILEGES` so tables created later start with no access for those roles.
4. Creates five read-only policies for `authenticated` and grants `SELECT` on exactly those five tables.

Nothing grants `INSERT`, `UPDATE`, `DELETE` or `TRUNCATE` to an API role. All writes go through the backend.

## Policy catalogue
The tenant id is `users.id`. Policies compare it to `auth.uid()`, written as `(SELECT auth.uid())` so Postgres evaluates it once per query.

| Table | Policy | Command | Role | Condition |
|---|---|---|---|---|
| merchant_profiles | `merchant_profiles_select_own` | SELECT | authenticated | `user_id = (SELECT auth.uid())` |
| tenant_settings | `tenant_settings_select_own` | SELECT | authenticated | `tenant_id = (SELECT auth.uid())` |
| payments | `payments_select_own` | SELECT | authenticated | `tenant_id = (SELECT auth.uid())` |
| payment_events | `payment_events_select_own` | SELECT | authenticated | The event's payment has `tenant_id = (SELECT auth.uid())` |
| audit_logs | `audit_logs_select_own` | SELECT | authenticated | `tenant_id = (SELECT auth.uid())` |

## Tables with no API access at all
No policy and no privilege for `anon` or `authenticated`. Even a merchant's own rows are not readable through the API.

| Table | Reason |
|---|---|
| users | Password hashes |
| payment_gateway_configs | Encrypted gateway secrets |
| api_credentials | Secret key hashes |
| webhook_configs | Webhook signing secrets (encrypted). Created in Phase 8 with RLS on and no policy |
| webhook_events | Delivery queue and log, including stored payloads. Created in Phase 8 with RLS on and no policy |
| payment_providers, payment_provider_fields | Internal catalogue, not merchant data |
| migrations | Internal TypeORM bookkeeping |

## Append-only audit log
`audit_logs` has no `INSERT`, `UPDATE` or `DELETE` privilege for API roles, so the "append-only" rule in `db-design.md` is enforced in the database for the API path. The backend itself only inserts.

## What these policies do not do
- **The backend is not row-restricted by the database.** It bypasses RLS, so a bug in application code (a missing `tenant_id` filter) is not caught by RLS. Application-level scoping and its tests remain the control there. Moving the backend to a restricted role with a per-request tenant setting is possible later, but would need explicit cross-tenant paths for webhooks, checkout links and API-key lookup.
- **Payment Hub merchants are not Supabase Auth users.** Their ids are Payment Hub's own. Today `auth.uid()` never equals a Payment Hub tenant id, so the `authenticated` policies match nothing. They are the rule to keep if client-side access is ever added with Supabase Auth ids equal to `users.id`.
- Table owners and `BYPASSRLS` roles are not subject to policies. `FORCE ROW LEVEL SECURITY` is not used because the backend owner would still bypass it.

## Rules for new tables
1. The migration that creates a table must run (see `1700000000009-CreateWebhookTables.ts` for an example) `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`. Default privileges already give `anon` and `authenticated` nothing.
2. Tables holding secrets, hashes or internal data get no policy.
3. A table a merchant may read gets a `FOR SELECT TO authenticated` policy on its tenant column, plus `GRANT SELECT` for that table only. Never grant write privileges to API roles.
4. Do not create functions or views in `public`. The API exposes them, and views bypass RLS unless created with `security_invoker`.
5. Add the table to the lists in `verify-rls.ts` and run `npm run security:verify-rls`. It fails when any public table has RLS off.

## Recommended in the Supabase dashboard
Payment Hub does not use the Supabase API. Under Project Settings, API, turn off the Data API (or restrict the exposed schemas) to remove the surface completely, and keep the `service_role` key out of the repository and the browser.

## Rollback
`down()` restores Supabase's original open state. Use it only on a development database.
