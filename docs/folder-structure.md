# Folder Structure

Monorepo with two apps, no workspace tooling beyond npm.

```
CommonPaymentGateway_MyAPPOnly/
  docs/
  backend/                      NestJS
    src/
      main.ts
      app.module.ts
      config/                   env validation, typed config
      common/
        dto/                    shared DTOs (pagination)
        filters/                global exception filter
        interceptors/           response envelope
        guards/                 jwt.guard, client-api.guard
        decorators/             @CurrentUser, @Public, @TenantId
        types/                  ApiResponse, ErrorCodes
        utils/                  redact, ids
      database/
        data-source.ts
        migrations/
        seeds/                  providers + fields
      modules/
        auth/                   controller, service, dto
        users/                  entity, repository
        crypto/                 CryptoService (AES-256-GCM)
        audit/
        providers/              catalog, fields, test-connection
          registry/             ProviderRegistry
          interfaces/           PaymentProvider + shared types
          razorpay/             RazorpayProvider (only SDK import)
        gateway-config/
        api-credentials/
        payments/
        checkout/
        webhooks/               config, dispatcher, gateway intake
        integration-kit/        templates + generator
    test/
    Dockerfile
    package.json
  frontend/                     React + Vite + Tailwind
    src/
      api/                      typed client
      auth/                     context, protected route
      pages/                    Login, Register, Gateway, Credentials, Webhooks, IntegrationKit, Payments
      components/               DynamicForm, SecretField, CodeBlock
    Dockerfile
  docker-compose.yml
  .env.example
  .gitignore
```

Each Nest feature module contains `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `entities/`, `dto/`, `*.module.ts`.

Layer rule: controller -> service -> repository -> database. Only `providers/razorpay/` may import `razorpay`.
