// FILE: modules/webhooks/webhooks.module.ts
// PURPOSE: Gateway webhook intake. Outgoing delivery to merchants is Phase 8
// DEPENDENCIES: PaymentsModule, GatewayConfigModule, ProvidersModule
// PHASE: 5
import { Module } from '@nestjs/common';
import { GatewayConfigModule } from '../gateway-config/gateway-config.module';
import { PaymentsModule } from '../payments/payments.module';
import { ProvidersModule } from '../providers/providers.module';
import { GatewayWebhookController } from './gateway-webhook.controller';
import { GatewayWebhookService } from './gateway-webhook.service';

@Module({
  imports: [PaymentsModule, GatewayConfigModule, ProvidersModule],
  controllers: [GatewayWebhookController],
  providers: [GatewayWebhookService],
})
export class WebhooksModule {}
