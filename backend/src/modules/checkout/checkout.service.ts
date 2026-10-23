// FILE: modules/checkout/checkout.service.ts
// PURPOSE: Hosted checkout: page data, confirm a payment from the widget response, cancel. Protected by the checkout token
// DEPENDENCIES: PaymentsRepository, PaymentsService, GatewayConfigService, ProviderRegistry, ProvidersService, MerchantService, CryptoService
// PHASE: 5 (minimum for taking a payment; page polish and success/failure pages are Phase 7)
import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/types/app.exception';
import { ErrorCode } from '../../common/types/error-codes';
import { CryptoService } from '../crypto/crypto.service';
import { GatewayConfigService } from '../gateway-config/gateway-config.service';
import { MerchantService } from '../merchant/merchant.service';
import { Payment } from '../payments/entities/payment.entity';
import { PaymentStatus } from '../payments/payment-status';
import { PaymentsRepository } from '../payments/payments.repository';
import { PaymentsService, toMinorUnits } from '../payments/payments.service';
import { ProvidersService } from '../providers/providers.service';
import { ProviderRegistry } from '../providers/registry/provider.registry';
import { CheckoutResultResponse, CompleteCheckoutDto } from './dto/checkout.dto';
import { CheckoutView } from './checkout.page';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly repo: PaymentsRepository,
    private readonly payments: PaymentsService,
    private readonly gateway: GatewayConfigService,
    private readonly registry: ProviderRegistry,
    private readonly providers: ProvidersService,
    private readonly merchants: MerchantService,
    private readonly crypto: CryptoService,
  ) {}

  async getView(reference: string, token: string): Promise<CheckoutView> {
    const payment = await this.load(reference, token);
    const businessName = (await this.merchants.findBusinessName(payment.tenantId)) ?? 'Payment';

    if (payment.status !== PaymentStatus.PENDING || !payment.providerOrderId) {
      const { redirectUrl } = await this.result(payment);
      return {
        kind: 'done',
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        businessName,
        reference: payment.paymentReference,
        returnUrl: redirectUrl,
      };
    }
    // key_id is public by design (it is sent to every customer's browser). Secrets never reach this service.
    const publicFields = await this.gateway.getPublicFields(payment.tenantId, payment.providerId);
    const keyId = publicFields['key_id'];
    if (!keyId) throw new AppException(ErrorCode.CONFIG_NOT_VERIFIED, 'Gateway is not configured', 400);
    return {
      kind: 'pay',
      keyId,
      orderId: payment.providerOrderId,
      amountMinor: toMinorUnits(payment.amount),
      currency: payment.currency,
      businessName,
      reference: payment.paymentReference,
      prefill: { name: payment.customerName, email: payment.customerEmail, contact: payment.customerPhone ?? '' },
    };
  }

  async complete(reference: string, token: string, dto: CompleteCheckoutDto): Promise<CheckoutResultResponse> {
    const payment = await this.load(reference, token);
    if (payment.status === PaymentStatus.SUCCESS) return this.result(payment);
    if (!payment.providerOrderId) {
      throw new AppException(ErrorCode.INVALID_STATE, 'Payment has no gateway order', 400);
    }

    // Verified against OUR stored order id, never the one the browser sent.
    const check = await this.gateway.withProviderConfig(
      payment.tenantId,
      async (ctx) => ({
        providerCode: ctx.providerCode,
        valid: this.registry.get(ctx.providerCode).verifyPayment(ctx.config, {
          providerOrderId: payment.providerOrderId as string,
          providerPaymentId: dto.razorpay_payment_id,
          signature: dto.razorpay_signature,
        }),
      }),
      payment.providerId,
    );
    if (!check.valid) throw new AppException(ErrorCode.INVALID_STATE, 'Payment verification failed', 400);

    const updated = await this.payments.applyOutcome(
      payment,
      check.providerCode,
      PaymentStatus.SUCCESS,
      dto.razorpay_payment_id,
    );
    return this.result(updated);
  }

  async cancel(reference: string, token: string): Promise<CheckoutResultResponse> {
    const payment = await this.load(reference, token);
    const { provider } = await this.providers.getProviderById(payment.providerId);
    const updated = await this.payments.applyOutcome(payment, provider.code, PaymentStatus.CANCELLED, null);
    return this.result(updated);
  }

  /** Unknown reference and wrong token look identical, so references cannot be probed. */
  private async load(reference: string, token: string): Promise<Payment> {
    const payment = await this.repo.findByReferenceForCheckout(reference);
    if (!payment || !this.crypto.safeEqual(payment.checkoutToken, token)) {
      throw new AppException(ErrorCode.PAYMENT_NOT_FOUND, 'Payment not found', 404);
    }
    return payment;
  }

  private async result(payment: Payment): Promise<CheckoutResultResponse> {
    const { successUrl, failureUrl } = await this.gateway.getRedirects(payment.tenantId);
    const base =
      payment.status === PaymentStatus.SUCCESS
        ? successUrl
        : payment.status === PaymentStatus.FAILED || payment.status === PaymentStatus.CANCELLED
          ? failureUrl
          : null;
    return { status: payment.status, redirectUrl: base ? this.withParams(base, payment) : null };
  }

  private withParams(base: string, payment: Payment): string | null {
    try {
      const url = new URL(base);
      url.searchParams.set('paymentId', payment.paymentReference);
      url.searchParams.set('status', payment.status);
      return url.toString();
    } catch {
      return null;
    }
  }
}
