// FILE: modules/merchant/merchant.module.ts
// PURPOSE: Merchant feature module
// DEPENDENCIES: MerchantProfile, MerchantRepository, MerchantService
// PHASE: 3
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchantProfile } from './entities/merchant-profile.entity';
import { MerchantController } from './merchant.controller';
import { MerchantRepository } from './merchant.repository';
import { MerchantService } from './merchant.service';

@Module({
  imports: [TypeOrmModule.forFeature([MerchantProfile])],
  controllers: [MerchantController],
  providers: [MerchantRepository, MerchantService],
  exports: [MerchantService],
})
export class MerchantModule {}
