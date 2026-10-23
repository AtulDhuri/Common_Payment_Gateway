// FILE: modules/webhook-delivery/webhook-delivery.module.ts
// PURPOSE: Merchant webhooks: configuration API, enqueuing (used by payments), dispatcher and background worker
// DEPENDENCIES: CryptoModule, AuditModule
// PHASE: 8
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { CryptoModule } from '../crypto/crypto.module';
import { WebhookConfig } from './entities/webhook-config.entity';
import { WebhookEvent } from './entities/webhook-event.entity';
import { WebhookConfigController } from './webhook-config.controller';
import { WebhookConfigService } from './webhook-config.service';
import { WebhookDeliveryRepository } from './webhook-delivery.repository';
import { WebhookDispatcher } from './webhook-dispatcher';
import { WebhookEnqueuer } from './webhook-enqueuer';
import { WebhookTransport } from './webhook-transport';
import { WebhookWorker } from './webhook-worker';

@Module({
  imports: [TypeOrmModule.forFeature([WebhookConfig, WebhookEvent]), CryptoModule, AuditModule],
  controllers: [WebhookConfigController],
  providers: [
    WebhookDeliveryRepository,
    WebhookConfigService,
    WebhookEnqueuer,
    WebhookTransport,
    WebhookDispatcher,
    WebhookWorker,
  ],
  exports: [WebhookEnqueuer],
})
export class WebhookDeliveryModule {}
