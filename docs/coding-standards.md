# Coding Standards

## Language
- TypeScript `strict: true`. No `any` (ESLint `@typescript-eslint/no-explicit-any: error`). Use `unknown` and narrow.
- No `console.log` (ESLint `no-console: error`). Use Nest `Logger` on the backend.
- Explicit return types on public methods.

## Architecture
- Controller -> Service -> Repository -> Database. Controllers hold no business logic and no DB access.
- Repositories wrap TypeORM and always take `tenantId` for tenant data.
- Constructor dependency injection only.
- Gateway SDKs are imported only inside `modules/providers/<name>/`. Services depend on the `PaymentProvider` interface.

## DTOs and validation
- Every request body, query and param set has a DTO with `class-validator` decorators.
- Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- Responses are typed (`ApiResponse<T>`). Entities are never returned directly. Map to response DTOs so secrets cannot leak by accident.

## Errors
- Throw `AppException(errorCode, message, httpStatus, details?)`.
- One global exception filter produces the failure envelope. Unknown errors become `INTERNAL_ERROR` with no stack trace to the client.

## Security rules in code
- Never log request bodies for credential endpoints. Use the redaction helper.
- Never put a decrypted secret in a variable that outlives the provider call.
- Compare secrets with `timingSafeEqual`.

## Naming
- Files: `kebab-case.type.ts` (`razorpay.provider.ts`).
- Classes: `PascalCase`. Variables and methods: `camelCase`. Constants and enums: `UPPER_SNAKE`.
- DB: `snake_case` tables and columns. Entities map with explicit `@Column({ name })`.
- API JSON: `camelCase`, except `config` keys that mirror `payment_provider_fields.field_key` (`key_id`, `key_secret`).

## Database
- Migrations only, `synchronize: false`. One migration per change, reversible.
- Seeds are idempotent (upsert by `code` / `(provider_id, field_key)`).
- Every new table enables Row Level Security in the migration that creates it (see `docs/rls-policies.md`). Run `npm run security:verify-rls` after migrating. No functions or views in `public`.

## Frontend
- Function components and hooks. Typed API client, no `fetch` scattered in components.
- Gateway forms render from `/providers/:code/fields`. No provider-specific form code.
- Secret inputs: `type="password"`, `autocomplete="new-password"`, never prefilled, cleared after submit.
- Tailwind utility classes. Shared pieces extracted into `components/`.

## Git and process
- Small commits per phase step. Conventional commit messages (`feat:`, `fix:`, `docs:`).
- `.env` never committed. `.env.example` lists every variable without values.
- Each new file is introduced with FILE / PURPOSE / DEPENDENCIES / PHASE before its code.

## Testing
- Phase 8 delivers the suite. Crypto, status mapping, signature verification and the webhook normalizer get unit tests as they are written.
