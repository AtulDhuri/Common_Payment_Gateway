// FILE: database/migrations/1700000000007-CreateApiCredentials.ts
// PURPOSE: api_credentials table (docs/api-credentials.md), reversible
// DEPENDENCIES: typeorm, users
// PHASE: 6
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateApiCredentials1700000000007 implements MigrationInterface {
  name = 'CreateApiCredentials1700000000007';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "api_credentials" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "tenant_id" uuid NOT NULL,
      "name" varchar(255) NOT NULL,
      "public_key" varchar(255) NOT NULL,
      "secret_key_hash" varchar(500) NOT NULL,
      "last_used_at" timestamptz,
      "is_active" boolean NOT NULL DEFAULT true,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_api_credentials_id" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_api_credentials_public_key" UNIQUE ("public_key"),
      CONSTRAINT "FK_api_credentials_tenant" FOREIGN KEY ("tenant_id") REFERENCES "users"("id") ON DELETE CASCADE
    )`);
    await q.query(`CREATE INDEX "IDX_api_credentials_tenant_created" ON "api_credentials" ("tenant_id", "created_at" DESC)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "api_credentials"`);
  }
}
