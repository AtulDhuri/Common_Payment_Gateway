// FILE: database/migrations/1700000000004-CreateAuditLogs.ts
// PURPOSE: audit_logs (db-design.md). Append-only: the app has no update/delete path. tenant_id has no FK so history survives user deletion
// DEPENDENCIES: typeorm
// PHASE: 4
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogs1700000000004 implements MigrationInterface {
  name = 'CreateAuditLogs1700000000004';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "audit_logs" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "tenant_id" uuid NOT NULL,
      "action" varchar NOT NULL,
      "entity" varchar NOT NULL,
      "entity_id" uuid NOT NULL,
      "payload" jsonb NOT NULL DEFAULT '{}',
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_audit_logs_id" PRIMARY KEY ("id")
    )`);
    await q.query(`CREATE INDEX "IDX_audit_logs_tenant_created" ON "audit_logs" ("tenant_id", "created_at" DESC)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "audit_logs"`);
  }
}
