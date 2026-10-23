// FILE: database/migrations/1700000000001-CreateMerchantProfiles.ts
// PURPOSE: Create merchant_profiles per docs/merchant-profile.md (reversible)
// DEPENDENCIES: typeorm, users table
// PHASE: 3
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMerchantProfiles1700000000001 implements MigrationInterface {
  name = 'CreateMerchantProfiles1700000000001';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "merchant_profiles" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL,
      "business_name" varchar(255) NOT NULL,
      "business_email" varchar(255) NOT NULL,
      "support_email" varchar(255),
      "website" varchar(500),
      "phone" varchar(50),
      "country" varchar(100),
      "currency" varchar(10) NOT NULL DEFAULT 'INR',
      "timezone" varchar(100) NOT NULL DEFAULT 'Asia/Kolkata',
      "status" varchar(50) NOT NULL DEFAULT 'ACTIVE',
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_merchant_profiles_id" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_merchant_profiles_user_id" UNIQUE ("user_id"),
      CONSTRAINT "FK_merchant_profiles_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
      CONSTRAINT "CK_merchant_profiles_status" CHECK ("status" IN ('ACTIVE','INACTIVE','SUSPENDED'))
    )`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "merchant_profiles"`);
  }
}
