// FILE: modules/webhook-delivery/webhook-dispatcher.ts
// PURPOSE: Claims due deliveries, signs and sends them, records the result, schedules retries (docs/merchant-webhooks.md)
// DEPENDENCIES: WebhookDeliveryRepository, WebhookTransport, CryptoService, AuditService, AppConfig
// PHASE: 8
import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config.module';
import { AppConfig } from '../../config/configuration';
import { AuditService } from '../audit/audit.service';
import { CryptoService } from '../crypto/crypto.service';
import { WebhookConfig } from './entities/webhook-config.entity';
import { ClaimedDelivery, WebhookDeliveryRepository } from './webhook-delivery.repository';
import { decideOutcome } from './webhook-retry';
import { buildWebhookHeaders } from './webhook-signature';
import { WebhookTransport } from './webhook-transport';

const BATCH_SIZE = 20;
const PARALLEL = 5;
/** A claimed delivery is hidden for this long. A crash mid-send makes it due again afterwards. Longer than the send timeout. */
const LEASE_SECONDS = 120;

@Injectable()
export class WebhookDispatcher {
  private readonly logger = new Logger(WebhookDispatcher.name);

  constructor(
    private readonly repo: WebhookDeliveryRepository,
    private readonly transport: WebhookTransport,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Sends everything that is due right now. @returns how many deliveries were attempted or closed */
  async processDue(): Promise<number> {
    const claimed = await this.repo.claimDue(BATCH_SIZE, LEASE_SECONDS);
    if (claimed.length === 0) return 0;

    const configs = new Map<string, WebhookConfig | null>();
    for (const tenantId of new Set(claimed.map((c) => c.tenantId))) {
      configs.set(tenantId, await this.repo.findConfig(tenantId));
    }
    for (let i = 0; i < claimed.length; i += PARALLEL) {
      await Promise.all(claimed.slice(i, i + PARALLEL).map((d) => this.deliverOne(d, configs.get(d.tenantId) ?? null)));
    }
    return claimed.length;
  }

  private async deliverOne(d: ClaimedDelivery, cfg: WebhookConfig | null): Promise<void> {
    try {
      if (!cfg || !cfg.isActive) {
        // Endpoint removed or switched off after the event was queued.
        await this.repo.failWithoutSending(d.id);
        await this.audit.record({
          tenantId: d.tenantId,
          action: 'WEBHOOK_FAILED',
          entity: 'webhook_event',
          entityId: d.id,
          payload: { eventType: d.eventType, reason: 'ENDPOINT_INACTIVE' },
        });
        return;
      }

      const rawBody = JSON.stringify(d.requestPayload);
      const timestamp = Math.floor(Date.now() / 1000);
      // The secret is decrypted only for this call and never stored in a longer-lived variable.
      const headers = buildWebhookHeaders({
        secret: this.crypto.decrypt(cfg.webhookSecret),
        eventType: d.eventType,
        deliveryId: d.id,
        timestampSeconds: timestamp,
        rawBody,
      });
      const result = await this.transport.post(cfg.webhookUrl, rawBody, headers);

      const attempt = d.attemptCount + 1;
      const outcome = decideOutcome(attempt, result.statusCode, this.config.webhooks.retryDelaysSeconds);
      await this.repo.recordAttempt(d.id, outcome.status, result.statusCode, cfg.webhookUrl, outcome.retryInSeconds);

      // Only the final result is audited, not every retry. No URL or body in the log.
      this.logger.log(`Webhook ${d.id} attempt ${attempt}: ${result.statusCode ?? result.error} -> ${outcome.status}`);
      if (outcome.status !== 'PENDING') {
        await this.audit.record({
          tenantId: d.tenantId,
          action: outcome.status === 'DELIVERED' ? 'WEBHOOK_DELIVERED' : 'WEBHOOK_FAILED',
          entity: 'webhook_event',
          entityId: d.id,
          payload: { eventType: d.eventType, attempts: attempt, responseCode: result.statusCode, error: result.error },
        });
      }
    } catch (err) {
      // Leave the row alone: the lease expires and it is picked up again.
      this.logger.error(`Webhook ${d.id} could not be processed: ${err instanceof Error ? err.message : 'error'}`);
    }
  }
}
