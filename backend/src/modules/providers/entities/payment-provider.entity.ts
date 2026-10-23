// FILE: modules/providers/entities/payment-provider.entity.ts
// PURPOSE: payment_providers table (db-design.md). Named *Entity to avoid clashing with the PaymentProvider interface
// DEPENDENCIES: typeorm
// PHASE: 4
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'payment_providers' })
export class PaymentProviderEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'code', type: 'varchar', length: 32, unique: true })
  code: string;

  @Column({ name: 'name', type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive: boolean;
}
