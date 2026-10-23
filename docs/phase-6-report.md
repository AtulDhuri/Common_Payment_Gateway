# Phase 6 Report: API Credentials

Source of truth: `docs/api-credentials.md` (supersedes the credential parts of `api-design.md` and `db-design.md`). Developer guide: `docs/external-api-guide.md`.

## Delivered
| Item | Where |
|---|---|
| Table + migration (applied) | `api_credentials`, `1700000000007-CreateApiCredentials.ts` |
| Key generation | `pk_<mode>_` + 32 hex, `sk_<mode>_` + 43 URL-safe chars. Secret shown once, bcrypt (cost 10) hash stored |
| Dashboard endpoints (JWT) | `POST /api-credentials`, `GET /api-credentials`, `PATCH /api-credentials/:id/deactivate`, `DELETE /api-credentials/:id` |
| Client authentication | `ClientApiGuard` + `@ClientAuth()`. Headers `x-api-key`, `x-api-secret` |
| Protected APIs | `POST /api/v1/payments/create`, `GET /api/v1/payments/:id` |
| Responses | `data: { paymentId, status, checkoutUrl }` and `data: { paymentId, status, amount, currency, transactionId }` |
| UI | "API Credentials" page: generate, one-time secret panel with copy buttons, list, deactivate, delete, last used, usage snippet |
| Example external app | `examples/external-app/app.mjs` (no dependencies, no Razorpay code) |
| Developer docs | `docs/external-api-guide.md` |
| Unit tests | 17 new, 139 total |

## Security
- The secret is returned once by `POST /api-credentials` and never again. No endpoint returns a secret or hash.
- All authentication failures return the same `401` message (missing, malformed, unknown, inactive, wrong secret). Malformed values are rejected before any database or bcrypt work.
- Deactivate and delete take effect on the next request (no caching).
- The dashboard login (JWT) no longer works on the two client endpoints.
- Audit actions: `API_CREDENTIAL_CREATED`, `API_CREDENTIAL_DEACTIVATED`, `API_CREDENTIAL_DELETED`. Payloads hold name and public key only.

## Decisions where the brief and earlier docs differed
1. `tenant_id` (= `users.id`) instead of `merchant_id`, as in every other table.
2. bcrypt instead of the SHA-256 in `db-design.md`, as requested.
3. Headers are `x-api-key` and `x-api-secret`. The `X-Client-Id` header and `client_id` column are dropped.
4. The flat duplicate fields from `api-design.md` are dropped. Fields are inside `data` only, as in the brief.
5. The Payment Sandbox moved to JWT routes `POST /sandbox/payments` and `GET /sandbox/payments/:id`, because the two client endpoints now accept API credentials only.
6. `checkoutUrl` keeps its private token: `PUBLIC_BASE_URL/api/v1/checkout/<paymentId>?t=<token>`. The shorter `/pay/pay_123` form in the brief's example would be guessable from a payment id.
7. "Usage information" is `last_used_at` (updated at most once a minute) and creation date. There is no request counter.
8. Key mode (`live` or `test`) is a label taken from the merchant's saved Razorpay key when the key is created.
9. A deactivated key cannot be reactivated. Create a new one instead.

## Verification
- Build, lint and 139 unit tests pass. Frontend type-check and build pass.
- 43 end-to-end checks passed in a real browser against the real app and database, with only outbound Razorpay calls stubbed: UI flow, one-time secret, bcrypt hash in the database, 401 cases, create/status APIs, idempotency, the example app from payment to SUCCESS, deactivate and delete taking effect, and the sandbox still working.
- The test users were removed afterward.

## Not verified
- A real Razorpay payment through an API-credential-created payment. The Razorpay code path is unchanged from the live payment you completed, but the new auth layer was only exercised with Razorpay stubbed.

## Not included
Webhooks to the merchant's server (Phase 8), redirect URL fields in the UI (Phase 7), key rotation, scopes, rate limits, per-key request counters.

## Notes
- Restart the backend after pulling this change (`npm run build`, then `npm run start`). An older process keeps serving the old routes.
- Row Level Security is still not enabled on Supabase `public` tables. `api_credentials` now holds secret hashes. Enable RLS (no policies) on all tables before real use.
