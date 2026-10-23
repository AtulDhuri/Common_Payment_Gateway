# Phase 8 Report: Merchant Webhooks

Spec: `docs/merchant-webhooks.md`. Plan deliverables (`development-plan.md`): Webhook Delivery, Retry Mechanism, Event Storage.
Preceded by the Row Level Security milestone (`docs/rls-policies.md`, `docs/security-verification-report.md`).

## What was built
| Deliverable | Where |
|---|---|
| Endpoint configuration: `PUT/GET /webhooks/config`, `POST /webhooks/config/rotate-secret` (signing secret shown once, encrypted at rest) | `modules/webhook-delivery/webhook-config.*` |
| Delivery log API `GET /webhooks/deliveries` (paged, newest first, no payloads or URLs) | same |
| Event storage: `webhook_configs` and `webhook_events` tables (migration `1700000000009`, RLS on, closed to API roles) | `database/migrations` |
| Queuing in the **same transaction** as each payment event | `webhook-enqueuer.ts`, `payments.repository.ts` |
| Delivery: HMAC-SHA256 signing, headers, POST, 2xx = delivered | `webhook-dispatcher.ts`, `webhook-signature.ts`, `webhook-transport.ts` |
| Retry mechanism: 1m, 5m, 30m, 2h, 12h, then FAILED (6 attempts) | `webhook-retry.ts`, configurable via `WEBHOOK_RETRY_DELAYS_SECONDS` |
| Background worker (database polling, `FOR UPDATE SKIP LOCKED`, lease for crash recovery). No Redis or queue server | `webhook-worker.ts`, `webhook-delivery.repository.ts` |
| Outbound request safety (SSRF): https only and no private/loopback/link-local/metadata addresses in production, no redirects, 10 s timeout, DNS result re-checked at connect time | `url-safety.ts` |
| Audit: `WEBHOOK_CONFIG_CREATED/UPDATED`, `WEBHOOK_SECRET_ROTATED`, `WEBHOOK_DELIVERED`, `WEBHOOK_FAILED` (names only, no secrets or URLs) | `webhook-config.service.ts`, `webhook-dispatcher.ts` |
| **Webhooks** page: create endpoint, one-time secret panel, rotate, active toggle, live delivery log, verification snippet | `frontend/src/pages/Webhooks.tsx` |
| Example merchant receiver that verifies the signature, rejects old timestamps, and ignores duplicate deliveries | `examples/external-app/app.mjs` (`/payhub/webhook`) |
| Docs | `merchant-webhooks.md`, `external-api-guide.md` section 8, `api-design.md` amendment, `rls-policies.md` |

## Test results
- Backend: build and lint pass. **217 unit tests pass** (66 new): URL safety, signing and a receiver-side verifier, retry schedule, enqueuer, config service, dispatcher, and the HTTP transport against real local servers (redirects not followed, timeouts, production blocking).
- Frontend: type-check and build pass.
- **RLS re-verification: 92 of 92 checks pass**, RLS on 13 of 13 tables, webhook tables closed to API roles.
- **Delivery end-to-end against the real database: 55 of 55 checks pass** (details below). The one failed assertion in the first full run was wrong test arithmetic (expected 20 deliveries, correct total 19), verified directly in the database.
- **Browser end-to-end of the Webhooks page, with the example shop as the merchant server: 26 of 26 checks pass.**
- All test users and rows were deleted afterward. The existing data (2 users, 4 payments, 1 API key) and the webhook tables (0 rows) are as before.

