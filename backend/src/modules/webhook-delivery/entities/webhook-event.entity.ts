// FILE: modules/webhooks/entities/webhook-event.entity.ts
// PURPOSE: webhook_events table: one row per event per delivery, with attempt tracking (docs/merchant-webhooks.md)
// DEPENDENCIES: typeorm
// PHASE: 8
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type DeliveryStatus = 'PENDING' | 'DELIVERED' | 'FAILED';

@Entity({ name: 'webhook_events' })
export class WebhookEvent {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId: string;

  @Column({ name: 'payment_event_id', type: 'uuid' })
  paymentEventId: string;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType: string;

  @Column({ name: 'endpoint_url', type: 'text' })
  endpointUrl: string;

  /** Exactly what is sent. */
  @Column({ name: 'request_payload', type: 'jsonb' })
  requestPayload: Record<string, unknown>;

  @Column({ name: 'response_code', type: 'int', nullable: true })
  responseCode: number | null;

  @Column({ name: 'delivery_status', type: 'varchar', length: 50, default: 'PENDING' })
  deliveryStatus: DeliveryStatus;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount: number;

  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt: Date | null;

  @Column({ name: 'last_attempt_at', type: 'timestamptz', nullable: true })
  lastAttemptAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
