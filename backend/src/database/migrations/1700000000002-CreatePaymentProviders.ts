// FILE: database/migrations/1700000000002-CreatePaymentProviders.ts
// PURPOSE: payment_providers and payment_provider_fields (db-design.md)
// DEPENDENCIES: typeorm
// PHASE: 4
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentProviders1700000000002 implements MigrationInterface {
  name = 'CreatePaymentProviders1700000000002';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "payment_providers" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "code" varchar(32) NOT NULL,
      "name" varchar(100) NOT NULL,
      "is_active" boolean NOT NULL DEFAULT false,
      CONSTRAINT "PK_payment_providers_id" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_payment_providers_code" UNIQUE ("code")
    )`);
    await q.query(`CREATE TABLE "payment_provider_fields" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "provider_id" uuid NOT NULL,
      "field_key" varchar(64) NOT NULL,
      "field_label" varchar(100) NOT NULL,
      "field_type" varchar(16) NOT NULL,
      "is_required" boolean NOT NULL,
      "display_order" int NOT NULL,
      CONSTRAINT "PK_payment_provider_fields_id" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_payment_provider_fields_provider_key" UNIQUE ("provider_id", "field_key"),
      CONSTRAINT "FK_payment_provider_fields_provider" FOREIGN KEY ("provider_id") REFERENCES "payment_providers"("id") ON DELETE CASCADE,
      CONSTRAINT "CK_payment_provider_fields_type" CHECK ("field_type" IN ('text','secret'))
    )`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "payment_provider_fields"`);
    await q.query(`DROP TABLE "payment_providers"`);
  }
}
