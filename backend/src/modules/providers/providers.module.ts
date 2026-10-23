// FILE: modules/providers/providers.module.ts
// PURPOSE: Provider catalog, registry, Razorpay provider, verification tokens
// DEPENDENCIES: CryptoModule, JwtModule
// PHASE: 4
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CryptoModule } from '../crypto/crypto.module';
import { PaymentProviderEntity } from './entities/payment-provider.entity';
import { PaymentProviderField } from './entities/payment-provider-field.entity';
import { ProviderRegistry } from './registry/provider.registry';
import { RazorpayProvider } from './razorpay/razorpay.provider';
import { ProvidersController } from './providers.controller';
import { ProvidersRepository } from './providers.repository';
import { ProvidersService } from './providers.service';
import { VerificationService } from './verification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentProviderEntity, PaymentProviderField]),
    JwtModule.register({}),
    CryptoModule,
  ],
  controllers: [ProvidersController],
  providers: [ProvidersRepository, ProvidersService, ProviderRegistry, RazorpayProvider, VerificationService],
  exports: [ProvidersService, VerificationService, ProviderRegistry],
})
export class ProvidersModule {}
