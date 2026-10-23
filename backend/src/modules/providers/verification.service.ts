// FILE: modules/providers/verification.service.ts
// PURPOSE: Issues and checks the "tested before save" token (api-design.md): JWT, 15 min, bound to tenant, provider and SHA-256 of the config
// DEPENDENCIES: JwtService, CryptoService, AppConfig
// PHASE: 4
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../../common/types/app.exception';
import { ErrorCode } from '../../common/types/error-codes';
import { APP_CONFIG } from '../../config/config.module';
import { AppConfig } from '../../config/configuration';
import { CryptoService } from '../crypto/crypto.service';
import { ProviderConfig } from './interfaces/payment-provider.interface';

const TOKEN_TYPE = 'gateway-verification';

interface VerificationPayload {
  type: string;
  sub: string;
  provider: string;
  configHash: string;
}

@Injectable()
export class VerificationService {
  constructor(
    private readonly jwt: JwtService,
    private readonly crypto: CryptoService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Stable hash: keys sorted so field order does not matter. */
  hashConfig(config: ProviderConfig): string {
    const sorted = Object.keys(config)
      .sort()
      .map((k) => [k, config[k]]);
    return this.crypto.sha256Hex(JSON.stringify(sorted));
  }

  issue(tenantId: string, providerCode: string, config: ProviderConfig): Promise<string> {
    const payload: VerificationPayload = {
      type: TOKEN_TYPE,
      sub: tenantId,
      provider: providerCode,
      configHash: this.hashConfig(config),
    };
    return this.jwt.signAsync(payload, { secret: this.config.jwt.accessSecret, expiresIn: 15 * 60 });
  }

  /** Throws CONFIG_NOT_VERIFIED unless the token matches this tenant, provider and config. */
  async assertVerified(token: string, tenantId: string, providerCode: string, config: ProviderConfig): Promise<void> {
    let payload: VerificationPayload;
    try {
      payload = await this.jwt.verifyAsync<VerificationPayload>(token, { secret: this.config.jwt.accessSecret });
    } catch {
      throw this.notVerified();
    }
    const ok =
      payload.type === TOKEN_TYPE &&
      payload.sub === tenantId &&
      payload.provider === providerCode &&
      this.crypto.safeEqual(payload.configHash, this.hashConfig(config));
    if (!ok) throw this.notVerified();
  }

  private notVerified(): AppException {
    return new AppException(
      ErrorCode.CONFIG_NOT_VERIFIED,
      'This configuration has not passed a connection test. Test it again before saving',
      400,
    );
  }
}
