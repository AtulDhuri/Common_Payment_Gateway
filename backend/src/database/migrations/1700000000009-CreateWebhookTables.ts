// FILE: database/migrations/1700000000009-CreateWebhookTables.ts
// PURPOSE: webhook_configs and webhook_events (docs/merchant-webhooks.md). Row Level Security is enabled here, with no API policy
// (docs/rls-policies.md rule 1): the signing secret and delivery payloads are backend-only
// DEPENDENCIES: typeorm, users, payments, payment_events
// PHASE: 8
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWebhookTables1700000000009 implements MigrationInterface {
  name = 'CreateWebhookTables1700000000009';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "webhook_configs" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "tenant_id" uuid NOT NULL,
      "webhook_url" text NOT NULL,
      "webhook_secret" text NOT NULL,
      "is_active" boolean NOT NULL DEFAULT true,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_webhook_configs_id" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_webhook_configs_tenant" UNIQUE ("tenant_id"),
      CONSTRAINT "FK_webhook_configs_tenant" FOREIGN KEY ("tenant_id") REFERENCES "users"("id") ON DELETE CASCADE
    )`);
    await q.query(`CREATE TABLE "webhook_events" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "tenant_id" uuid NOT NULL,
      "payment_id" uuid NOT NULL,
      "payment_event_id" uuid NOT NULL,
      "event_type" varchar(100) NOT NULL,
      "endpoint_url" text NOT NULL,
      "request_payload" jsonb NOT NULL,
      "response_code" int,
      "delivery_status" varchar(50) NOT NULL DEFAULT 'PENDING',
      "attempt_count" int NOT NULL DEFAULT 0,
      "next_attempt_at" timestamptz,
      "last_attempt_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_webhook_events_id" PRIMARY KEY ("id"),
      CONSTRAINT "FK_webhook_events_tenant" FOREIGN KEY ("tenant_id") REFERENCES "users"("id"),
      CONSTRAINT "FK_webhook_events_payment" FOREIGN KEY ("payment_id") REFERENCES "payments"("id"),
      CONSTRAINT "FK_webhook_events_payment_event" FOREIGN KEY ("payment_event_id") REFERENCES "payment_events"("id"),
      CONSTRAINT "CK_webhook_events_status" CHECK ("delivery_status" IN ('PENDING','DELIVERED','FAILED'))
    )`);
    // The dispatcher only ever looks for due PENDING rows.
    await q.query(`CREATE INDEX "IDX_webhook_events_due" ON "webhook_events" ("next_attempt_at") WHERE "delivery_status" = 'PENDING'`);
    await q.query(`CREATE INDEX "IDX_webhook_events_tenant_created" ON "webhook_events" ("tenant_id", "created_at" DESC)`);

    // Security: closed to the Supabase API roles.
    await q.query(`ALTER TABLE "webhook_configs" ENABLE ROW LEVEL SECURITY`);
    await q.query(`ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY`);
    await q.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE public.webhook_configs, public.webhook_events FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE public.webhook_configs, public.webhook_events FROM authenticated;
      END IF;
    END $$;`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "webhook_events"`);
    await q.query(`DROP TABLE "webhook_configs"`);
  }
}
