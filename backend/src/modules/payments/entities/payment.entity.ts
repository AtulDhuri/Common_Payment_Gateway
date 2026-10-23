// FILE: modules/payments/entities/payment.entity.ts
// PURPOSE: payments table (db-design.md + docs/razorpay-integration.md)
// DEPENDENCIES: typeorm, PaymentStatus
// PHASE: 5
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { PaymentStatus } from '../payment-status';

@Entity({ name: 'payments' })
export class Payment {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId: string;

  @Column({ name: 'payment_reference', type: 'varchar', length: 40, unique: true })
  paymentReference: string;

  @Column({ name: 'provider_order_id', type: 'varchar', nullable: true })
  providerOrderId: string | null;

  @Column({ name: 'provider_payment_id', type: 'varchar', nullable: true })
  providerPaymentId: string | null;

  /** numeric(12,2) comes back from pg as a string, so convert on read. */
  @Column({
    name: 'amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: { to: (v: number): number => v, from: (v: string | number): number => Number(v) },
  })
  amount: number;

  @Column({ name: 'currency', type: 'char', length: 3 })
  currency: string;

  @Column({ name: 'status', type: 'varchar', length: 16, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ name: 'customer_name', type: 'varchar', length: 255 })
  customerName: string;

  @Column({ name: 'customer_email', type: 'varchar', length: 255 })
  customerEmail: string;

  @Column({ name: 'customer_phone', type: 'varchar', length: 50, nullable: true })
  customerPhone: string | null;

  @Column({ name: 'metadata', type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @Column({ name: 'checkout_token', type: 'varchar', length: 64 })
  checkoutToken: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 255, nullable: true })
  idempotencyKey: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
