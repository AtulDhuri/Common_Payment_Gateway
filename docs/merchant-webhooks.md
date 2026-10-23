# Merchant Webhooks (Phase 8)

Deliverables from `development-plan.md`: Webhook Delivery, Retry Mechanism, Event Storage. Payment Hub calls the merchant's server when a payment changes state, so the merchant does not have to poll.

Sources: `api-design.md` ("Outgoing webhooks to client"), the `webhook_configs` and `webhook_events` tables in `db-design.md`, `security-design.md` ("Webhook Delivered" audit). This document records the decisions where those differ or are silent.

## Flow
```
payment status changes -> payment_events row + webhook_events row (PENDING)   [one database transaction]
-> dispatcher claims due rows -> POST to the merchant URL -> 2xx = DELIVERED
-> anything else = retry later, up to the schedule, then FAILED
```
Enqueueing happens in the same transaction as the payment event, so a stored event is never lost, and a rolled-back one is never sent.

## Tables
`webhook_configs`: one endpoint per merchant.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK users, unique | The "merchant_id" of `db-design.md` (= `users.id`, as in every table) |
| webhook_url | text | |
| webhook_secret | text | Signing secret, **encrypted** (AES-256-GCM). It must be readable by the server to sign, so it cannot be hashed |
| is_active | boolean | |
| created_at, updated_at | timestamptz | `updated_at` added |

