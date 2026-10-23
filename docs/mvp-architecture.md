# Payment Hub MVP Architecture

## Vision

Payment Hub is a Merchant Payment Operating System.

A merchant should be able to:

1. Register on Payment Hub
2. Connect a payment gateway
3. Test connection
4. Securely save credentials
5. Generate Integration Kit
6. Accept payments
7. Track transactions
8. Receive webhooks
9. Switch gateways in future with minimal changes

The goal is NOT to build a complete subscription management platform.

The goal is to build a Plug & Play payment integration platform.

---

# Core Problem

Today every application must:

- Integrate Razorpay
- Handle payment callbacks
- Handle webhooks
- Manage order creation
- Verify signatures

This logic gets repeated across products.

Payment Hub centralizes payment processing.

Applications integrate with Payment Hub once.

Payment Hub talks to Razorpay.

---

# Merchant Flow

Merchant Registration

↓

Merchant Profile Setup

↓

Gateway Configuration

↓

Test Connection

↓

Connection Verified

↓

Generate API Credentials

↓

Generate Integration Kit

↓

Developer Integration

↓

Payment Processing

↓

Webhook Delivery

↓

Merchant Dashboard

---

# MVP Scope

Included

✅ Authentication

✅ Merchant Profile

✅ Razorpay Configuration

✅ Dynamic Gateway Fields

✅ Test Connection

✅ Secure Storage

✅ API Key Generation

✅ Hosted Checkout

✅ Payment Creation API

✅ Payment Status API

✅ Success Redirect

✅ Failure Redirect

✅ Webhook Notifications

✅ Merchant Dashboard

✅ Payment History

✅ Audit Logs

Not Included

❌ Subscriptions

❌ Plans

❌ Invoices

❌ Analytics

❌ Multi Gateway Routing

❌ SDK

❌ Redis

❌ BullMQ

❌ Microservices

---

# System Architecture

Frontend

React
Tailwind

↓

Backend API

NestJS

↓

Services

Authentication

Merchant

Providers

Payments

Webhooks

↓

Database

PostgreSQL
Supabase

↓

Gateway

Razorpay

---

# Hosted Checkout

Payment Hub owns checkout page.

Developer does not create payment UI.

Process

Application
 ↓
 Create Payment API
 ↓
 Payment Hub Checkout
 ↓
 Razorpay
 ↓
 Success/Failure
 ↓
 Redirect + Webhook

---

# Future Extension

Future gateways should require:

1. New Provider Service
2. New Configuration Fields

No database redesign.

No API redesign.

No merchant workflow changes.