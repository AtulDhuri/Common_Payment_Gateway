# Phase 4 Report: Gateway Configuration

Sources: `api-design.md`, `db-design.md`, `security-design.md`, `mvp-architecture.md`, `coding-standards.md`, `folder-structure.md`.

## Delivered
| Deliverable | Where |
|---|---|
| Provider API | `GET /providers`, `GET /providers/:code/fields` (`modules/providers`) |
| Dynamic fields | `payment_provider_fields` table, seeded for Razorpay (`key_id` text, `key_secret` secret, `webhook_secret` secret optional) |
| Test connection | `POST /providers/test-connection`, `RazorpayProvider.testConnection` |
| Secure storage | `CryptoService` (AES-256-GCM, `v1:<iv>:<tag>:<ciphertext>`, key from `MASTER_ENCRYPTION_KEY`), `PUT/GET /gateway-config`, `PUT /gateway-config/secret` |
| Audit | `audit_logs`, append-only writer. Actions: `GATEWAY_CONFIG_CREATED`, `GATEWAY_CONFIG_UPDATED`, `GATEWAY_SECRET_REPLACED`. Payloads hold field names only |
| Migrations (applied) | `...02 CreatePaymentProviders`, `...03 CreateGatewayConfigsAndSettings`, `...04 CreateAuditLogs` |
| Seed | `npm run seed` (idempotent upserts) |
| Tests | 51 total (32 new): crypto, verification token, config service |

## Behaviour
- Test connection returns HTTP 200 with `success:false` and a message when the gateway rejects the keys. On success it returns a `verificationToken` (JWT, 15 min, bound to tenant, provider and SHA-256 of the config).
- `PUT /gateway-config` recomputes the hash and returns `CONFIG_NOT_VERIFIED` on any mismatch, including a changed secret, another tenant or an expired token.
- Secrets are encrypted before storage. Responses show a fixed mask `************` for secrets. No endpoint returns a decrypted or encrypted secret.
- Replace Secret re-tests the combined config, stores only the new encrypted value, then audits. A failed test changes nothing and writes no audit row.
- Validation errors name the field, never the value.

## Decisions where the docs were silent
1. **Token field name.** `api-design.md` says the PUT "requires that token" but names no field. The body field is `verificationToken`.
2. **Token signing key.** The verification JWT uses `JWT_ACCESS_SECRET` with `type: "gateway-verification"`. The auth guard only accepts `type: "access"`, so the two cannot be swapped.
3. **Redirect URLs.** `PUT /gateway-config` accepts `successUrl` and `failureUrl` as documented, saved in `tenant_settings` (created now). `PUT /settings/redirects` is not built yet (Phase 7, hosted checkout).
4. **Update semantics.** Saving again replaces the whole config. An optional secret left out is removed.
5. **Tenant key.** `tenant_id` is `users.id` (`db-design.md`). The Phase 3 note lists gateway configs under MerchantProfile. Both are equivalent because the profile is 1-1 with the user.
6. **Error codes used.** `CONNECTION_FAILED` and `CONFIG_NOT_VERIFIED` return 400. `PROVIDER_INACTIVE` returns 400.
7. **Audit FK.** `audit_logs.tenant_id` has no foreign key, so history survives user deletion.

## Not verified
- **Razorpay success and 401 paths were not exercised.** From this machine Razorpay answered the test call with HTTP 429 "Too many requests" (confirmed with a direct request, outside the app). The app maps 429 to a retry message. Please run one real test-mode key pair through `POST /providers/test-connection` to confirm.
- Rate limiting (`RATE_LIMITED`) is not implemented. The docs list the code but define no limits.

## Required environment (add to `.env`)
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (different values), `MASTER_ENCRYPTION_KEY` (64 hex chars or 32-byte base64). Generate the key with:
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
Keep a copy of the master key outside the repo. Without it, stored gateway secrets cannot be decrypted.

## Security follow-up
Row Level Security is still off on all `public` tables, including `payment_gateway_configs`. Encrypted secrets would be readable through the Supabase REST API with the anon key. Enable RLS with no policies on every table before real use.
