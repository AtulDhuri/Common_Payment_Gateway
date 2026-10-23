// FILE: modules/gateway-config/gateway-config.module.ts
// PURPOSE: Gateway configuration feature module
// DEPENDENCIES: ProvidersModule, CryptoModule, AuditModule
// PHASE: 4
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { CryptoModule } from '../crypto/crypto.module';
import { ProvidersModule } from '../providers/providers.module';
import { PaymentGatewayConfig } from './entities/payment-gateway-config.entity';
import { TenantSettings } from './entities/tenant-settings.entity';
import { GatewayConfigController } from './gateway-config.controller';
import { GatewayConfigRepository } from './gateway-config.repository';
import { GatewayConfigService } from './gateway-config.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentGatewayConfig, TenantSettings]),
    ProvidersModule,
    CryptoModule,
    AuditModule,
  ],
  controllers: [GatewayConfigController, SettingsController],
  providers: [GatewayConfigRepository, GatewayConfigService, SettingsService],
  exports: [GatewayConfigService],
})
export class GatewayConfigModule {}
