// FILE: modules/providers/registry/provider.registry.ts
// PURPOSE: Resolves a provider code to its PaymentProvider implementation
// DEPENDENCIES: RazorpayProvider
// PHASE: 4
import { Injectable } from '@nestjs/common';
import { AppException } from '../../../common/types/app.exception';
import { ErrorCode } from '../../../common/types/error-codes';
import { PaymentProvider } from '../interfaces/payment-provider.interface';
import { RazorpayProvider } from '../razorpay/razorpay.provider';

@Injectable()
export class ProviderRegistry {
  private readonly providers = new Map<string, PaymentProvider>();

  constructor(razorpay: RazorpayProvider) {
    for (const p of [razorpay]) this.providers.set(p.code, p);
  }

  get(code: string): PaymentProvider {
    const provider = this.providers.get(code);
    if (!provider) throw new AppException(ErrorCode.PROVIDER_NOT_FOUND, 'Provider not found', 404);
    return provider;
  }
}
