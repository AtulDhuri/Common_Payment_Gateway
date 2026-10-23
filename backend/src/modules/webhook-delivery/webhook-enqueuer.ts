// FILE: modules/webhook-delivery/webhook-enqueuer.ts
// PURPOSE: Queues a delivery in the SAME database transaction that stores the payment event, so an event is never stored without
// its delivery and a rolled-back event is never sent. Does nothing when the merchant has no active endpoint
// DEPENDENCIES: EntityManager (passed in by the caller's transaction)
// PHASE: 8
import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

export interface EnqueueInput {
  tenantId: string;
  paymentId: string;
  paymentEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class WebhookEnqueuer {
  /** @returns true when a delivery was queued */
  async enqueue(manager: EntityManager, input: EnqueueInput): Promise<boolean> {
    const rows: { webhook_url: string }[] = await manager.query(
      'SELECT webhook_url FROM webhook_configs WHERE tenant_id = $1 AND is_active = true',
      [input.tenantId],
    );
    if (rows.length === 0) return false;
    await manager.query(
      `INSERT INTO webhook_events
         (tenant_id, payment_id, payment_event_id, event_type, endpoint_url, request_payload, delivery_status, attempt_count, next_attempt_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'PENDING', 0, now())`,
      [input.tenantId, input.paymentId, input.paymentEventId, input.eventType, rows[0].webhook_url, JSON.stringify(input.payload)],
    );
    return true;
  }
}
