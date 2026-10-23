# Phase 3 Report: Merchant Profile

Source of truth: `docs/merchant-profile.md`.

## Delivered
| Deliverable | Location |
|---|---|
| Entity | `backend/src/modules/merchant/entities/merchant-profile.entity.ts` |
| Migration | `backend/src/database/migrations/1700000000001-CreateMerchantProfiles.ts` (applied to Supabase) |
| DTOs | `modules/merchant/dto/merchant-profile.dto.ts` |
| Repository | `modules/merchant/merchant.repository.ts` (all queries by tenant) |
| Service | `modules/merchant/merchant.service.ts` |
| Controller | `modules/merchant/merchant.controller.ts` (`POST/GET/PATCH /api/v1/merchant-profile`) |
| Validation | class-validator rules in the DTOs, global `ValidationPipe` |
| Swagger | `/api/docs` (disabled when `NODE_ENV=production`) |
| Unit tests | 19 tests, `npm test` (node:test) |

## Behaviour
- Create returns 201 `Merchant profile created`. A second create returns 409 `INVALID_STATE`.
- Get and patch return 404 `NOT_FOUND` when no profile exists.
- Patch changes only the fields sent. Optional fields accept `null` to clear them.
- Defaults: country `India`, currency `INR`, timezone `Asia/Kolkata`, status `ACTIVE`.
- `status` is not accepted in request bodies.
- Website must be an `http(s)` URL.

## Changes outside the module
- `@ResponseMessage()` decorator and interceptor change so the envelope can carry a message.
- Swagger setup in `main.ts`.

## Decisions where the spec was silent
- Timestamps are `timestamptz` (matches `db-design.md`).
- DB `CHECK` constraint on `status`; FK to `users` with `ON DELETE CASCADE`.
- Other tables keep `tenant_id = users.id` (`db-design.md`). The profile is 1-1 with the user, so this is equivalent.

## Test tooling note
Nest 12 packages are ESM-only, which Jest 30's CommonJS runtime cannot load. Tests use the Node built-in runner through `ts-node`.

## Open item
Row Level Security is not enabled on Supabase `public` tables. See the security note in the Phase 2 summary.
