# Security Verification Report: Row Level Security

Date: 23 Oct 2026. Environment: the project's Supabase database (production-shaped, test data only). Scope: Supabase API access (`anon`, `authenticated`) to Payment Hub tables. Policies are documented in `docs/rls-policies.md`.

## Summary
| | Before | After |
|---|---|---|
| Tables with RLS | 0 of 11 | **11 of 11** |
| `anon` privileges | Full (including DELETE and TRUNCATE) on every table | **None** |
| `authenticated` privileges | Full on every table | **SELECT only, five tables, own rows** |
| Merchant A reading Merchant B | Possible on every table | **0 rows, every table** |
| Verification run (same 84 checks) | 76 failed, 8 passed | **84 passed, 0 failed** |
| Backend (owner role) | Works | **Works. Unchanged** |

## Finding that was fixed
**Critical: public database API exposure.** The project's public `anon` key could read, change and delete all data, including password hashes (`users`), encrypted gateway secrets (`payment_gateway_configs`), API secret hashes (`api_credentials`), customer details and payments. Fixed by migration 1700000000008.

Impact assessment: gateway secrets were stored encrypted (AES-256-GCM) and API secrets and dashboard passwords as bcrypt hashes, so no plaintext secret was exposed. The ciphertexts and hashes were readable, though. The 256-bit API secrets and encrypted gateway secrets are not realistically recoverable, but a weak dashboard password could be cracked offline from its hash. Payment rows (customer name, email, phone, order metadata) and checkout tokens were plaintext and readable. The Supabase anon key is not used anywhere in this application, so exposure required someone to obtain it from the dashboard. There is no evidence of access, but Supabase's API logs (Project, Logs, API Edge Logs) are the place to look for past requests to `/rest/v1/`. If you suspect the key was shared, rotate it, and consider asking merchants with weak passwords to change them.

## Method
`npm run security:verify-rls` connects as the backend role, creates two throwaway merchants (A and B) with a row in every business table, then impersonates each API role inside the same transaction (`SET LOCAL ROLE`, with the JWT subject set the way Supabase sets it) and tries to read and write. It rolls the whole transaction back, so it leaves nothing behind and touches no real rows. The last check confirms no residue.

Raw outputs: `docs/security-evidence/rls-verification-before.txt` and `rls-verification-after.txt`.

## Results after the fix
| Area | Checks | Result |
|---|---|---|
| Structure: RLS on all 11 tables; exactly the five expected policies, SELECT-only, `authenticated`-only; no `anon` privilege anywhere; `authenticated` has only SELECT on five tables; new tables start closed; no functions or views in `public` | 6 | Pass |
| Merchant A sees only its own `merchant_profiles`, `tenant_settings`, `payments`, `payment_events`, `audit_logs` (1 row each) and 0 rows of Merchant B's | 10 | Pass |
| Same for Merchant B (symmetry) | 10 | Pass |
| A and B denied (SQLSTATE 42501) on `users`, `payment_gateway_configs`, `api_credentials`, `payment_providers`, `payment_provider_fields`, `migrations`, even for their own rows | 12 | Pass |
| Unknown signed-in user, and signed-in role with no subject: 0 rows on all five readable tables | 10 | Pass |
| `anon` denied on all 11 tables | 11 | Pass |
| Writes via API refused for both `anon` and `authenticated`: INSERT / UPDATE / DELETE on payments, UPDATE of another merchant's payment, UPDATE and DELETE on audit logs (append-only), UPDATE merchant profile, INSERT api_credentials, UPDATE users | 18 | Pass |
| Backend (owner) reads both merchants' rows in 5 tables and can write | 6 | Pass |
| No residue after rollback | 1 | Pass |

## Backend regression check
After the migration I started the real backend against the hardened database and called the endpoints that touch RLS-protected tables. 14 of 14 passed: register, login, merchant profile create/update/read, API credential generate/list/deactivate/delete, API-key authentication, redirect URL save/read (writes `tenant_settings` and `audit_logs`), payments list, provider catalogue. The test user was deleted afterward. The existing data is unchanged (2 users, 4 payments, 1 API key, as before).

## Not covered / limits
1. **Row-level policies are exercised with synthetic identities.** Payment Hub merchants are not Supabase Auth users, so the `authenticated` policies match nothing in practice today. Their correctness is proven with simulated tokens only.
2. **Phase 8 tables.** `webhook_configs` and `webhook_events` were added after this milestone. Their migration enables RLS itself, and the verification script now includes them (see the Phase 8 re-verification below).
3. **Backend-side tenant isolation is not enforced by the database** (the backend bypasses RLS). It relies on application code and its unit tests. A missing `tenant_id` filter in future code would not be caught by RLS.
4. **Not tested:** Supabase Realtime, Storage, direct connections by other database roles, and the hosted dashboard's own access.
5. **Supabase configuration outside the database** (Data API toggle, key rotation, signup settings, network restrictions) is not changed by code. Recommended steps are in `docs/rls-policies.md`.

## Re-running
`cd backend; npm run security:verify-rls`. Run it after every migration. It exits with a non-zero code on any failure.

## Phase 8 re-verification (webhook tables)
Phase 8 added `webhook_configs` (encrypted signing secrets) and `webhook_events` (delivery queue with payment payloads). Their migration enables RLS and revokes `anon` / `authenticated` access in the same step. `npm run security:verify-rls` was extended with both tables and rerun: **92 of 92 checks passed**, RLS on **13 of 13** public tables. Merchant A and B are denied (SQLSTATE 42501) on both new tables, even for their own rows. `anon` is denied. The backend reads and writes them normally. Output: `docs/security-evidence/rls-verification-phase8.txt`.

## Conclusion
Merchant A cannot read, change or delete Merchant B's data through the Supabase API, and `anon` can reach nothing. The backend is unaffected. The RLS milestone is complete, and the Phase 8 tables meet the same standard.
