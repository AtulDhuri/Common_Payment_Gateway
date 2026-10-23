// FILE: modules/merchant/entities/merchant-profile.entity.ts
// PURPOSE: merchant_profiles table (docs/merchant-profile.md)
// DEPENDENCIES: typeorm
// PHASE: 3
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum MerchantStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

@Entity({ name: 'merchant_profiles' })
export class MerchantProfile {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  @Column({ name: 'business_name', type: 'varchar', length: 255 })
  businessName: string;

  @Column({ name: 'business_email', type: 'varchar', length: 255 })
  businessEmail: string;

  @Column({ name: 'support_email', type: 'varchar', length: 255, nullable: true })
  supportEmail: string | null;

  @Column({ name: 'website', type: 'varchar', length: 500, nullable: true })
  website: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ name: 'country', type: 'varchar', length: 100, nullable: true })
  country: string | null;

  @Column({ name: 'currency', type: 'varchar', length: 10, default: 'INR' })
  currency: string;

  @Column({ name: 'timezone', type: 'varchar', length: 100, default: 'Asia/Kolkata' })
  timezone: string;

  @Column({ name: 'status', type: 'varchar', length: 50, default: MerchantStatus.ACTIVE })
  status: MerchantStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
