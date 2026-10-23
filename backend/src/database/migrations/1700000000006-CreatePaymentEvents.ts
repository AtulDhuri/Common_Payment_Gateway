// FILE: database/migrations/1700000000006-CreatePaymentEvents.ts
// PURPOSE: payment_events table (delivery columns are used from Phase 8)
// DEPENDENCIES: typeorm, payments
// PHASE: 5
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentEvents1700000000006 implements MigrationInterface {
  name = 'CreatePaymentEvents1700000000006';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "payment_events" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "payment_id" uuid NOT NULL,
      "event_type" varchar(32) NOT NULL,
      "payload" jsonb NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "delivery_status" varchar(16) NOT NULL DEFAULT 'NOT_REQUIRED',
      "delivery_attempts" int NOT NULL DEFAULT 0,
      "next_attempt_at" timestamptz,
      "last_response_code" int,
      CONSTRAINT "PK_payment_events_id" PRIMARY KEY ("id"),
      CONSTRAINT "FK_payment_events_payment" FOREIGN KEY ("payment_id") REFERENCES "payments"("id"),
      CONSTRAINT "CK_payment_events_delivery" CHECK ("delivery_status" IN ('NOT_REQUIRED','PENDING','DELIVERED','FAILED'))
    )`);
    await q.query(`CREATE INDEX "IDX_payment_events_payment_created" ON "payment_events" ("payment_id", "created_at")`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "payment_events"`);
  }
}
