// FILE: modules/api-credentials/api-credentials.repository.ts
// PURPOSE: DB access for api_credentials. Dashboard methods take tenantId; findByPublicKey is the authentication lookup
// DEPENDENCIES: ApiCredential entity
// PHASE: 6
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiCredential } from './entities/api-credential.entity';

@Injectable()
export class ApiCredentialsRepository {
  constructor(@InjectRepository(ApiCredential) private readonly repo: Repository<ApiCredential>) {}

  create(values: Partial<ApiCredential>): Promise<ApiCredential> {
    return this.repo.save(this.repo.create(values));
  }

  listByTenant(tenantId: string): Promise<ApiCredential[]> {
    return this.repo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  findByPublicKey(publicKey: string): Promise<ApiCredential | null> {
    return this.repo.findOne({ where: { publicKey } });
  }

  findForTenant(tenantId: string, id: string): Promise<ApiCredential | null> {
    return this.repo.findOne({ where: { tenantId, id } });
  }

  save(credential: ApiCredential): Promise<ApiCredential> {
    return this.repo.save(credential);
  }

  async deleteForTenant(tenantId: string, id: string): Promise<boolean> {
    const result = await this.repo.delete({ tenantId, id });
    return (result.affected ?? 0) > 0;
  }

  /** Writes at most once per minute per key, so busy integrations do not turn every request into a write. */
  async touchLastUsed(id: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(ApiCredential)
      .set({ lastUsedAt: () => 'now()' })
      .where('id = :id AND (last_used_at IS NULL OR last_used_at < now() - interval \'1 minute\')', { id })
      .execute();
  }
}
