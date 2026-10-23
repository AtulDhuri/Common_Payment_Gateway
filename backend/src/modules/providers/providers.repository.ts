// FILE: modules/providers/providers.repository.ts
// PURPOSE: DB access for the provider catalog (global data, not tenant data)
// DEPENDENCIES: PaymentProviderEntity, PaymentProviderField
// PHASE: 4
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentProviderEntity } from './entities/payment-provider.entity';
import { PaymentProviderField } from './entities/payment-provider-field.entity';

@Injectable()
export class ProvidersRepository {
  constructor(
    @InjectRepository(PaymentProviderEntity) private readonly providers: Repository<PaymentProviderEntity>,
    @InjectRepository(PaymentProviderField) private readonly fields: Repository<PaymentProviderField>,
  ) {}

  findActive(): Promise<PaymentProviderEntity[]> {
    return this.providers.find({ where: { isActive: true }, order: { name: 'ASC' } });
  }

  findByCode(code: string): Promise<PaymentProviderEntity | null> {
    return this.providers.findOne({ where: { code } });
  }

  findById(id: string): Promise<PaymentProviderEntity | null> {
    return this.providers.findOne({ where: { id } });
  }

  findFields(providerId: string): Promise<PaymentProviderField[]> {
    return this.fields.find({ where: { providerId }, order: { displayOrder: 'ASC' } });
  }
}
