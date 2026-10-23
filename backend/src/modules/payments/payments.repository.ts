// FILE: modules/payments/payments.repository.ts
// PURPOSE: DB access for payments and payment_events. Status changes are compare-and-set inside a transaction
// DEPENDENCIES: Payment, PaymentEvent, typeorm DataSource
// PHASE: 5
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaymentEvent } from './entities/payment-event.entity';
import { Payment } from './entities/payment.entity';
import { PaymentStatus } from './payment-status';
import { WebhookEnqueuer } from '../webhook-delivery/webhook-enqueuer';

export interface NewEvent {
  eventType: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class PaymentsRepository {
  constructor(
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    private readonly dataSource: DataSource,
    private readonly webhooks: WebhookEnqueuer,
  ) {}

  findByReference(tenantId: string, paymentReference: string): Promise<Payment | null> {
    return this.payments.findOne({ where: { tenantId, paymentReference } });
  }

  findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<Payment | null> {
    return this.payments.findOne({ where: { tenantId, idempotencyKey } });
  }

  /** Public lookup for hosted checkout. The caller must check the checkout token. */
  findByReferenceForCheckout(paymentReference: string): Promise<Payment | null> {
    return this.payments.findOne({ where: { paymentReference } });
  }

  findByProviderOrder(providerId: string, providerOrderId: string): Promise<Payment | null> {
    return this.payments.findOne({ where: { providerId, providerOrderId } });
  }

  /** Newest first. */
  listByTenant(tenantId: string, page: number, limit: number): Promise<[Payment[], number]> {
    return this.payments.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  findById(tenantId: string, id: string): Promise<Payment | null> {
    return this.payments.findOne({ where: { tenantId, id } });
  }

  /** Inserts the payment and its first event atomically. */
  createWithEvent(values: Partial<Payment>, buildEvent: (saved: Payment) => NewEvent): Promise<Payment> {
    return this.dataSource.transaction(async (m) => {
      const saved = await m.save(Payment, m.create(Payment, values));
      const ev = buildEvent(saved);
      const stored = await m.save(PaymentEvent, m.create(PaymentEvent, { paymentId: saved.id, ...ev }));
      // Same transaction: the event and its webhook delivery are stored together or not at all.
      await this.webhooks.enqueue(m, { tenantId: saved.tenantId, paymentId: saved.id, paymentEventId: stored.id, eventType: ev.eventType, payload: ev.payload });
      return saved;
    });
  }

  /**
   * Moves a payment from `from` to `to` only if it is still in `from`. Returns false when another
   * request got there first, so concurrent webhook + checkout calls store one event, not two.
   */
  transition(
    tenantId: string,
    paymentId: string,
    from: PaymentStatus,
    to: PaymentStatus,
    providerPaymentId: string | null,
    buildEvent: (current: Payment) => NewEvent,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (m) => {
      const result = await m
        .createQueryBuilder()
        .update(Payment)
        .set({ status: to, ...(providerPaymentId ? { providerPaymentId } : {}) })
        .where('id = :id AND tenant_id = :tenantId AND status = :from', { id: paymentId, tenantId, from })
        .execute();
      if (!result.affected) return false;
      const updated = await m.findOneOrFail(Payment, { where: { id: paymentId, tenantId } });
      const ev = buildEvent(updated);
      const stored = await m.save(PaymentEvent, m.create(PaymentEvent, { paymentId, ...ev }));
      await this.webhooks.enqueue(m, { tenantId, paymentId, paymentEventId: stored.id, eventType: ev.eventType, payload: ev.payload });
      return true;
    });
  }
}
