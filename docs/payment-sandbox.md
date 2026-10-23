# Payment Sandbox: testing guide

The sandbox is a React UI for running the whole payment lifecycle by hand. It sits on top of the Phase 5 backend and adds one API endpoint, `GET /payments` (paged, newest first, JWT). That endpoint is the dashboard payment list from `api-design.md`, pulled forward for the history section.

## Pages
| Route | Purpose |
|---|---|
| /register, /login | Merchant account |
| /gateway | Enter Key ID, Key Secret, Webhook Secret. Test Connection. Save Configuration. Fields are rendered from `/providers/RAZORPAY/fields` |
| /sandbox | Create a test payment, Open Checkout, see Payment ID / Status / Gateway / Transaction ID / Created At, and the latest 10 payments |

Save is enabled only after a successful Test Connection, and any edit disables it again.
Secrets are never shown, never prefilled, and cleared from the form after saving.
The sandbox shows a warning when a `rzp_live_` key is configured.

## Run it
`.env` at the repo root must contain `SUPABSAE_DB_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `MASTER_ENCRYPTION_KEY` (the backend loads it automatically).

```
# terminal 1: backend on :3000
cd backend
npm run build
npm run start

# terminal 2: UI on :5173 (proxies /api to :3000)
cd frontend
npm run dev
```
Keep a copy of `MASTER_ENCRYPTION_KEY` outside the repo. Without it stored gateway secrets cannot be decrypted.

## Razorpay setup (Test Mode)
1. In the Razorpay Dashboard, switch to **Test Mode**, then Account & Settings, API Keys, Generate Test Key. You get `rzp_test_...` Key ID and Key Secret.
2. Pick any string as the webhook secret (for example 20 random characters). You enter the same string in Razorpay and in the UI.
3. Razorpay cannot call `localhost`. Expose the backend with a tunnel, for example `ngrok http 3000` or `cloudflared tunnel --url http://localhost:3000`.
4. In Razorpay (Test Mode) go to Settings, Webhooks, Add New Webhook:
   - URL: `https://<tunnel-host>/api/v1/webhooks/razorpay`
   - Secret: your webhook secret
   - Events: `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`

## Test steps
1. Open http://localhost:5173, register, and go to **Gateway**.
2. Enter Key ID, Key Secret, Webhook Secret. Click **Test Connection** (expect "Connection successful"), then **Save Configuration**.
3. Go to **Payment Sandbox**. Leave amount at 1, keep or edit the other fields, click **Create Test Payment**. The details card shows the Payment ID with status PENDING.
4. Click **Open Checkout**. This tab goes to the hosted checkout page, which opens the Razorpay widget. If you set the return URLs to the sandbox first (Gateway page, **Checkout return URLs**, button *Use the Payment Sandbox page for both*), you land back on the sandbox with the payment selected when it ends.
5. Pay with a test method:
   - Card `4111 1111 1111 1111`, any future expiry, any CVV, any name. On the bank page choose **Success**.
   - Or UPI `success@razorpay`.
   - To see a failure use UPI `failure@razorpay`.
6. Back in the sandbox the status changes from PENDING to SUCCESS on its own (it checks every 3 seconds). Transaction ID shows the Razorpay payment id (`pay_...`). The payment appears in the history table.

## What to verify
- **Webhook received:** the backend log shows `Razorpay event payment.captured for pay_<reference>`. This line is written only after the signature check passes.
- **Database:**
  ```sql
  select payment_reference, status, provider_payment_id, amount from payments order by created_at desc limit 5;
  select p.payment_reference, e.event_type, e.created_at
    from payment_events e join payments p on p.id = e.payment_id order by e.created_at desc limit 10;
  ```
  Expect one `PAYMENT_CREATED` and one `PAYMENT_SUCCESS` event per successful payment.
- **Secrets at rest:** `select config_json from payment_gateway_configs;` shows `key_secret` and `webhook_secret` as `v1:...` envelopes, never plaintext.
- **Without a tunnel:** the UI still reaches SUCCESS because reading a PENDING payment refreshes it from Razorpay. That proves the payment path but not the webhook. The log line above is what proves the webhook.

## Troubleshooting
| Symptom | Likely cause |
|---|---|
| Test Connection: "rate limiting" | Razorpay returned HTTP 429. Wait a minute and retry |
| Test Connection: "rejected these credentials" | Wrong Key ID/Secret, or live keys mixed with test keys |
| Webhook returns 401 in Razorpay's delivery log | Webhook secret in Razorpay differs from the one saved. Save the configuration again with the matching secret |
| Status stays PENDING | No tunnel/webhook, and the payment was not completed in the widget |
| Create payment: "No verified gateway configuration" | Save the Gateway page first |
