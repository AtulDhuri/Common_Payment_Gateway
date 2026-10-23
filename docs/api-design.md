# API Design

Base path: `/api/v1`.

## Response envelope
Success:
```json
{ "success": true, "message": "", "data": {} }
```
Failure:
```json
{ "success": false, "message": "", "errorCode": "", "details": {} }
```
Applied by a global response interceptor and a global exception filter. Validation uses a global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`).

Note: `POST /payments/create` and `GET /payments/:id` are specified with flat responses (`paymentId`, `checkoutUrl` at top level). To honor both specs, those two endpoints return the envelope fields **and** the documented fields at top level:
```json
{ "success": true, "message": "", "paymentId": "pay_xxx", "checkoutUrl": "...", "data": { "paymentId": "pay_xxx", "checkoutUrl": "..." } }
```
This duplication is deliberate and limited to the client payment APIs.

## Error codes
`VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, EMAIL_TAKEN, INVALID_CREDENTIALS, PROVIDER_NOT_FOUND, PROVIDER_INACTIVE, CONNECTION_FAILED, CONFIG_NOT_VERIFIED, PAYMENT_NOT_FOUND, INVALID_STATE, PROVIDER_ERROR, RATE_LIMITED, INTERNAL_ERROR`

## Auth types
- **JWT**: `Authorization: Bearer <token>`. Dashboard endpoints.
- **Client**: `X-Client-Id`, `X-Api-Key`, `X-Api-Secret`. Payment APIs.
- **Public**: none.

## Dashboard endpoints (JWT)
| Method | Path | Description |
|---|---|---|
| POST | /auth/register | `{email,password}` (min 8 chars). Public |
| POST | /auth/login | Returns `{accessToken}`. Public |
| GET | /auth/me | Current user |
| GET | /providers | Active providers `[{code,name}]` |
| GET | /providers/:code/fields | `[{fieldKey,label,type,required,order}]` |
| POST | /providers/test-connection | `{provider,config}`. Returns `{success,message}`. Nothing stored |
| PUT | /gateway-config | `{provider,config,successUrl?,failureUrl?}`. Saves. Rejects with `CONFIG_NOT_VERIFIED` unless the same config passed a test (see below) |
| GET | /gateway-config | Masked config: `{provider,isVerified,verifiedAt,fields:{key_id:"rzp_test_abc",key_secret:"************"}}` |
| PUT | /gateway-config/secret | `{fieldKey,value}`. Replace Secret. Re-tests, then audits |
| PUT | /settings/redirects | `{successUrl,failureUrl}` |
| POST | /api-credentials | Generates credentials. Returns `secretKey` once |
| POST | /api-credentials/rotate | New secret, old credentials deactivated. Returns it once |
| GET | /api-credentials | `{clientId,publicKey,secretKey:"************",createdAt}` |
| PUT | /webhooks/config | `{url}`. Returns signing secret once on create |
| POST | /webhooks/config/rotate-secret | New signing secret, shown once |
| GET | /webhooks/config | `{url,isActive,secret:"************"}` |
| GET | /integration-kit | Docs bundle as JSON (markdown sections + examples) |
| GET | /integration-kit/postman | Postman collection JSON download |
| GET | /payments | Dashboard payment list (paged) |

There is no endpoint that returns a decrypted or unmasked secret.

### How "verified before save" is enforced
`test-connection` on success returns a short-lived signed `verificationToken` (JWT, 15 min, bound to tenant, provider and a SHA-256 of the submitted config). `PUT /gateway-config` requires that token and recomputes the hash. The test result is data in the `data` field: `{success,message,verificationToken}`; on failure the response is HTTP 200 with `success:false,message:"..."`, matching the requested shape.

## Client endpoints (Client auth)
### POST /payments/create
```json
{ "amount": 499, "currency": "INR",
  "customer": { "name": "John", "email": "john@example.com" },
  "metadata": { "orderId": "ORD1001" } }
```
Validation: amount > 0 (max 2 decimals), currency 3 letters, email valid, metadata object under 4 KB. Optional header `Idempotency-Key` returns the same payment on repeat.

Response `201`:
```json
{ "success": true, "paymentId": "pay_xxx", "checkoutUrl": "https://hub.example.com/checkout/pay_xxx?t=<token>" }
```

### GET /payments/:paymentId
```json
{ "success": true, "paymentId": "pay_xxx", "status": "SUCCESS", "amount": 499, "currency": "INR" }
```
Reads from the database. If status is `PENDING`, the service refreshes it from the provider first.

## Hosted checkout endpoints (public, token-protected)
| Method | Path | Description |
|---|---|---|
| GET | /checkout/:paymentId?t=token | Page that opens the gateway widget. Receives only the public gateway key, never a secret |
| POST | /checkout/:paymentId/complete | Browser posts gateway response. Server verifies signature through the provider, updates status, returns redirect URL |
| POST | /checkout/:paymentId/cancel | User dismissed the widget. Status `CANCELLED` |

Redirects:
- Success: `{successUrl}?paymentId=pay_xxx&status=SUCCESS`
- Failure or cancel: `{failureUrl}?paymentId=pay_xxx&status=FAILED` (or `CANCELLED`)

The redirect is informational. Applications must confirm with the Status API or webhook.

## Gateway webhook intake (public)
`POST /webhooks/gateway/:providerCode/:tenantId`. Raw body is used for signature verification by the provider using the tenant's decrypted `webhook_secret`. Handles late or missed outcomes and refunds.

## Outgoing webhooks to client
`POST <webhook url>` with headers:
- `X-PaymentHub-Event`: event name
- `X-PaymentHub-Timestamp`: unix seconds
- `X-PaymentHub-Signature`: `sha256=` + HMAC-SHA256(secret, `${timestamp}.${rawBody}`)

Events: `PAYMENT_CREATED, PAYMENT_PENDING, PAYMENT_SUCCESS, PAYMENT_FAILED, PAYMENT_CANCELLED, PAYMENT_REFUNDED`.

Payload (identical for every gateway):
```json
{ "event": "PAYMENT_SUCCESS", "paymentId": "pay_123", "transactionId": "txn_456",
  "status": "SUCCESS", "amount": 499, "currency": "INR", "gateway": "RAZORPAY",
  "customerId": "cust_1", "timestamp": "2026-01-01T00:00:00Z",
  "metadata": { "orderId": "ORD1001" } }
```
`transactionId` is the provider payment ID exposed as an opaque string. `customerId` is a Payment Hub generated ID per customer email within a tenant. A 2xx response marks delivery as done. Anything else is retried (1m, 5m, 30m, 2h, 12h).

## Amendment (Phase 6): API credentials
Client authentication and the credential endpoints in this document are superseded by `docs/api-credentials.md`. Client endpoints authenticate with `x-api-key` + `x-api-secret`. `POST /payments/create` and `GET /payments/:id` return their fields inside `data` only (no top-level duplicates). Dashboard credential endpoints are `POST/GET /api-credentials`, `PATCH /api-credentials/:id/deactivate`, `DELETE /api-credentials/:id`. Developer guide: `docs/external-api-guide.md`.

## Amendment (Phase 8): merchant webhooks
Outgoing webhooks, the `/webhooks/config` endpoints, the added `GET /webhooks/deliveries` log, the `X-PaymentHub-Delivery-Id` header, retry rules and URL safety rules are specified in `docs/merchant-webhooks.md`. `PAYMENT_PENDING` is never produced, so it is never sent.
