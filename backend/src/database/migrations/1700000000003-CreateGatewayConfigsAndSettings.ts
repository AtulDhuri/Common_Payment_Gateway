// FILE: database/migrations/1700000000003-CreateGatewayConfigsAndSettings.ts
// PURPOSE: payment_gateway_configs and tenant_settings (db-design.md)
// DEPENDENCIES: typeorm, users, payment_providers
// PHASE: 4
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGatewayConfigsAndSettings1700000000003 implements MigrationInterface {
  name = 'CreateGatewayConfigsAndSettings1700000000003';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "payment_gateway_configs" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "tenant_id" uuid NOT NULL,
      "provider_id" uuid NOT NULL,
      "config_json" jsonb NOT NULL,
      "is_verified" boolean NOT NULL DEFAULT false,
      "verified_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_payment_gateway_configs_id" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_payment_gateway_configs_tenant_provider" UNIQUE ("tenant_id", "provider_id"),
      CONSTRAINT "FK_payment_gateway_configs_tenant" FOREIGN KEY ("tenant_id") REFERENCES "users"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_payment_gateway_configs_provider" FOREIGN KEY ("provider_id") REFERENCES "payment_providers"("id")
    )`);
    await q.query(`CREATE TABLE "tenant_settings" (
      "tenant_id" uuid NOT NULL,
      "success_url" varchar,
      "failure_url" varchar,
      CONSTRAINT "PK_tenant_settings_tenant_id" PRIMARY KEY ("tenant_id"),
      CONSTRAINT "FK_tenant_settings_tenant" FOREIGN KEY ("tenant_id") REFERENCES "users"("id") ON DELETE CASCADE
    )`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "tenant_settings"`);
    await q.query(`DROP TABLE "payment_gateway_configs"`);
  }
}
