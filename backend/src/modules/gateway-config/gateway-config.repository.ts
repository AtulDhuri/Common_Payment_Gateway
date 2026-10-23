// FILE: modules/gateway-config/gateway-config.repository.ts
// PURPOSE: DB access for gateway configs and tenant settings. Every method takes tenantId
// DEPENDENCIES: PaymentGatewayConfig, TenantSettings
// PHASE: 4
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentGatewayConfig } from './entities/payment-gateway-config.entity';
import { TenantSettings } from './entities/tenant-settings.entity';

@Injectable()
export class GatewayConfigRepository {
  constructor(
    @InjectRepository(PaymentGatewayConfig) private readonly configs: Repository<PaymentGatewayConfig>,
    @InjectRepository(TenantSettings) private readonly settings: Repository<TenantSettings>,
  ) {}

  /** MVP: one gateway per tenant. Returns the most recently updated one. */
  findForTenant(tenantId: string): Promise<PaymentGatewayConfig | null> {
    return this.configs.findOne({ where: { tenantId }, order: { updatedAt: 'DESC' } });
  }

  findByTenantAndProvider(tenantId: string, providerId: string): Promise<PaymentGatewayConfig | null> {
    return this.configs.findOne({ where: { tenantId, providerId } });
  }

  save(config: PaymentGatewayConfig): Promise<PaymentGatewayConfig> {
    return this.configs.save(config);
  }

  create(values: Partial<PaymentGatewayConfig>): PaymentGatewayConfig {
    return this.configs.create(values);
  }

  findSettings(tenantId: string): Promise<TenantSettings | null> {
    return this.settings.findOne({ where: { tenantId } });
  }

  /** Replaces both URLs (null clears). */
  async setRedirects(tenantId: string, successUrl: string | null, failureUrl: string | null): Promise<void> {
    const row = (await this.settings.findOne({ where: { tenantId } })) ?? this.settings.create({ tenantId });
    row.successUrl = successUrl;
    row.failureUrl = failureUrl;
    await this.settings.save(row);
  }

  async upsertRedirects(tenantId: string, successUrl?: string, failureUrl?: string): Promise<void> {
    const existing = (await this.settings.findOne({ where: { tenantId } })) ?? this.settings.create({
      tenantId,
      successUrl: null,
      failureUrl: null,
    });
    if (successUrl !== undefined) existing.successUrl = successUrl;
    if (failureUrl !== undefined) existing.failureUrl = failureUrl;
    await this.settings.save(existing);
  }
}
