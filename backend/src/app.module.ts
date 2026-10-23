// FILE: app.module.ts
// PURPOSE: Root module. TypeORM with synchronize:false (migrations only)
// DEPENDENCIES: AppConfigModule, AuthModule, MerchantModule, ProvidersModule, GatewayConfigModule
// PHASE: 2 (extended each phase)
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule, APP_CONFIG } from './config/config.module';
import { AppConfig } from './config/configuration';
import { ENTITIES } from './database/entities';
import { ApiCredentialsModule } from './modules/api-credentials/api-credentials.module';
import { AuthModule } from './modules/auth/auth.module';
import { GatewayConfigModule } from './modules/gateway-config/gateway-config.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { MerchantModule } from './modules/merchant/merchant.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { WebhookDeliveryModule } from './modules/webhook-delivery/webhook-delivery.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';

@Module({
  imports: [
    AppConfigModule,
    TypeOrmModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        type: 'postgres' as const,
        url: config.databaseUrl,
        ssl: { rejectUnauthorized: false },
        entities: ENTITIES,
        synchronize: false,
      }),
    }),
    AuthModule,
    MerchantModule,
    ProvidersModule,
    GatewayConfigModule,
    ApiCredentialsModule,
    PaymentsModule,
    CheckoutModule,
    WebhookDeliveryModule,
    WebhooksModule,
  ],
})
export class AppModule {}
