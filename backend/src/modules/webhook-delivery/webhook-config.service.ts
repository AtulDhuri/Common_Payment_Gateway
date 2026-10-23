// FILE: modules/webhook-delivery/webhook-config.service.ts
// PURPOSE: Merchant webhook endpoint: create / update, rotate the signing secret, read masked, delivery log
// DEPENDENCIES: WebhookDeliveryRepository, CryptoService, AuditService, AppConfig
// PHASE: 8
import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/types/app.exception';
import { ErrorCode } from '../../common/types/error-codes';
import { APP_CONFIG } from '../../config/config.module';
import { AppConfig } from '../../config/configuration';
import { AuditService } from '../audit/audit.service';
import { CryptoService } from '../crypto/crypto.service';
import {
  DeliveryListResponse,
  SECRET_MASK,
  UpsertWebhookConfigDto,
  WebhookConfigResponse,
} from './dto/webhook-config.dto';
import { WebhookConfig } from './entities/webhook-config.entity';
import { checkWebhookUrl } from './url-safety';
import { WebhookDeliveryRepository } from './webhook-delivery.repository';
import { generateSigningSecret } from './webhook-signature';

const ENTITY = 'webhook_config';
const DEFAULT_LIMIT = 20;

@Injectable()
export class WebhookConfigService {
  constructor(
    private readonly repo: WebhookDeliveryRepository,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async get(tenantId: string): Promise<WebhookConfigResponse> {
    const cfg = await this.repo.findConfig(tenantId);
    if (!cfg) throw new AppException(ErrorCode.NOT_FOUND, 'Webhook endpoint not configured', 404);
    return this.masked(cfg);
  }

  /** First call creates the endpoint and returns the signing secret once. Later calls change the URL / active flag only. */
  async upsert(tenantId: string, dto: UpsertWebhookConfigDto): Promise<WebhookConfigResponse> {
    const check = checkWebhookUrl(dto.url, this.config.isProduction);
    if (!check.ok) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Invalid webhook URL', 400, { fields: { url: check.reason } });
    }

    const existing = await this.repo.findConfig(tenantId);
    if (!existing) {
      const secret = generateSigningSecret();
      const saved = await this.repo.saveConfig(
        this.repo.createConfig({
          tenantId,
          webhookUrl: check.url.toString(),
          webhookSecret: this.crypto.encrypt(secret),
          isActive: dto.isActive ?? true,
        }),
      );
      await this.audit.record({ tenantId, action: 'WEBHOOK_CONFIG_CREATED', entity: ENTITY, entityId: saved.id, payload: { fields: ['url', 'isActive'] } });
      return { url: saved.webhookUrl, isActive: saved.isActive, secret, secretShownOnce: true };
    }

    const changed: string[] = [];
    const nextUrl = check.url.toString();
    if (existing.webhookUrl !== nextUrl) {
      existing.webhookUrl = nextUrl;
      changed.push('url');
    }
    if (dto.isActive !== undefined && existing.isActive !== dto.isActive) {
      existing.isActive = dto.isActive;
      changed.push('isActive');
    }
    if (changed.length > 0) {
      await this.repo.saveConfig(existing);
      await this.audit.record({ tenantId, action: 'WEBHOOK_CONFIG_UPDATED', entity: ENTITY, entityId: existing.id, payload: { fields: changed } });
    }
    return this.masked(existing);
  }

  async rotateSecret(tenantId: string): Promise<WebhookConfigResponse> {
    const cfg = await this.repo.findConfig(tenantId);
    if (!cfg) throw new AppException(ErrorCode.NOT_FOUND, 'Webhook endpoint not configured', 404);
    const secret = generateSigningSecret();
    cfg.webhookSecret = this.crypto.encrypt(secret);
    await this.repo.saveConfig(cfg);
    await this.audit.record({ tenantId, action: 'WEBHOOK_SECRET_ROTATED', entity: ENTITY, entityId: cfg.id, payload: { fields: ['secret'] } });
    return { url: cfg.webhookUrl, isActive: cfg.isActive, secret, secretShownOnce: true };
  }

  async listDeliveries(tenantId: string, page = 1, limit = DEFAULT_LIMIT): Promise<DeliveryListResponse> {
    const [items, total] = await this.repo.listForTenant(tenantId, page, limit);
    return { items, page, limit, total };
  }

  private masked(cfg: WebhookConfig): WebhookConfigResponse {
    return { url: cfg.webhookUrl, isActive: cfg.isActive, secret: SECRET_MASK, secretShownOnce: false };
  }
}