## Verified scenarios
1. **Signing:** a receiver written exactly as the docs describe accepts genuine deliveries and rejects a wrong secret, a tampered body and a replayed timestamp.
2. **Content:** PAYMENT_CREATED and PAYMENT_SUCCESS arrive with the documented normalized payload (no raw gateway fields), the gateway transaction id, and the same delivery id on every retry.
3. **Atomic queuing:** every stored payment event has exactly one delivery row.
4. **Retries:** a merchant answering 500 gets 3 attempts on the test schedule and then FAILED, with fresh signatures and no further attempts. Gaps measured 1.25 s and 2.19 s against 1 s and 2 s configured. A merchant that recovers on attempt 2 is DELIVERED. A 302 is a failure and its target is never called. A server that never answers is timed out and retried.
5. **Changing the endpoint:** an unreachable URL is recorded as a failed attempt with no response code. Fixing the URL rescues the pending retry. Switching the endpoint off closes pending deliveries without sending them (audited as `ENDPOINT_INACTIVE`) and queues nothing new.
6. **Secret rotation:** the new secret is shown once. A receiver still holding the old secret answers 401, Payment Hub keeps the delivery PENDING, and the retry is delivered once the receiver has the new secret.
7. **Two backend instances on the same database** sharing the queue: 10 simultaneous payments produced exactly 10 requests, each delivery sent once.
8. **Isolation:** merchant B's events go only to B's URL and secret, never to A's, and each merchant's delivery log contains only its own deliveries.
9. **UI:** one-time secret panel, masked after reload, unrecoverable, not in browser storage; invalid URL reasons shown; delivery log updates itself while something is pending; retry time shown for pending deliveries.
10. **Audit:** the five webhook actions are recorded and contain no secret and no URL.

Screens: `docs/phase-8-screens/`. Raw results: `docs/phase-8-evidence/`.

## Defect found and fixed during testing
The first end-to-end run showed every result-recording update failing: `inconsistent types deduced for parameter $4`. The status parameter was used both as a column value and inside a `CASE` comparison, which Postgres could not type. Unit tests with a fake repository cannot catch this, only a real database can. Fixed with explicit casts, and the full run then passed. Because of this, the delivery SQL is covered only by the end-to-end run, not by the permanent unit suite.

## Known limits and decisions
- **Delivery is at least once.** Receivers must use `X-PaymentHub-Delivery-Id` to ignore duplicates. Events can arrive out of order after retries, so receivers should confirm with `GET /payments/:id`.
- **`PAYMENT_PENDING`** is listed in `api-design.md` but Payment Hub never produces it, so it is never sent.
- **Unused columns:** `payment_events.delivery_status`, `delivery_attempts`, `next_attempt_at` and `last_response_code` (added in Phase 5) are no longer used. They stay in the database because dropping them would break any older backend build still running. Drop them in a later cleanup.
- **One endpoint per merchant**, no per-event subscriptions, no manual redelivery, no "send test event".
- **The worker lives inside the API process.** With several instances it is safe (row locking), but an instance that is stopped does not send. Run at least one instance continuously. Setting `WEBHOOK_WORKER_ENABLED=false` turns it off for a given instance.
- **Outbound safety rules are strict only in production** (`NODE_ENV=production`). In development `http://localhost` is allowed so a developer can test. Set `NODE_ENV=production` when deploying, or the stricter rules are not applied. This is the most important deployment setting for this phase.
- **Not tested against real networks:** the DNS re-check at connect time was unit-tested for loopback names, but not against a live rebinding attack. Real https delivery to a public host was not exercised.
- The retry schedule in the UI text and docs is the default. If `WEBHOOK_RETRY_DELAYS_SECONDS` is changed, the UI text no longer matches.
- A backend started before this change keeps running without the worker. Restart it (`npm run build`, then `npm run start`) and run `npm run migration:run`. Migrations for this phase are already applied to your Supabase database.

## How to try it yourself (about 5 minutes)
1. Restart the backend (`npm run build`, `npm run start` in `backend/`) and the frontend.
2. In the UI open **Webhooks**, enter `http://localhost:4000/payhub/webhook`, click **Create endpoint and signing secret**, and copy the secret.
3. Start the example shop with that secret: `$env:PAYHUB_API_KEY="pk_..."; $env:PAYHUB_API_SECRET="sk_..."; $env:PAYHUB_WEBHOOK_SECRET="whsec_..."; node app.mjs` in `examples/external-app`.
4. Click **Pay** on http://localhost:4000 and complete a Test Mode payment. The order page shows "Webhook said: SUCCESS", and the Webhooks page lists PAYMENT_CREATED and PAYMENT_SUCCESS as DELIVERED.
5. Stop the shop, make another payment, and watch the delivery stay PENDING with a next attempt time. Start the shop again and the retry is delivered.

## Remaining work
- Phase 9: dashboard (payment detail, revenue summary).
- Phase 10: automated test suite beyond unit tests (the permanent integration test for the delivery SQL belongs here).
- Run a real Razorpay payment through the new checkout page and webhook receiver (carried over from Phase 7).
- Drop the unused `payment_events` delivery columns once no older build runs.
- Enforce https for checkout return URLs in production.
