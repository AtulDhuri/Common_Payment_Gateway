// FILE: modules/webhook-delivery/webhook-worker.ts
// PURPOSE: In-process poller that drives the dispatcher. No Redis or queue server (mvp-architecture.md)
// DEPENDENCIES: WebhookDispatcher, AppConfig
// PHASE: 8
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config.module';
import { AppConfig } from '../../config/configuration';
import { WebhookDispatcher } from './webhook-dispatcher';

@Injectable()
export class WebhookWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WebhookWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly dispatcher: WebhookDispatcher,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.webhooks.enabled) {
      this.logger.log('Webhook worker disabled (WEBHOOK_WORKER_ENABLED=false)');
      return;
    }
    this.timer = setInterval(() => void this.tick(), this.config.webhooks.pollIntervalMs);
    this.timer.unref(); // never keeps the process alive by itself
    this.logger.log(`Webhook worker started (every ${this.config.webhooks.pollIntervalMs} ms)`);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One pass. Skipped if the previous pass is still running, so slow endpoints cannot pile passes up. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.dispatcher.processDue();
    } catch (err) {
      this.logger.error(`Webhook pass failed: ${err instanceof Error ? err.message : 'error'}`);
    } finally {
      this.running = false;
    }
  }
}
