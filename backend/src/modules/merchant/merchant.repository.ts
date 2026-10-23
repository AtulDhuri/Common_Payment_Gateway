// FILE: modules/merchant/merchant.repository.ts
// PURPOSE: DB access for merchant_profiles, always scoped by tenantId (= users.id)
// DEPENDENCIES: MerchantProfile entity
// PHASE: 3
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MerchantProfile } from './entities/merchant-profile.entity';

@Injectable()
export class MerchantRepository {
  constructor(@InjectRepository(MerchantProfile) private readonly repo: Repository<MerchantProfile>) {}

  findByTenantId(tenantId: string): Promise<MerchantProfile | null> {
    return this.repo.findOne({ where: { userId: tenantId } });
  }

  create(tenantId: string, values: Partial<MerchantProfile>): Promise<MerchantProfile> {
    return this.repo.save(this.repo.create({ ...values, userId: tenantId }));
  }

  save(profile: MerchantProfile): Promise<MerchantProfile> {
    return this.repo.save(profile);
  }
}
