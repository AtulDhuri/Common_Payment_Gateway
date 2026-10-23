// FILE: modules/gateway-config/gateway-config.service.ts
// PURPOSE: Save a verified gateway config (secrets encrypted), return it masked, replace a single secret
// DEPENDENCIES: ProvidersService, VerificationService, CryptoService, AuditService, GatewayConfigRepository
// PHASE: 4
import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/types/app.exception';
import { ErrorCode } from '../../common/types/error-codes';
import { AuditService } from '../audit/audit.service';
import { CryptoService } from '../crypto/crypto.service';
import { PaymentProviderField } from '../providers/entities/payment-provider-field.entity';
import { ProviderConfig } from '../providers/interfaces/payment-provider.interface';
import { ProvidersService } from '../providers/providers.service';
import { VerificationService } from '../providers/verification.service';
import {
  GatewayConfigResponse,
  ReplaceSecretDto,
  ReplaceSecretResponse,
  SaveGatewayConfigDto,
} from './dto/gateway-config.dto';
import { PaymentGatewayConfig } from './entities/payment-gateway-config.entity';
import { GatewayConfigRepository } from './gateway-config.repository';

export const SECRET_MASK = '************';
const ENTITY = 'payment_gateway_config';

@Injectable()
export class GatewayConfigService {
  constructor(
    private readonly repo: GatewayConfigRepository,
    private readonly providers: ProvidersService,
    private readonly verification: VerificationService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  async save(tenantId: string, dto: SaveGatewayConfigDto): Promise<GatewayConfigResponse> {
    const { provider, fields } = await this.providers.getActiveProvider(dto.provider);
    const config = this.providers.validateConfig(fields, dto.config);
    await this.verification.assertVerified(dto.verificationToken, tenantId, provider.code, config);

    const existing = await this.repo.findByTenantAndProvider(tenantId, provider.id);
    const row = existing ?? this.repo.create({ tenantId, providerId: provider.id });
    row.configJson = this.encryptConfig(fields, config);
    row.isVerified = true;
    row.verifiedAt = new Date();
    const saved = await this.repo.save(row);

    if (dto.successUrl !== undefined || dto.failureUrl !== undefined) {
      await this.repo.upsertRedirects(tenantId, dto.successUrl, dto.failureUrl);
    }
    await this.audit.record({
      tenantId,
      action: existing ? 'GATEWAY_CONFIG_UPDATED' : 'GATEWAY_CONFIG_CREATED',
      entity: ENTITY,
      entityId: saved.id,
      payload: { provider: provider.code, fields: Object.keys(config) },
    });
    return this.toMasked(saved, provider.code, fields);
  }

  async get(tenantId: string): Promise<GatewayConfigResponse> {
    const row = await this.repo.findForTenant(tenantId);
    if (!row) throw new AppException(ErrorCode.NOT_FOUND, 'Gateway configuration not found', 404);
    const { provider, fields } = await this.providers.getProviderById(row.providerId);
    return this.toMasked(row, provider.code, fields);
  }

  /** Replace Secret: re-tests the combined config first, then stores only the new encrypted value. */
  async replaceSecret(tenantId: string, dto: ReplaceSecretDto): Promise<ReplaceSecretResponse> {
    const row = await this.repo.findForTenant(tenantId);
    if (!row) throw new AppException(ErrorCode.NOT_FOUND, 'Gateway configuration not found', 404);
    const { provider, fields } = await this.providers.getProviderById(row.providerId);

    const field = fields.find((f) => f.fieldKey === dto.fieldKey);
    if (!field || field.fieldType !== 'secret') {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'fieldKey must be a secret field of this provider', 400, {
        fields: { fieldKey: 'not a secret field' },
      });
    }

    const result = await this.providers.runConnectionTest(provider.code, {
      ...this.decryptConfig(fields, row.configJson),
      [dto.fieldKey]: dto.value,
    });
    if (!result.success) throw new AppException(ErrorCode.CONNECTION_FAILED, result.message, 400);

    row.configJson = { ...row.configJson, [dto.fieldKey]: this.crypto.encrypt(dto.value) };
    row.isVerified = true;
    row.verifiedAt = new Date();
    const saved = await this.repo.save(row);
    await this.audit.record({
      tenantId,
      action: 'GATEWAY_SECRET_REPLACED',
      entity: ENTITY,
      entityId: saved.id,
      payload: { provider: provider.code, fieldKey: dto.fieldKey },
    });
    return { fieldKey: dto.fieldKey, configured: true };
  }

