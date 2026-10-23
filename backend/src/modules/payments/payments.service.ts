// FILE: modules/payments/payments.service.ts
// PURPOSE: Create payments (Razorpay order + checkout URL), read status (refreshing PENDING from the gateway), apply outcomes
// DEPENDENCIES: PaymentsRepository, GatewayConfigService, ProviderRegistry, AuditService, CryptoService
// PHASE: 5
import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/types/app.exception';
import { ErrorCode } from '../../common/types/error-codes';
import { APP_CONFIG } from '../../config/config.module';
import { AppConfig } from '../../config/configuration';
import { AuditService } from '../audit/audit.service';
import { CryptoService } from '../crypto/crypto.service';
import { GatewayConfigService } from '../gateway-config/gateway-config.service';
import { NormalizedStatus, ProviderCallError } from '../providers/interfaces/payment-provider.interface';
import { ProviderRegistry } from '../providers/registry/provider.registry';
import { CreatePaymentDto, CreatePaymentResponse, PaymentStatusResponse } from './dto/payments.dto';
import { Payment } from './entities/payment.entity';
import { canTransition, EVENT_FOR_STATUS, PaymentStatus } from './payment-status';
import { PaymentsRepository } from './payments.repository';

const PG_UNIQUE_VIOLATION = '23505';
const MAX_IDEMPOTENCY_KEY = 255;

