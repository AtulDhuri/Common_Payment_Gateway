// FILE: modules/payments/payments.module.ts
// PURPOSE: Payments feature module
// DEPENDENCIES: GatewayConfigModule, ProvidersModule, AuditModule, CryptoModule
// PHASE: 5
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiCredentialsModule } from '../api-credentials/api-credentials.module';
import { AuditModule } from '../audit/audit.module';
import { CryptoModule } from '../crypto/crypto.module';
import { GatewayConfigModule } from '../gateway-config/gateway-config.module';
import { WebhookDeliveryModule } from '../webhook-delivery/webhook-delivery.module';
import { ProvidersModule } from '../providers/providers.module';
import { PaymentEvent } from './entities/payment-event.entity';
import { Payment } from './entities/payment.entity';
import { PaymentListService } from './payment-list.service';
import { PaymentsController } from './payments.controller';
import { SandboxPaymentsController } from './sandbox-payments.controller';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, PaymentEvent]),
    GatewayConfigModule,
    ProvidersModule,
    AuditModule,
    CryptoModule,
    ApiCredentialsModule,
    WebhookDeliveryModule,
  ],
  controllers: [PaymentsController, SandboxPaymentsController],
  providers: [PaymentsRepository, PaymentsService, PaymentListService],
  exports: [PaymentsService, PaymentsRepository],
})
export class PaymentsModule {}
