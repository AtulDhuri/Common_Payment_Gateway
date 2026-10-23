# Security Design

## Critical Assets

The following are classified as Critical Data:

- Razorpay Secret
- Webhook Secret
- Merchant Secret Keys
- API Credentials

---

# Encryption

All gateway secrets must be encrypted.

Algorithm

AES-256

---

# Encryption Key

Loaded from

MASTER_ENCRYPTION_KEY

Environment variable only.

Never store encryption keys in database.

---

# UI Security

Secrets must never be displayed.

Example

*************

Allowed

Replace Secret

Not Allowed

View Secret

---

# API Security

Secrets must never be returned.

Wrong

{
  "secret":"abc"
}

Correct

{
  "configured":true
}

---

# Authentication

JWT

Access Token

Refresh Token

---

# Audit Logs

Log:

Credential Created

Credential Updated

Payment Created

Payment Completed

Payment Failed

Webhook Delivered

---

# Security Rules

No Secret In Logs

No Secret In Responses

No Secret In Frontend Storage

No Secret In Browser Cache

No Plaintext Storage
---

# Database Access (Row Level Security)

Supabase exposes every public table through its HTTP API. All tables have Row Level Security enabled, and the `anon` and `authenticated` roles have no privileges except read-only, own-rows access to five tables. The backend connects directly as the table owner and is the only writer.

Policies, rules for new tables and limits: `docs/rls-policies.md`. Verification results: `docs/security-verification-report.md`. Re-check after every migration with `npm run security:verify-rls`.