export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly repo: PaymentsRepository,
    private readonly gateway: GatewayConfigService,
    private readonly registry: ProviderRegistry,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(tenantId: string, dto: CreatePaymentDto, idempotencyKey?: string): Promise<CreatePaymentResponse> {
    if (idempotencyKey !== undefined) {
      if (idempotencyKey.length === 0 || idempotencyKey.length > MAX_IDEMPOTENCY_KEY) {
        throw new AppException(ErrorCode.VALIDATION_ERROR, 'Idempotency-Key must be 1-255 characters', 400);
      }
      const existing = await this.repo.findByIdempotencyKey(tenantId, idempotencyKey);
      if (existing) return this.toCreateResponse(existing);
    }

    const reference = `pay_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const order = await this.gateway.withProviderConfig(tenantId, async (ctx) => {
      try {
        const result = await this.registry.get(ctx.providerCode).createOrder(ctx.config, {
          amountMinor: toMinorUnits(dto.amount),
          currency: dto.currency,
          receipt: reference,
        });
        return { ...result, providerId: ctx.providerId, providerCode: ctx.providerCode };
      } catch (err) {
        throw this.providerError(err);
      }
    });

    let payment: Payment;
    try {
      payment = await this.repo.createWithEvent(
        {
          tenantId,
          providerId: order.providerId,
          paymentReference: reference,
          providerOrderId: order.providerOrderId,
          amount: dto.amount,
          currency: dto.currency,
          status: PaymentStatus.PENDING,
          customerName: dto.customer.name,
          customerEmail: dto.customer.email,
          customerPhone: dto.customer.phone ?? null,
          metadata: dto.metadata ?? {},
          checkoutToken: randomBytes(24).toString('base64url'),
          idempotencyKey: idempotencyKey ?? null,
        },
        (saved) => ({
          eventType: 'PAYMENT_CREATED',
          payload: this.buildEventPayload(saved, 'PAYMENT_CREATED', order.providerCode),
        }),
      );
    } catch (err) {
      // Two requests with the same Idempotency-Key raced. Return the winner.
      if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION && idempotencyKey !== undefined) {
        const winner = await this.repo.findByIdempotencyKey(tenantId, idempotencyKey);
        if (winner) return this.toCreateResponse(winner);
      }
      throw err;
    }

    await this.audit.record({
      tenantId,
      action: 'PAYMENT_CREATED',
      entity: 'payment',
      entityId: payment.id,
      payload: { paymentReference: payment.paymentReference },
    });
    return this.toCreateResponse(payment);
  }

  async get(tenantId: string, paymentReference: string): Promise<PaymentStatusResponse> {
    let payment = await this.repo.findByReference(tenantId, paymentReference);
    if (!payment) throw new AppException(ErrorCode.PAYMENT_NOT_FOUND, 'Payment not found', 404);
    if (payment.status === PaymentStatus.PENDING) payment = await this.refreshFromProvider(payment);
    return {
      paymentId: payment.paymentReference,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      transactionId: payment.providerPaymentId,
    };
  }

  /**
   * Applies a status the gateway reported. Invalid or repeated transitions are ignored, so webhooks,
   * checkout confirmation and status polling can all call this safely in any order.
   * Returns the latest payment row.
   */
  async applyOutcome(
    payment: Payment,
    providerCode: string,
    target: PaymentStatus,
    providerPaymentId: string | null,
  ): Promise<Payment> {
    if (payment.status === target || !canTransition(payment.status, target)) return payment;
    const eventType = EVENT_FOR_STATUS[target];
    if (!eventType) return payment;

    const applied = await this.repo.transition(
      payment.tenantId,
      payment.id,
      payment.status,
      target,
      providerPaymentId,
      (current) => ({ eventType, payload: this.buildEventPayload(current, eventType, providerCode) }),
    );
    if (applied) {
      const action = target === PaymentStatus.SUCCESS ? 'PAYMENT_COMPLETED' : target === PaymentStatus.FAILED ? 'PAYMENT_FAILED' : null;
      if (action) {
        await this.audit.record({
          tenantId: payment.tenantId,
          action,
          entity: 'payment',
          entityId: payment.id,
          payload: { paymentReference: payment.paymentReference },
        });
      }
    }
    return (await this.repo.findById(payment.tenantId, payment.id)) ?? payment;
  }

  /** True when the gateway-reported amount and currency match what we stored. */
  matchesAmount(payment: Payment, amountMinor: number | null, currency: string | null): boolean {
    return amountMinor === toMinorUnits(payment.amount) && currency?.toUpperCase() === payment.currency.toUpperCase();
  }

  fromNormalized(status: NormalizedStatus): PaymentStatus {
    return PaymentStatus[status];
  }

  private async refreshFromProvider(payment: Payment): Promise<Payment> {
    try {
      const { details, providerCode } = await this.gateway.withProviderConfig(
        payment.tenantId,
        async (ctx) => ({
          providerCode: ctx.providerCode,
          details: await this.registry.get(ctx.providerCode).getPaymentDetails(ctx.config, {
            providerOrderId: payment.providerOrderId,
            providerPaymentId: payment.providerPaymentId,
          }),
        }),
        payment.providerId,
      );
      if (details.status === 'PENDING') return payment;
      // Never trust a result for a different amount (SUCCESS only; failures carry no money).
      if (details.status === 'SUCCESS' && !this.matchesAmount(payment, details.amountMinor, details.currency)) {
        this.logger.warn(`Amount mismatch while refreshing ${payment.paymentReference}`);
        return payment;
      }
      return await this.applyOutcome(payment, providerCode, this.fromNormalized(details.status), details.providerPaymentId);
    } catch (err) {
      // The stored status is still correct. Report it rather than failing the read.
      this.logger.warn(`Status refresh failed for ${payment.paymentReference}: ${err instanceof Error ? err.message : 'error'}`);
      return payment;
    }
  }

  /** Normalized payload (api-design.md). Identical for every gateway. */
  buildEventPayload(payment: Payment, event: string, gatewayCode: string): Record<string, unknown> {
    return {
      event,
      paymentId: payment.paymentReference,
      transactionId: payment.providerPaymentId,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      gateway: gatewayCode,
      customerId: `cust_${this.crypto.sha256Hex(`${payment.tenantId}:${payment.customerEmail.toLowerCase()}`).slice(0, 16)}`,
      timestamp: new Date().toISOString(),
      metadata: payment.metadata,
    };
  }

  private toCreateResponse(payment: Payment): CreatePaymentResponse {
    return {
      paymentId: payment.paymentReference,
      status: payment.status,
      checkoutUrl: `${this.config.publicBaseUrl}/api/v1/checkout/${payment.paymentReference}?t=${encodeURIComponent(payment.checkoutToken)}`,
    };
  }

  private providerError(err: unknown): AppException {
    const message = err instanceof ProviderCallError ? err.message : 'Could not reach the payment gateway';
    return new AppException(ErrorCode.PROVIDER_ERROR, message, 502);
  }
}
