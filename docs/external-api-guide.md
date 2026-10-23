# Payment Hub External API Guide

Take payments from your own application without using the Razorpay SDK. Your server talks to Payment Hub over HTTPS. Payment Hub talks to Razorpay.

```
Your server --(API key + secret)--> POST /api/v1/payments/create --> paymentId + checkoutUrl
Customer's browser ---------------> checkoutUrl (hosted by Payment Hub, opens the gateway)
Your server --(API key + secret)--> GET /api/v1/payments/:paymentId --> status
```

Base URL: `https://<your-payment-hub-host>/api/v1`

## 1. Get credentials
1. Sign in to the Payment Hub dashboard and finish **Gateway** setup (Razorpay keys saved and verified).
2. Open **API Credentials**, enter a name, click **Generate Key**.
3. Copy the **Public Key** (`pk_...`) and **Secret Key** (`sk_...`). **The secret is shown once.** Only a bcrypt hash is stored, so it cannot be shown again. If you lose it, generate a new key and delete the old one.

Use keys on your **server only**. Never put the secret in a browser, mobile app or public repository. Deactivate or delete a key from the same page if it leaks. The change takes effect immediately.

Keys are labelled `test` or `live` after the Razorpay key you saved when you created them (`rzp_test_...` or `rzp_live_...`).

## 2. Authentication
Send both headers on every request:

| Header | Value |
|---|---|
| `x-api-key` | Your public key, `pk_test_...` or `pk_live_...` |
| `x-api-secret` | Your secret key, `sk_test_...` or `sk_live_...` |
| `Content-Type` | `application/json` (requests with a body) |

A missing, wrong, deactivated or deleted key returns `401` with the same message each time, so the response does not reveal which part was wrong.

## 3. Create a payment
`POST /payments/create`

Optional header `Idempotency-Key: <your order id>`. Repeating a request with the same key returns the same payment instead of creating another.

Request:
```json
{
  "amount": 100,
  "currency": "INR",
  "customer": { "name": "Atul Dhuri", "email": "atul@example.com", "phone": "9999999999" },
  "metadata": { "orderId": "ORDER-1001" }
}
```

| Field | Rules |
|---|---|
| amount | Number greater than 0, in major units (100 = ₹100.00), at most 2 decimals |
| currency | 3-letter code, for example `INR` |
| customer.name | Required, up to 255 characters |
| customer.email | Required, valid email |
| customer.phone | Optional, up to 50 characters |
| metadata | Optional JSON object up to 4 KB. Returned unchanged |

Response `201`:
```json
{
  "success": true,
  "message": "",
  "data": {
    "paymentId": "pay_4e1c9a7b0d2f48a1b3c5",
    "status": "PENDING",
    "checkoutUrl": "https://payhub.example.com/api/v1/checkout/pay_4e1c9a7b0d2f48a1b3c5?t=Xk3..."
  }
}
```
Save `paymentId` with your order, then redirect the customer's browser to `checkoutUrl`. The URL contains a private token, so treat it as a one-customer link.

## 4. Get payment status
`GET /payments/{paymentId}`

Response `200`:
```json
{
  "success": true,
  "message": "",
  "data": {
    "paymentId": "pay_4e1c9a7b0d2f48a1b3c5",
    "status": "SUCCESS",
    "amount": 100,
    "currency": "INR",
    "transactionId": "pay_RzpExample123"
  }
}
```

| status | Meaning |
|---|---|
| PENDING | Created, customer has not finished paying |
| SUCCESS | Paid. Safe to fulfil the order |
| FAILED | Payment attempt failed. The customer may retry on the same checkout |
| CANCELLED | Customer closed the checkout |
| REFUNDED | Fully refunded |

`transactionId` is the gateway's payment id (`null` until the customer pays). Reading a PENDING payment checks the gateway first, so the answer is current.

**Always confirm from your server** before delivering goods. Check `status === "SUCCESS"`, and compare `amount` and `currency` with your order. Do not trust the customer's browser returning to your site.

## 5. Example requests

curl:
```bash
curl -X POST "$HUB/api/v1/payments/create" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $PAYHUB_API_KEY" -H "x-api-secret: $PAYHUB_API_SECRET" \
  -H "Idempotency-Key: ORDER-1001" \
  -d '{"amount":100,"currency":"INR","customer":{"name":"Atul Dhuri","email":"atul@example.com"},"metadata":{"orderId":"ORDER-1001"}}'

curl "$HUB/api/v1/payments/pay_4e1c9a7b0d2f48a1b3c5" \
  -H "x-api-key: $PAYHUB_API_KEY" -H "x-api-secret: $PAYHUB_API_SECRET"
```

Node.js (18+):
```js
const headers = { 'content-type': 'application/json', 'x-api-key': KEY, 'x-api-secret': SECRET };

const created = await fetch(`${HUB}/api/v1/payments/create`, {
  method: 'POST', headers: { ...headers, 'Idempotency-Key': 'ORDER-1001' },
  body: JSON.stringify({ amount: 100, currency: 'INR', customer: { name: 'Atul', email: 'atul@example.com' }, metadata: { orderId: 'ORDER-1001' } }),
}).then((r) => r.json());
// redirect the customer to created.data.checkoutUrl

const status = await fetch(`${HUB}/api/v1/payments/${created.data.paymentId}`, { headers }).then((r) => r.json());
if (status.data.status === 'SUCCESS' && status.data.amount === 100) { /* mark order paid */ }
```

