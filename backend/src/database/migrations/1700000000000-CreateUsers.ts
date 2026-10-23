// FILE: database/migrations/1700000000000-CreateUsers.ts
// PURPOSE: Create users table per db-design.md (reversible)
// DEPENDENCIES: typeorm
// PHASE: 2
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsers1700000000000 implements MigrationInterface {
  name = 'CreateUsers1700000000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "users" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "email" varchar(255) NOT NULL,
      "password_hash" varchar NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_users_email" UNIQUE ("email")
    )`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "users"`);
  }
}
