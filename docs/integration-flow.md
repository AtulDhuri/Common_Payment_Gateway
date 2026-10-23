# Integration Flow

## Merchant Setup

Merchant Login

↓

Configure Razorpay

↓

Enter

- Key ID
- Key Secret
- Webhook Secret

↓

Test Connection

↓

Verified

↓

Generate Integration Credentials

---

# Developer Flow

Create Payment

POST /payments/create

↓

Receive

paymentId
checkoutUrl

↓

Redirect User

↓

Hosted Checkout

↓

Razorpay

↓

Payment Success

OR

Payment Failure

---

# Success Flow

Payment Success

↓

Update Payment Record

↓

Store Event

↓

Trigger Webhook

↓

Redirect Success URL

↓

Merchant Receives Response

---

# Failure Flow

Payment Failed

↓

Update Payment Record

↓

Store Event

↓

Trigger Webhook

↓

Redirect Failure URL

---

# Webhook Flow

Payment Success

↓

Webhook Delivery

↓

Merchant Endpoint

↓

HTTP 200

↓

Marked Delivered

---

# Standardized Payload

{
  "event":"PAYMENT_SUCCESS",
  "paymentId":"pay_123",
  "status":"SUCCESS",
  "amount":499,
  "currency":"INR",
  "gateway":"RAZORPAY"
}

Applications should never receive raw Razorpay payloads.