// FILE: modules/checkout/checkout.module.ts
// PURPOSE: Hosted checkout module
// DEPENDENCIES: PaymentsModule, GatewayConfigModule, ProvidersModule, MerchantModule, CryptoModule
// PHASE: 5
import { Module } from '@nestjs/common';
import { CryptoModule } from '../crypto/crypto.module';
import { GatewayConfigModule } from '../gateway-config/gateway-config.module';
import { MerchantModule } from '../merchant/merchant.module';
import { PaymentsModule } from '../payments/payments.module';
import { ProvidersModule } from '../providers/providers.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

@Module({
  imports: [PaymentsModule, GatewayConfigModule, ProvidersModule, MerchantModule, CryptoModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
