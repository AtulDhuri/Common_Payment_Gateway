# Database Design

## Overview

Payment Hub is a multi-merchant payment orchestration platform.

The system allows:

- Merchant Registration
- Gateway Configuration
- Hosted Checkout
- Payment Processing
- Webhook Delivery
- Transaction Tracking

Initially:

✅ Razorpay

Future:

✅ Stripe

✅ PayPal

✅ Cashfree

✅ PayU

✅ PhonePe

Without redesigning database.

--------------------------------------------------

# Design Principles

1. UUID Primary Keys

2. Soft Deletes

3. Audit Everything

4. Security First

5. Provider Agnostic

6. Future Gateway Support

--------------------------------------------------

# USERS

Purpose

Authentication.

CREATE TABLE users (

id UUID PRIMARY KEY,

email VARCHAR(255) UNIQUE NOT NULL,

password_hash TEXT NOT NULL,

is_active BOOLEAN DEFAULT TRUE,

created_at TIMESTAMP,

updated_at TIMESTAMP

);

--------------------------------------------------

# MERCHANT PROFILES

Purpose

Business information.

CREATE TABLE merchant_profiles (

id UUID PRIMARY KEY,

user_id UUID NOT NULL,

business_name VARCHAR(255),

business_email VARCHAR(255),

support_email VARCHAR(255),

website VARCHAR(500),

status VARCHAR(50),

created_at TIMESTAMP,

updated_at TIMESTAMP

);

--------------------------------------------------

# PAYMENT PROVIDERS

Purpose

Supported gateways.

CREATE TABLE payment_providers (

id UUID PRIMARY KEY,

code VARCHAR(100) UNIQUE,

name VARCHAR(255),

is_active BOOLEAN,

created_at TIMESTAMP

);

Example

RAZORPAY
STRIPE
PAYPAL
CASHFREE

--------------------------------------------------

# PAYMENT PROVIDER FIELDS

Purpose

Dynamic configuration fields.

CREATE TABLE payment_provider_fields (

id UUID PRIMARY KEY,

provider_id UUID NOT NULL,

field_key VARCHAR(255),

field_label VARCHAR(255),

field_type VARCHAR(50),

is_required BOOLEAN,

display_order INT

);

Example

provider = Razorpay

key_id

key_secret

webhook_secret

--------------------------------------------------

# PAYMENT GATEWAY CONFIGS

Purpose

Merchant gateway credentials.

IMPORTANT

Secrets must always be encrypted.

CREATE TABLE payment_gateway_configs (

id UUID PRIMARY KEY,

merchant_id UUID NOT NULL,

provider_id UUID NOT NULL,

config_json JSONB,

is_verified BOOLEAN DEFAULT FALSE,

verified_at TIMESTAMP,

created_at TIMESTAMP,

updated_at TIMESTAMP

);

config_json

{
 "key_id":"rzp_xxx",
 "encrypted_secret":"....",
 "encrypted_webhook_secret":"...."
}

--------------------------------------------------

# API CREDENTIALS

Purpose

Credentials used by merchant applications.

CREATE TABLE api_credentials (

id UUID PRIMARY KEY,

merchant_id UUID NOT NULL,

public_key VARCHAR(255),

secret_key_hash VARCHAR(500),

is_active BOOLEAN DEFAULT TRUE,

created_at TIMESTAMP

);

--------------------------------------------------

# WEBHOOK CONFIGS

Purpose

Merchant webhook destinations.

CREATE TABLE webhook_configs (

id UUID PRIMARY KEY,

merchant_id UUID NOT NULL,

webhook_url TEXT,

webhook_secret TEXT,

is_active BOOLEAN DEFAULT TRUE,

created_at TIMESTAMP

);

--------------------------------------------------

# PAYMENTS

Purpose

Master payment record.

CREATE TABLE payments (

id UUID PRIMARY KEY,

merchant_id UUID NOT NULL,

provider_id UUID NOT NULL,

payment_reference VARCHAR(255),

provider_order_id VARCHAR(255),

provider_payment_id VARCHAR(255),

amount DECIMAL(18,2),

currency VARCHAR(10),

customer_name VARCHAR(255),

customer_email VARCHAR(255),

customer_phone VARCHAR(50),

status VARCHAR(50),

metadata JSONB,

created_at TIMESTAMP,

updated_at TIMESTAMP

);

--------------------------------------------------

# PAYMENT EVENTS

Purpose

Payment lifecycle history.

CREATE TABLE payment_events (

id UUID PRIMARY KEY,

payment_id UUID NOT NULL,

event_type VARCHAR(100),

payload JSONB,

created_at TIMESTAMP

);

Examples

PAYMENT_CREATED

PAYMENT_PENDING

PAYMENT_SUCCESS

PAYMENT_FAILED

PAYMENT_CANCELLED

PAYMENT_REFUNDED

--------------------------------------------------

# WEBHOOK EVENTS

Purpose

Webhook delivery tracking.

CREATE TABLE webhook_events (

id UUID PRIMARY KEY,

payment_id UUID NOT NULL,

merchant_id UUID NOT NULL,

event_type VARCHAR(100),

endpoint_url TEXT,

request_payload JSONB,

response_code INT,

delivery_status VARCHAR(50),

attempt_count INT,

last_attempt_at TIMESTAMP,

created_at TIMESTAMP

);

--------------------------------------------------

# AUDIT LOGS

Purpose

Security tracking.

CREATE TABLE audit_logs (

id UUID PRIMARY KEY,

merchant_id UUID,

action VARCHAR(255),

entity VARCHAR(255),

entity_id UUID,

payload JSONB,

created_at TIMESTAMP

);

Examples

Gateway Created

Gateway Updated

Secret Replaced

Webhook Updated

Payment Created

Payment Verified

--------------------------------------------------

# PAYMENT STATUS ENUM

PENDING

PROCESSING

SUCCESS

FAILED

CANCELLED

REFUNDED

--------------------------------------------------

# FUTURE TABLES

Not MVP

subscriptions

plans

invoices

refunds

analytics

customer_profiles

Keep out of MVP.

--------------------------------------------------

# Relationships

User

1 → 1 MerchantProfile

Merchant

1 → Many GatewayConfigs

Merchant

1 → Many APICredentials

Merchant

1 → Many Payments

Merchant

1 → Many WebhookConfigs

Payment

1 → Many PaymentEvents

Payment

1 → Many WebhookEvents

Provider

1 → Many GatewayConfigs

Provider

1 → Many Payments

--------------------------------------------------

# Security Rules

Never store plaintext secrets.

Always encrypt:

- key_secret
- webhook_secret

Never expose secrets through APIs.

Never expose secrets through UI.

Only support credential replacement.

Do not support credential viewing.

Use:

MASTER_ENCRYPTION_KEY

from environment variables.

## Amendment (Phase 6): api_credentials
The `api_credentials` table above is superseded by `docs/api-credentials.md`: no `client_id`, a `name` and `last_used_at` column, `updated_at`, and a bcrypt `secret_key_hash`.
