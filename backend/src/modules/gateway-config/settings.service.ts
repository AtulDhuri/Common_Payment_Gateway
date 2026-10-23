// FILE: modules/gateway-config/settings.service.ts
// PURPOSE: Read and replace the tenant's success/failure redirect URLs
// DEPENDENCIES: GatewayConfigRepository, AuditService
// PHASE: 7
import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { RedirectsResponse, UpdateRedirectsDto } from './dto/settings.dto';
import { GatewayConfigRepository } from './gateway-config.repository';

@Injectable()
export class SettingsService {
  constructor(
    private readonly repo: GatewayConfigRepository,
    private readonly audit: AuditService,
  ) {}

  async getRedirects(tenantId: string): Promise<RedirectsResponse> {
    const s = await this.repo.findSettings(tenantId);
    return { successUrl: s?.successUrl ?? null, failureUrl: s?.failureUrl ?? null };
  }

  /** PUT semantics: both values are replaced. A missing or null value clears that URL. */
  async setRedirects(tenantId: string, dto: UpdateRedirectsDto): Promise<RedirectsResponse> {
    const next = { successUrl: dto.successUrl ?? null, failureUrl: dto.failureUrl ?? null };
    const before = await this.getRedirects(tenantId);
    await this.repo.setRedirects(tenantId, next.successUrl, next.failureUrl);

    const changed = (Object.keys(next) as (keyof RedirectsResponse)[]).filter((k) => next[k] !== before[k]);
    if (changed.length > 0) {
      await this.audit.record({
        tenantId,
        action: 'REDIRECT_URLS_UPDATED',
        entity: 'tenant_settings',
        entityId: tenantId,
        payload: { fields: changed },
      });
    }
    return next;
  }
}