  /**
   * Runs `fn` with the tenant's decrypted config. The values exist only for the duration of the
   * callback, so callers cannot hold on to them (security-design.md). Requires a verified config.
   */
  async withProviderConfig<T>(
    tenantId: string,
    fn: (ctx: { providerId: string; providerCode: string; config: ProviderConfig }) => Promise<T>,
    providerId?: string,
  ): Promise<T> {
    const row = providerId
      ? await this.repo.findByTenantAndProvider(tenantId, providerId)
      : await this.repo.findForTenant(tenantId);
    if (!row || !row.isVerified) {
      throw new AppException(ErrorCode.CONFIG_NOT_VERIFIED, 'No verified gateway configuration found', 400);
    }
    const { provider, fields } = await this.providers.getProviderById(row.providerId);
    return fn({
      providerId: provider.id,
      providerCode: provider.code,
      config: this.decryptConfig(fields, row.configJson),
    });
  }

  /** Non-secret values only (for example key_id, which the checkout widget needs). */
  async getPublicFields(tenantId: string, providerId: string): Promise<Record<string, string>> {
    const row = await this.repo.findByTenantAndProvider(tenantId, providerId);
    if (!row) return {};
    const { fields } = await this.providers.getProviderById(providerId);
    const out: Record<string, string> = {};
    for (const f of fields) {
      const v = row.configJson[f.fieldKey];
      if (f.fieldType === 'text' && v !== undefined) out[f.fieldKey] = v;
    }
    return out;
  }

  /**
   * 'live' when the saved gateway key is a live key, otherwise 'test' (also when nothing is configured).
   * Only the non-secret key id is read.
   */
  async getKeyMode(tenantId: string): Promise<'live' | 'test'> {
    const row = await this.repo.findForTenant(tenantId);
    return row?.configJson['key_id']?.startsWith('rzp_live_') ? 'live' : 'test';
  }

  async getRedirects(tenantId: string): Promise<{ successUrl: string | null; failureUrl: string | null }> {
    const s = await this.repo.findSettings(tenantId);
    return { successUrl: s?.successUrl ?? null, failureUrl: s?.failureUrl ?? null };
  }

  private encryptConfig(fields: PaymentProviderField[], config: ProviderConfig): Record<string, string> {
    const secrets = new Set(fields.filter((f) => f.fieldType === 'secret').map((f) => f.fieldKey));
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(config)) out[k] = secrets.has(k) ? this.crypto.encrypt(v) : v;
    return out;
  }

  /** Result must stay local to the caller and go straight to a provider call. */
  private decryptConfig(fields: PaymentProviderField[], stored: Record<string, string>): ProviderConfig {
    const secrets = new Set(fields.filter((f) => f.fieldType === 'secret').map((f) => f.fieldKey));
    const out: ProviderConfig = {};
    for (const [k, v] of Object.entries(stored)) out[k] = secrets.has(k) ? this.crypto.decrypt(v) : v;
    return out;
  }

  private toMasked(row: PaymentGatewayConfig, code: string, fields: PaymentProviderField[]): GatewayConfigResponse {
    const out: Record<string, string> = {};
    for (const f of fields) {
      const value = row.configJson[f.fieldKey];
      if (value === undefined) continue;
      out[f.fieldKey] = f.fieldType === 'secret' ? SECRET_MASK : value;
    }
    return { provider: code, isVerified: row.isVerified, verifiedAt: row.verifiedAt, fields: out };
  }
}
