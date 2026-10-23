// FILE: database/migrations/1700000000005-CreatePayments.ts
// PURPOSE: payments table. No cascade from users: payment records are financial history
// DEPENDENCIES: typeorm, users, payment_providers
// PHASE: 5
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePayments1700000000005 implements MigrationInterface {
  name = 'CreatePayments1700000000005';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "payments" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "tenant_id" uuid NOT NULL,
      "provider_id" uuid NOT NULL,
      "payment_reference" varchar(40) NOT NULL,
      "provider_order_id" varchar,
      "provider_payment_id" varchar,
      "amount" numeric(12,2) NOT NULL,
      "currency" char(3) NOT NULL,
      "status" varchar(16) NOT NULL DEFAULT 'PENDING',
      "customer_name" varchar(255) NOT NULL,
      "customer_email" varchar(255) NOT NULL,
      "customer_phone" varchar(50),
      "metadata" jsonb NOT NULL DEFAULT '{}',
      "checkout_token" varchar(64) NOT NULL,
      "idempotency_key" varchar(255),
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_payments_id" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_payments_reference" UNIQUE ("payment_reference"),
      CONSTRAINT "FK_payments_tenant" FOREIGN KEY ("tenant_id") REFERENCES "users"("id"),
      CONSTRAINT "FK_payments_provider" FOREIGN KEY ("provider_id") REFERENCES "payment_providers"("id"),
      CONSTRAINT "CK_payments_status" CHECK ("status" IN ('PENDING','SUCCESS','FAILED','CANCELLED','REFUNDED')),
      CONSTRAINT "CK_payments_amount" CHECK ("amount" > 0)
    )`);
    await q.query(`CREATE INDEX "IDX_payments_tenant_created" ON "payments" ("tenant_id", "created_at" DESC)`);
    await q.query(`CREATE INDEX "IDX_payments_provider_order" ON "payments" ("provider_id", "provider_order_id")`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_payments_tenant_idempotency" ON "payments" ("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "payments"`);
  }
}
