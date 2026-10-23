// FILE: modules/webhooks/gateway-webhook.service.ts
// PURPOSE: Razorpay webhook intake: locate payment by order id, verify signature with the tenant's webhook secret, apply the outcome
// DEPENDENCIES: PaymentsService, PaymentsRepository, GatewayConfigService, ProviderRegistry, ProvidersService
// PHASE: 5
import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/types/app.exception';
import { ErrorCode } from '../../common/types/error-codes';
import { GatewayConfigService } from '../gateway-config/gateway-config.service';
import { PaymentsRepository } from '../payments/payments.repository';
import { PaymentsService } from '../payments/payments.service';
import { PaymentStatus } from '../payments/payment-status';
import { ProvidersService } from '../providers/providers.service';
import { ProviderRegistry } from '../providers/registry/provider.registry';

const PROVIDER_CODE = 'RAZORPAY';

export interface WebhookResult {
  received: true;
}

@Injectable()
export class GatewayWebhookService {
  private readonly logger = new Logger(GatewayWebhookService.name);

  constructor(
    private readonly registry: ProviderRegistry,
    private readonly providers: ProvidersService,
    private readonly payments: PaymentsService,
    private readonly paymentsRepo: PaymentsRepository,
    private readonly gateway: GatewayConfigService,
  ) {}

  /**
   * Always answers 200 for events that are valid but irrelevant (unknown order, event types we do not
   * track) so Razorpay does not keep retrying them. Only a bad signature or a malformed body is rejected.
   */
  async handleRazorpay(rawBody: Buffer | undefined, signature: string | undefined): Promise<WebhookResult> {
    if (!rawBody || rawBody.length === 0) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Empty webhook body', 400);
    }
    const provider = this.registry.get(PROVIDER_CODE);
    const event = provider.normalizeWebhook(rawBody);
    if (!event) throw new AppException(ErrorCode.VALIDATION_ERROR, 'Unrecognized webhook payload', 400);
    if (!event.providerOrderId) return { received: true };

    const { provider: providerEntity } = await this.providers.getActiveProvider(PROVIDER_CODE);
    // The body is untrusted until the signature passes. Here it only selects which secret to check with.
    const payment = await this.paymentsRepo.findByProviderOrder(providerEntity.id, event.providerOrderId);
    if (!payment) return { received: true };

    const valid = await this.signatureIsValid(payment.tenantId, providerEntity.id, rawBody, signature ?? '');
    if (!valid) throw new AppException(ErrorCode.UNAUTHORIZED, 'Invalid webhook signature', 401);

    this.logger.log(`Razorpay event ${event.eventType} for ${payment.paymentReference}`);
    if (event.status === null) return { received: true };

    const target = this.payments.fromNormalized(event.status);
    if (target === PaymentStatus.SUCCESS && !this.payments.matchesAmount(payment, event.amountMinor, event.currency)) {
      this.logger.warn(`Ignoring ${event.eventType} for ${payment.paymentReference}: amount or currency mismatch`);
      return { received: true };
    }
    await this.payments.applyOutcome(payment, PROVIDER_CODE, target, event.providerPaymentId);
    return { received: true };
  }

  private async signatureIsValid(
    tenantId: string,
    providerId: string,
    rawBody: Buffer,
    signature: string,
  ): Promise<boolean> {
    try {
      return await this.gateway.withProviderConfig(
        tenantId,
        async (ctx) =>
          this.registry
            .get(ctx.providerCode)
            .verifyWebhookSignature(rawBody, signature, ctx.config['webhook_secret'] ?? ''),
        providerId,
      );
    } catch (err) {
      // No verified config for this tenant, so nothing to verify against.
      if (err instanceof AppException) return false;
      throw err;
    }
  }
}
