// FILE: modules/payments/entities/payment-event.entity.ts
// PURPOSE: payment_events table (db-design.md). Stores the normalized payload exactly as it is sent to the merchant. Delivery tracking lives in webhook_events
// DEPENDENCIES: typeorm
// PHASE: 5
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'payment_events' })
export class PaymentEvent {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId: string;

  @Column({ name: 'event_type', type: 'varchar', length: 32 })
  eventType: string;

  @Column({ name: 'payload', type: 'jsonb' })
  payload: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
