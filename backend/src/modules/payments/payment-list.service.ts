// FILE: modules/payments/payment-list.service.ts
// PURPOSE: Paged, tenant-scoped payment list for the dashboard/sandbox
// DEPENDENCIES: PaymentsRepository, ProvidersService, AppConfig
// PHASE: 5
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config.module';
import { AppConfig } from '../../config/configuration';
import { ProvidersService } from '../providers/providers.service';
import { PaymentListItem, PaymentListResponse } from './dto/payment-list.dto';
import { Payment } from './entities/payment.entity';
import { PaymentStatus } from './payment-status';
import { PaymentsRepository } from './payments.repository';

const DEFAULT_LIMIT = 10;

@Injectable()
export class PaymentListService {
  constructor(
    private readonly repo: PaymentsRepository,
    private readonly providers: ProvidersService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async list(tenantId: string, page = 1, limit = DEFAULT_LIMIT): Promise<PaymentListResponse> {
    const [rows, total] = await this.repo.listByTenant(tenantId, page, limit);
    const codes = new Map<string, string>();
    for (const id of new Set(rows.map((r) => r.providerId))) {
      codes.set(id, (await this.providers.getProviderById(id)).provider.code);
    }
    return { items: rows.map((r) => this.toItem(r, codes.get(r.providerId) ?? 'UNKNOWN')), page, limit, total };
  }

  private toItem(p: Payment, gateway: string): PaymentListItem {
    return {
      paymentId: p.paymentReference,
      status: p.status,
      amount: p.amount,
      currency: p.currency,
      gateway,
      transactionId: p.providerPaymentId,
      metadata: p.metadata,
      createdAt: p.createdAt,
      checkoutUrl:
        p.status === PaymentStatus.PENDING
          ? `${this.config.publicBaseUrl}/api/v1/checkout/${p.paymentReference}?t=${encodeURIComponent(p.checkoutToken)}`
          : null,
    };
  }
}
