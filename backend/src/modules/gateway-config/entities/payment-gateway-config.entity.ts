// FILE: modules/gateway-config/entities/payment-gateway-config.entity.ts
// PURPOSE: payment_gateway_configs table. config_json holds plain non-secret values and encrypted envelopes for secrets
// DEPENDENCIES: typeorm
// PHASE: 4
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'payment_gateway_configs' })
@Unique(['tenantId', 'providerId'])
export class PaymentGatewayConfig {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId: string;

  @Column({ name: 'config_json', type: 'jsonb' })
  configJson: Record<string, string>;

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified: boolean;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
