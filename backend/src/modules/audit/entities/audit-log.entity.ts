// FILE: modules/audit/entities/audit-log.entity.ts
// PURPOSE: audit_logs table (db-design.md)
// DEPENDENCIES: typeorm
// PHASE: 4
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'audit_logs' })
export class AuditLog {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'action', type: 'varchar' })
  action: string;

  @Column({ name: 'entity', type: 'varchar' })
  entity: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId: string;

  @Column({ name: 'payload', type: 'jsonb', default: () => "'{}'" })
  payload: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