A complete working example application is in `examples/external-app` (`node app.mjs`). It creates a payment, sends the browser to checkout, and handles the return.

## 6. Error responses
Every error uses the same shape:
```json
{ "success": false, "message": "Invalid API credentials", "errorCode": "UNAUTHORIZED", "details": {} }
```

| HTTP | errorCode | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Bad body. `details.errors` lists each problem. Unknown fields are rejected |
| 400 | CONFIG_NOT_VERIFIED | The merchant has not saved a verified gateway configuration |
| 401 | UNAUTHORIZED | Missing, malformed, wrong, deactivated or deleted credentials |
| 404 | PAYMENT_NOT_FOUND | Unknown `paymentId`, or it belongs to another merchant |
| 502 | PROVIDER_ERROR | The payment gateway rejected the request or could not be reached. Safe to retry with the same `Idempotency-Key` |
| 500 | INTERNAL_ERROR | Unexpected server error |

Validation example:
```json
{ "success": false, "message": "Validation failed", "errorCode": "VALIDATION_ERROR",
  "details": { "errors": ["amount must be a positive number"] } }
```

## 7. Sending the customer back to your site
Payment Hub's checkout page shows the result (success, failed or cancelled). To bring the customer back to your site, set return URLs once in the dashboard: **Gateway page, "Checkout return URLs"** (or `PUT /api/v1/settings/redirects` with your login).

- After a successful payment the customer is sent to your **Success URL**, after a failed or cancelled one to your **Failure URL**.
- The address gets `?paymentId=pay_...&status=SUCCESS` (or `FAILED`, `CANCELLED`) appended.
- The page counts down 3 seconds and redirects. A **Return to <your name>** button goes at once.
- If the customer closes the payment window, the page offers **Try again** and **Cancel payment**. Nothing is cancelled until they choose it.
- With no return URLs set, the customer just sees the result page.

The `status` in the URL is only a hint. On your return page, find your order by `paymentId`, then call `GET /payments/{paymentId}` from your server and use that answer.

Checkout is a normal page, not a popup. Send the customer's browser to `checkoutUrl` and they come back to your return URL.

## 8. Webhooks (payment notifications to your server)
Instead of polling, let Payment Hub call your server when a payment changes state. Set it up on the dashboard **Webhooks** page: enter your URL, create the endpoint, and copy the **signing secret** (shown once).

Payment Hub sends `POST <your URL>` with a JSON body for `PAYMENT_CREATED`, `PAYMENT_SUCCESS`, `PAYMENT_FAILED`, `PAYMENT_CANCELLED` and `PAYMENT_REFUNDED`:
```json
{ "event": "PAYMENT_SUCCESS", "paymentId": "pay_4e1c9a7b0d2f48a1b3c5", "transactionId": "pay_RzpExample123",
  "status": "SUCCESS", "amount": 100, "currency": "INR", "gateway": "RAZORPAY",
  "customerId": "cust_9f2e1c7a4b6d8e03", "timestamp": "2026-01-01T10:00:00.000Z", "metadata": { "orderId": "ORDER-1001" } }
```
Headers: `X-PaymentHub-Event`, `X-PaymentHub-Timestamp` (unix seconds), `X-PaymentHub-Signature` (`sha256=` + HMAC-SHA256 of `"<timestamp>.<raw body>"` with your signing secret) and `X-PaymentHub-Delivery-Id` (the same value on every retry of one event).

**On your server:**
1. Read the raw body before parsing it.
2. Recompute the signature and compare in constant time. Reject a timestamp more than 5 minutes old.
3. Ignore a `X-PaymentHub-Delivery-Id` you have already handled (delivery is at least once).
4. Answer `2xx` quickly. Do slow work afterwards.
5. Treat the event as a hint. Confirm important changes with `GET /payments/{paymentId}`, since events can arrive out of order after retries.

```js
import { createHmac, timingSafeEqual } from 'node:crypto';
function isGenuine(headers, rawBody, secret) {
  const ts = Number(headers['x-paymenthub-timestamp']);
  if (!Number.isInteger(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(ts + '.' + rawBody).digest('hex');
  const given = String(headers['x-paymenthub-signature'] ?? '');
  return expected.length === given.length && timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}
```

**Retries.** Any non-`2xx` answer (including redirects, which are not followed), a connection error, or no answer within 10 seconds counts as a failure. Payment Hub retries after 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours (6 attempts in total), then marks the delivery `FAILED`. Retries go to your *current* URL and use your *current* secret, so fixing a wrong URL rescues pending events. The delivery log on the Webhooks page shows each event's status, attempts and last response code.

**URL rules.** In production the URL must be `https` and a public address. Private, loopback and link-local addresses (including `localhost`) are refused. For local development `http://localhost` works when Payment Hub runs outside production. A working receiver is in `examples/external-app` (`PAYHUB_WEBHOOK_SECRET=whsec_... node app.mjs`, URL `http://localhost:4000/payhub/webhook`). Rotating the secret on the Webhooks page makes the old one stop working at once.

Full specification: `docs/merchant-webhooks.md`.

## 9. What is not available yet
- Per-payment return URLs (the URLs are one pair per merchant), rate limits, key scopes and key rotation. To replace a key, create a new one, switch your app, then delete the old one.
- Several webhook endpoints per merchant, per-event subscriptions, manual redelivery and a "send test event" button.