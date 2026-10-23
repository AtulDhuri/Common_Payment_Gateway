# API Credentials (Phase 6)

Lets an external application use Payment Hub without the Razorpay SDK. This document supersedes the `api_credentials` table in `db-design.md` and the `X-Client-Id` / credential endpoints in `api-design.md`.

## Table `api_credentials`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK users | The "merchant_id" of the brief. Equal to `users.id`, same as every other tenant table. Cascade on user delete |
| name | varchar(255) | Label chosen by the merchant |
| public_key | varchar(255) unique | `pk_live_...` or `pk_test_...`. Not secret |
| secret_key_hash | varchar(500) | bcrypt (cost 10). The secret itself is never stored |
| last_used_at | timestamptz null | Updated at most once a minute per key |
| is_active | boolean default true | |
| created_at, updated_at | timestamptz | |

Key format: `pk_<mode>_` + 32 hex chars, `sk_<mode>_` + 43 URL-safe chars (32 random bytes). `<mode>` is `live` when the merchant's saved Razorpay key starts with `rzp_live_`, otherwise `test`. It is a label only.

## Secret handling
Generate -> show the secret once in the response -> store only the bcrypt hash -> never return it again. No endpoint returns a secret or a hash. Lost secret: create a new key and delete the old one.

## Dashboard endpoints (JWT)
| Method | Path | Description |
|---|---|---|
| POST | /api-credentials | `{name}`. Returns the credential plus `secretKey`, once |
| GET | /api-credentials | List with `lastUsedAt`, `isActive`. No secrets |
| PATCH | /api-credentials/:id/deactivate | Key stops working immediately. Cannot be reactivated |
| DELETE | /api-credentials/:id | Removes the key permanently |

## Client authentication
Headers `x-api-key` (public key) and `x-api-secret`. The request is rejected with `401 UNAUTHORIZED` and the same message when the key is missing, malformed, unknown, inactive, or the secret is wrong.

Protected endpoints: `POST /payments/create`, `GET /payments/:id`. Future client APIs use the same guard (`@ClientAuth()`).

## Response shape
Client payment endpoints return the standard envelope with the documented fields inside `data` only. The top-level duplicate described in `api-design.md` is dropped.

- create: `data: { paymentId, status, checkoutUrl }`
- status: `data: { paymentId, status, amount, currency, transactionId }`

`checkoutUrl` stays `PUBLIC_BASE_URL/api/v1/checkout/<paymentId>?t=<token>`. The token is required, so the URL cannot be guessed from a payment id.

## Dashboard sandbox
The Payment Sandbox page uses the merchant's login, not an API key. It calls `POST /sandbox/payments` and `GET /sandbox/payments/:id` (JWT), which share the same service as the client endpoints. `GET /payments` (paged list, JWT) is unchanged.

## Not included
Key rotation, scopes, per-key rate limits, usage counters (only `last_used_at`), IP allow-lists.
