// FILE: modules/providers/providers.service.ts
// PURPOSE: Provider catalog, dynamic fields, config validation, test connection
// DEPENDENCIES: ProvidersRepository, ProviderRegistry, VerificationService
// PHASE: 4
import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/types/app.exception';
import { ErrorCode } from '../../common/types/error-codes';
import { ConnectionTestResponse, FieldResponse, ProviderResponse } from './dto/providers.dto';
import { PaymentProviderEntity } from './entities/payment-provider.entity';
import { PaymentProviderField } from './entities/payment-provider-field.entity';
import { ProviderConfig } from './interfaces/payment-provider.interface';
import { ProviderRegistry } from './registry/provider.registry';
import { ProvidersRepository } from './providers.repository';
import { VerificationService } from './verification.service';

const MAX_VALUE_LENGTH = 1024;

export interface ActiveProvider {
  provider: PaymentProviderEntity;
  fields: PaymentProviderField[];
}

@Injectable()
export class ProvidersService {
  constructor(
    private readonly repo: ProvidersRepository,
    private readonly registry: ProviderRegistry,
    private readonly verification: VerificationService,
  ) {}

  async listActive(): Promise<ProviderResponse[]> {
    return (await this.repo.findActive()).map((p) => ({ code: p.code, name: p.name }));
  }

  async getFields(code: string): Promise<FieldResponse[]> {
    const { fields } = await this.getActiveProvider(code);
    return fields.map((f) => ({
      fieldKey: f.fieldKey,
      label: f.fieldLabel,
      type: f.fieldType,
      required: f.isRequired,
      order: f.displayOrder,
    }));
  }

  /** Resolves an active provider with its fields. Codes are case-insensitive. */
  async getActiveProvider(code: string): Promise<ActiveProvider> {
    const provider = await this.repo.findByCode(code.trim().toUpperCase());
    if (!provider) throw new AppException(ErrorCode.PROVIDER_NOT_FOUND, 'Provider not found', 404);
    if (!provider.isActive) throw new AppException(ErrorCode.PROVIDER_INACTIVE, 'Provider is not active', 400);
    return { provider, fields: await this.repo.findFields(provider.id) };
  }

  async getProviderById(id: string): Promise<{ provider: PaymentProviderEntity; fields: PaymentProviderField[] }> {
    const provider = await this.repo.findById(id);
    if (!provider) throw new AppException(ErrorCode.PROVIDER_NOT_FOUND, 'Provider not found', 404);
    return { provider, fields: await this.repo.findFields(provider.id) };
  }

  /**
   * Checks a submitted config against the provider's field definitions: no unknown keys,
   * required fields present, all values non-empty strings. Error details name fields, never values.
   */
  validateConfig(fields: PaymentProviderField[], config: unknown): ProviderConfig {
    if (typeof config !== 'object' || config === null || Array.isArray(config)) {
      throw this.invalid({ config: 'must be an object' });
    }
    const input = config as Record<string, unknown>;
    const known = new Set(fields.map((f) => f.fieldKey));
    const problems: Record<string, string> = {};

    for (const key of Object.keys(input)) if (!known.has(key)) problems[key] = 'unknown field';
    const out: ProviderConfig = {};
    for (const f of fields) {
      const v = input[f.fieldKey];
      if (v === undefined || v === null || v === '') {
        if (f.isRequired) problems[f.fieldKey] = 'is required';
      } else if (typeof v !== 'string') {
        problems[f.fieldKey] = 'must be a string';
      } else if (v.length > MAX_VALUE_LENGTH) {
        problems[f.fieldKey] = `must be at most ${MAX_VALUE_LENGTH} characters`;
      } else {
        out[f.fieldKey] = v;
      }
    }
    if (Object.keys(problems).length > 0) throw this.invalid(problems);
    return out;
  }

  /** Runs the provider check. Stores nothing. On success returns a short-lived verification token. */
  async testConnection(tenantId: string, code: string, rawConfig: unknown): Promise<ConnectionTestResponse> {
    const { provider, fields } = await this.getActiveProvider(code);
    const config = this.validateConfig(fields, rawConfig);
    const result = await this.registry.get(provider.code).testConnection(config);
    if (!result.success) return { success: false, message: result.message };
    return {
      success: true,
      message: result.message,
      verificationToken: await this.verification.issue(tenantId, provider.code, config),
    };
  }

  /** Runs the provider check only (used when a stored config is re-tested). */
  runConnectionTest(code: string, config: ProviderConfig): Promise<{ success: boolean; message: string }> {
    return this.registry.get(code).testConnection(config);
  }

  private invalid(details: Record<string, string>): AppException {
    return new AppException(ErrorCode.VALIDATION_ERROR, 'Invalid gateway configuration', 400, { fields: details });
  }
}
