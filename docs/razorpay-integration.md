# Razorpay Integration (Phase 5)

Scope: a complete MVP payment flow. No subscriptions, invoices, recurring billing, analytics, SDKs or other gateways.

## Flow
```
Merchant App -> POST /payments/create -> Payment Hub creates Razorpay order -> checkoutUrl
-> customer opens checkoutUrl -> Razorpay widget -> payment
-> Razorpay webhook (POST /webhooks/razorpay) -> payment status updated
-> merchant calls GET /payments/:id
```

## RazorpayProvider
`testConnection`, `createOrder`, `verifyPayment`, `getPaymentDetails`. It also owns the gateway-specific parts of webhook handling: `verifyWebhookSignature` and `normalizeWebhook` (so services never see raw Razorpay payloads).

## payments table
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK users | The "merchant_id" of the Phase 5 brief. Equal to `users.id`, which is 1-1 with `merchant_profiles.user_id` |
| provider_id | uuid FK payment_providers | |
| payment_reference | varchar(40) unique | Public ID, `pay_` + 20 hex chars (`public_id` in `db-design.md`) |
| provider_order_id | varchar null | |
| provider_payment_id | varchar null | |
| amount | numeric(12,2) | Major units |
| currency | char(3) | |
| status | varchar(16) | PENDING, SUCCESS, FAILED, CANCELLED, REFUNDED |
| customer_name | varchar(255) | |
| customer_email | varchar(255) | |
| customer_phone | varchar(50) null | Replaces `customer_json` |
| metadata | jsonb | Returned unchanged |
| checkout_token | varchar | Random token in `checkoutUrl` |
| idempotency_key | varchar(255) null | Unique per tenant. Supports the documented `Idempotency-Key` header |
| created_at, updated_at | timestamptz | |

`payment_events` follows `db-design.md` (event_type, normalized payload, delivery columns). Phase 8 uses the delivery columns.

## Status lifecycle
| From | Allowed to |
|---|---|
| PENDING | SUCCESS, FAILED, CANCELLED |
| FAILED | SUCCESS (customer retried in the same widget) |
| CANCELLED | SUCCESS (late capture) |
| SUCCESS | REFUNDED |
| REFUNDED | none |

Anything else is ignored (for example a late `payment.failed` after SUCCESS). Each applied change writes one `payment_events` row.

## APIs
| Method | Path | Auth |
|---|---|---|
| POST | /payments/create | JWT (interim, see below) |
| GET | /payments/:id | JWT (interim). `:id` is the `payment_reference` |
| GET | /checkout/:reference?t=token | token |
| POST | /checkout/:reference/complete?t=token | token |
| POST | /checkout/:reference/cancel?t=token | token |
| POST | /webhooks/razorpay | Razorpay signature |

Request and response shapes for create and get are in `api-design.md`. Create also accepts optional `customer.phone`.

## Webhook
- Header `X-Razorpay-Signature` is verified against the raw body using the tenant's `webhook_secret`.
- The tenant is found from the order ID inside the payload (`payment.entity.order_id`). The body is trusted only after the signature passes.
- Handled events: `payment.captured` and `order.paid` (SUCCESS), `payment.failed` (FAILED), `refund.processed` (REFUNDED, only for a full refund). Others return 200 and are ignored.
- Unknown orders return 200 (Razorpay retries non-2xx). A bad signature returns 401.
- For SUCCESS the payload amount and currency must match the stored payment, otherwise it is ignored and logged.

## Reconciliations with earlier docs
1. Webhook route is `/webhooks/razorpay` as requested. `api-design.md` lists `/webhooks/gateway/:providerCode/:tenantId`.
2. Client auth (`X-Client-Id`, `X-Api-Key`, `X-Api-Secret`) arrives in Phase 6. Until then the payment APIs accept the merchant's dashboard JWT. Phase 6 swaps the guard.
3. Hosted checkout is the minimum needed to take a payment: the page, `complete` and `cancel`. Success/failure pages and polish stay in Phase 7.
4. `PUT /settings/redirects` is still Phase 7. Redirect URLs saved through `PUT /gateway-config` are used by `complete` and `cancel`.
5. Outgoing merchant webhooks (retries, signing) are Phase 8. Events are stored now with `delivery_status = NOT_REQUIRED`.
6. `checkoutUrl` is `PUBLIC_BASE_URL/api/v1/checkout/<reference>?t=<token>`.
