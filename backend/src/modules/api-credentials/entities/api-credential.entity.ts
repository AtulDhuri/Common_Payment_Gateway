// FILE: modules/api-credentials/entities/api-credential.entity.ts
// PURPOSE: api_credentials table (docs/api-credentials.md). Only the bcrypt hash of the secret is stored
// DEPENDENCIES: typeorm
// PHASE: 6
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'api_credentials' })
export class ApiCredential {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'public_key', type: 'varchar', length: 255, unique: true })
  publicKey: string;

  @Column({ name: 'secret_key_hash', type: 'varchar', length: 500 })
  secretKeyHash: string;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
