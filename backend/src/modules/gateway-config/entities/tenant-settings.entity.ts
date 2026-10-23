// FILE: modules/gateway-config/entities/tenant-settings.entity.ts
// PURPOSE: tenant_settings table (db-design.md): success/failure redirect URLs saved with the gateway config
// DEPENDENCIES: typeorm
// PHASE: 4
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'tenant_settings' })
export class TenantSettings {
  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'success_url', type: 'varchar', nullable: true })
  successUrl: string | null;

  @Column({ name: 'failure_url', type: 'varchar', nullable: true })
  failureUrl: string | null;
}