`webhook_events`: one row per event per delivery (`db-design.md`, with additions marked (+)).
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | Also sent as `X-PaymentHub-Delivery-Id` |
| tenant_id | uuid FK users | |
| payment_id | uuid FK payments | |
| **(+)** payment_event_id | uuid FK payment_events | Links to the stored lifecycle event |
| event_type | varchar(100) | `PAYMENT_CREATED`, `PAYMENT_SUCCESS`, ... |
| endpoint_url | text | URL used for the latest attempt (set to the merchant's URL when queued, updated on every attempt) |
| request_payload | jsonb | The exact JSON that is sent |
| response_code | int null | HTTP status of the latest attempt, null if no response |
| delivery_status | varchar(50) | `PENDING`, `DELIVERED`, `FAILED` |
| attempt_count | int | Attempts made |
| **(+)** next_attempt_at | timestamptz null | When the next attempt is due (needed for retries) |
| last_attempt_at | timestamptz null | |
| created_at | timestamptz | |

Both tables have Row Level Security enabled with no API policy (`docs/rls-policies.md`).

The reserved delivery columns on `payment_events` (added in Phase 5: `delivery_status`, `delivery_attempts`, `next_attempt_at`, `last_response_code`) are no longer used, because delivery tracking lives in `webhook_events`. The application stops reading and writing them. They are left in the database for now and can be dropped in a later cleanup once no older backend build is running (dropping them would break such a build).

## Configuration API (JWT)
| Method | Path | Description |
|---|---|---|
| PUT | /webhooks/config | `{url, isActive?}`. First call creates the endpoint and returns the signing secret **once**. Later calls change the URL (or `isActive`) and return the secret masked |
| POST | /webhooks/config/rotate-secret | New signing secret, shown once. The old one stops working at once |
| GET | /webhooks/config | `{url, isActive, secret: "************"}` or 404 when not configured |
| GET | /webhooks/deliveries | **(+)** Paged delivery log for the merchant (status, attempts, response code, times). Needed by the Webhooks page |

`isActive` on PUT is an addition: `GET` shows `isActive`, so there has to be a way to switch deliveries off. Inactive means no new events are queued, and queued ones that are still pending are marked `FAILED` when they come due.

## What the merchant receives
`POST <url>`, `Content-Type: application/json`, body = the normalized payment payload (`api-design.md`), identical for every gateway:
```json
{ "event": "PAYMENT_SUCCESS", "paymentId": "pay_...", "transactionId": "pay_...", "status": "SUCCESS",
  "amount": 499, "currency": "INR", "gateway": "RAZORPAY", "customerId": "cust_...",
  "timestamp": "2026-01-01T00:00:00.000Z", "metadata": { "orderId": "ORD1001" } }
```
Headers:
| Header | Value |
|---|---|
| X-PaymentHub-Event | Event name |
| X-PaymentHub-Timestamp | Unix seconds when this attempt was sent |
| X-PaymentHub-Signature | `sha256=` + hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`) |
| **(+)** X-PaymentHub-Delivery-Id | Stable id for the event. The same value on every retry, so the receiver can ignore duplicates |

Events sent: `PAYMENT_CREATED`, `PAYMENT_SUCCESS`, `PAYMENT_FAILED`, `PAYMENT_CANCELLED`, `PAYMENT_REFUNDED`. (`PAYMENT_PENDING` is listed in the API doc, but Payment Hub never produces it, so it is never sent.)

### Verifying a webhook (merchant side)
1. Take the raw request body bytes (before any JSON parsing).
2. Compute `HMAC-SHA256(secret, timestamp + "." + rawBody)` and compare with the signature in constant time.
3. Reject if the timestamp is more than 5 minutes old (replay protection).
4. Ignore a `X-PaymentHub-Delivery-Id` you have already processed, and answer `2xx` quickly.
5. Treat the payload as a hint and confirm important changes with `GET /payments/:id`. Events can arrive out of order after retries.

## Delivery rules
- **Success:** any `2xx`. Everything else fails: other status codes, redirects (`3xx` are **not followed**), connection errors, 10 second timeout.
- **Schedule:** first attempt immediately, then after 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours (`api-design.md`). That is 6 attempts. After the sixth failure the delivery is `FAILED` and is not retried.
- **Worker:** a poller inside the backend, every 5 seconds, using `SELECT ... FOR UPDATE SKIP LOCKED` with a 2 minute lease, so several backend instances never send the same delivery twice at once, and a crash mid-send is retried. No Redis or queue (`mvp-architecture.md`).
- **URL and secret:** the merchant's *current* URL and secret are used at send time. If a merchant fixes a wrong URL, pending retries reach the new one. After a rotation, pending retries are signed with the new secret.
- **Delivery is at least once.** A receiver can see the same event twice (for example when its `2xx` is lost). Use `X-PaymentHub-Delivery-Id`.
- Settings (environment): `WEBHOOK_WORKER_ENABLED` (default `true`), `WEBHOOK_POLL_INTERVAL_MS` (default 5000), `WEBHOOK_RETRY_DELAYS_SECONDS` (default `60,300,1800,7200,43200`).

## Security
- **Outbound request safety (SSRF).** The URL is chosen by a merchant, so the server will not call internal addresses.
  - Always: `http` or `https` only, no credentials in the URL, redirects not followed, 10 second timeout, response body discarded.
  - In production (`NODE_ENV=production`): `https` only, and `localhost` and private, loopback, link-local, carrier-grade NAT and multicast addresses (IPv4 and IPv6) are blocked. The check runs on the address actually connected to, so a DNS name that later resolves to an internal address is also blocked.
  - Outside production, `http` and `localhost` are allowed so a developer can test.
- The signing secret is shown once, stored encrypted, never logged, never returned by `GET`, never present in audit logs.
- Audit: `WEBHOOK_CONFIG_CREATED`, `WEBHOOK_CONFIG_UPDATED`, `WEBHOOK_SECRET_ROTATED`, `WEBHOOK_DELIVERED`, `WEBHOOK_FAILED`. Payloads hold names, event types and attempt numbers, never URLs' query strings or body data.
- Only the delivery log and stored payloads of the merchant's own payments are shown to that merchant.

## Not included
Per-event subscriptions, several endpoints per merchant, manual redelivery, a "send test event" button, receiver health alerts, rate limiting of deliveries.
