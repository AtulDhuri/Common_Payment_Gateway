// FILE: modules/audit/audit.service.ts
// PURPOSE: Append-only audit writer. No update or delete path exists (db-design.md). Payload holds field names only, never values
// DEPENDENCIES: AuditLog entity
// PHASE: 4
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

export interface AuditEntry {
  tenantId: string;
  action: string;
  entity: string;
  entityId: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  async record(entry: AuditEntry): Promise<void> {
    // save() on a new object only ever inserts. There is deliberately no update/delete method here.
    await this.repo.save(this.repo.create({ ...entry, payload: entry.payload ?? {} }));
  }
}
