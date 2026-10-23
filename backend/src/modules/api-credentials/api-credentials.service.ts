// FILE: modules/api-credentials/api-credentials.service.ts
// PURPOSE: Generate (secret shown once, bcrypt-hashed), list, deactivate, delete, and authenticate API credentials
// DEPENDENCIES: ApiCredentialsRepository, GatewayConfigService, AuditService, bcrypt
// PHASE: 6
import { randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AppException } from '../../common/types/app.exception';
import { ErrorCode } from '../../common/types/error-codes';
import { AuditService } from '../audit/audit.service';
import { GatewayConfigService } from '../gateway-config/gateway-config.service';
import { ApiCredentialsRepository } from './api-credentials.repository';
import { ApiCredentialResponse, CreatedCredentialResponse } from './dto/api-credentials.dto';
import { ApiCredential } from './entities/api-credential.entity';

/** bcrypt cost for API secrets. The secret is 256 bits of randomness, so this is for defence in depth. */
const BCRYPT_COST = 10;
const PUBLIC_KEY_PATTERN = /^pk_(live|test)_[a-f0-9]{32}$/;
const SECRET_KEY_PATTERN = /^sk_(live|test)_[A-Za-z0-9_-]{43}$/;
const ENTITY = 'api_credential';

export interface ClientContext {
  tenantId: string;
  credentialId: string;
}

@Injectable()
export class ApiCredentialsService {
  private readonly logger = new Logger(ApiCredentialsService.name);

  constructor(
    private readonly repo: ApiCredentialsRepository,
    private readonly gateway: GatewayConfigService,
    private readonly audit: AuditService,
  ) {}

  async generate(tenantId: string, name: string): Promise<CreatedCredentialResponse> {
    const mode = await this.gateway.getKeyMode(tenantId);
    const publicKey = `pk_${mode}_${randomBytes(16).toString('hex')}`;
    const secretKey = `sk_${mode}_${randomBytes(32).toString('base64url')}`;
    const saved = await this.repo.create({
      tenantId,
      name,
      publicKey,
      secretKeyHash: await bcrypt.hash(secretKey, BCRYPT_COST),
    });
    await this.audit.record({
      tenantId,
      action: 'API_CREDENTIAL_CREATED',
      entity: ENTITY,
      entityId: saved.id,
      payload: { name, publicKey },
    });
    // The only place the plaintext secret leaves this service.
    return { ...this.toResponse(saved), secretKey };
  }

  async list(tenantId: string): Promise<ApiCredentialResponse[]> {
    return (await this.repo.listByTenant(tenantId)).map((c) => this.toResponse(c));
  }

  async deactivate(tenantId: string, id: string): Promise<ApiCredentialResponse> {
    const credential = await this.mustFind(tenantId, id);
    if (credential.isActive) {
      credential.isActive = false;
      await this.repo.save(credential);
      await this.audit.record({
        tenantId,
        action: 'API_CREDENTIAL_DEACTIVATED',
        entity: ENTITY,
        entityId: id,
        payload: { name: credential.name, publicKey: credential.publicKey },
      });
    }
    return this.toResponse(credential);
  }

  async remove(tenantId: string, id: string): Promise<{ deleted: boolean }> {
    const credential = await this.mustFind(tenantId, id);
    await this.repo.deleteForTenant(tenantId, id);
    await this.audit.record({
      tenantId,
      action: 'API_CREDENTIAL_DELETED',
      entity: ENTITY,
      entityId: id,
      payload: { name: credential.name, publicKey: credential.publicKey },
    });
    return { deleted: true };
  }

  /**
   * Checks an incoming key pair. Every failure (missing, malformed, unknown, inactive, wrong secret)
   * returns the same error so callers learn nothing about which part was wrong.
   */
  async authenticate(publicKey: string, secretKey: string): Promise<ClientContext> {
    // Cheap shape checks first, so garbage never reaches the database or bcrypt.
    if (!PUBLIC_KEY_PATTERN.test(publicKey) || !SECRET_KEY_PATTERN.test(secretKey)) throw this.rejected();

    const credential = await this.repo.findByPublicKey(publicKey);
    if (!credential || !credential.isActive) throw this.rejected();
    if (!(await bcrypt.compare(secretKey, credential.secretKeyHash))) throw this.rejected();

    this.repo.touchLastUsed(credential.id).catch((err: unknown) => {
      this.logger.warn(`Could not update last_used_at: ${err instanceof Error ? err.message : 'error'}`);
    });
    return { tenantId: credential.tenantId, credentialId: credential.id };
  }

  missingCredentials(): AppException {
    return new AppException(
      ErrorCode.UNAUTHORIZED,
      'Missing API credentials. Send the x-api-key and x-api-secret headers',
      401,
    );
  }

  private rejected(): AppException {
    return new AppException(ErrorCode.UNAUTHORIZED, 'Invalid API credentials', 401);
  }

  private async mustFind(tenantId: string, id: string): Promise<ApiCredential> {
    const credential = await this.repo.findForTenant(tenantId, id);
    if (!credential) throw new AppException(ErrorCode.NOT_FOUND, 'API credential not found', 404);
    return credential;
  }

  private toResponse(c: ApiCredential): ApiCredentialResponse {
    return {
      id: c.id,
      name: c.name,
      publicKey: c.publicKey,
      mode: c.publicKey.startsWith('pk_live_') ? 'live' : 'test',
      isActive: c.isActive,
      lastUsedAt: c.lastUsedAt,
      createdAt: c.createdAt,
    };
  }
}
