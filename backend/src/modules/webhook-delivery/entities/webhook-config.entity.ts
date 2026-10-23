// FILE: modules/webhooks/entities/webhook-config.entity.ts
// PURPOSE: webhook_configs table (docs/merchant-webhooks.md). One endpoint per merchant. The signing secret is stored encrypted
// DEPENDENCIES: typeorm
// PHASE: 8
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'webhook_configs' })
export class WebhookConfig {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', unique: true })
  tenantId: string;

  @Column({ name: 'webhook_url', type: 'text' })
  webhookUrl: string;

  /** AES-256-GCM envelope. Needed in plaintext at send time, so it cannot be a hash. */
  @Column({ name: 'webhook_secret', type: 'text' })
  webhookSecret: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
