# Merchant Profile (Phase 3)

A Merchant represents a business that wants to accept payments through Payment Hub. Each user owns exactly one merchant profile in MVP. Future versions may support multiple businesses per account.

## Table `merchant_profiles`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL UNIQUE | FK users |
| business_name | varchar(255) NOT NULL | e.g. ABC Technologies Pvt Ltd |
| business_email | varchar(255) NOT NULL | Notifications, payment alerts, reports |
| support_email | varchar(255) | Optional. Customer support |
| website | varchar(500) | Optional. e.g. https://abc.com |
| phone | varchar(50) | Optional |
| country | varchar(100) | Default `India` |
| currency | varchar(10) | Default `INR`. Future: USD, EUR, GBP |
| timezone | varchar(100) | Default `Asia/Kolkata` |
| status | varchar(50) | `ACTIVE` (default), `INACTIVE`, `SUSPENDED` |
| created_at | timestamp | |
| updated_at | timestamp | |

## Relationships
User 1-1 MerchantProfile. MerchantProfile 1-n GatewayConfigurations, Payments, API Credentials, Webhook Configurations.

## API (JWT)
| Method | Path | Description |
|---|---|---|
| POST | /merchant-profile | Create profile |
| GET | /merchant-profile | Get current merchant profile |
| PATCH | /merchant-profile | Update merchant profile |

Request body: `businessName, businessEmail, supportEmail, website, phone, country, currency, timezone`.
Response: standard envelope, e.g. `{ "success": true, "message": "Merchant profile updated", "data": {} }`.

## Validation
- businessName: required, max 255
- businessEmail: required, valid email
- supportEmail: optional, valid email
- website: optional, valid URL
- phone: optional, max 50
- currency: default INR

## Deliverables
Entity, migration, DTOs, repository, service, controller, validation, Swagger documentation, unit tests, phase report.

## Implementation notes (decisions where the spec is silent)
- `status` is not accepted in request bodies. Changing it is not an MVP merchant action.
- Timestamps are `timestamptz`, matching `db-design.md`.
- Duplicate create returns `INVALID_STATE` (409). Missing profile returns `NOT_FOUND` (404).
- Other tables keep `tenant_id` = `users.id` per `db-design.md`. Because the profile is 1-1 with the user, this is equivalent to the profile relationships above.
