// FILE: modules/providers/verification.service.spec.ts
// PURPOSE: Unit tests for the "tested before save" token
// DEPENDENCIES: node:test, @nestjs/jwt
// PHASE: 4
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../../common/types/app.exception';
import { ErrorCode } from '../../common/types/error-codes';
import { AppConfig } from '../../config/configuration';
import { CryptoService } from '../crypto/crypto.service';
import { VerificationService } from './verification.service';

const config = {
  masterEncryptionKey: randomBytes(32),
  jwt: { accessSecret: 'access-secret', refreshSecret: 'refresh-secret' },
} as AppConfig;
const jwt = new JwtService();
const service = new VerificationService(jwt, new CryptoService(config), config);

const CFG = { key_id: 'rzp_test_abc', key_secret: 's3cret' };

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppException) return e.errorCode;
  }
  return 'NO_ERROR';
}

describe('VerificationService', () => {
  it('accepts a token for the same tenant, provider and config', async () => {
    const t = await service.issue('tenant-1', 'RAZORPAY', CFG);
    assert.equal(await codeOf(service.assertVerified(t, 'tenant-1', 'RAZORPAY', CFG)), 'NO_ERROR');
  });

  it('ignores key order in the config', async () => {
    const t = await service.issue('tenant-1', 'RAZORPAY', CFG);
    const reordered = { key_secret: 's3cret', key_id: 'rzp_test_abc' };
    assert.equal(await codeOf(service.assertVerified(t, 'tenant-1', 'RAZORPAY', reordered)), 'NO_ERROR');
  });

  it('rejects a changed config value', async () => {
    const t = await service.issue('tenant-1', 'RAZORPAY', CFG);
    assert.equal(
      await codeOf(service.assertVerified(t, 'tenant-1', 'RAZORPAY', { ...CFG, key_secret: 'other' })),
      ErrorCode.CONFIG_NOT_VERIFIED,
    );
  });

  it('rejects an added field', async () => {
    const t = await service.issue('tenant-1', 'RAZORPAY', CFG);
    assert.equal(
      await codeOf(service.assertVerified(t, 'tenant-1', 'RAZORPAY', { ...CFG, webhook_secret: 'w' })),
      ErrorCode.CONFIG_NOT_VERIFIED,
    );
  });

  it('rejects another tenant or provider', async () => {
    const t = await service.issue('tenant-1', 'RAZORPAY', CFG);
    assert.equal(await codeOf(service.assertVerified(t, 'tenant-2', 'RAZORPAY', CFG)), ErrorCode.CONFIG_NOT_VERIFIED);
    assert.equal(await codeOf(service.assertVerified(t, 'tenant-1', 'OTHER', CFG)), ErrorCode.CONFIG_NOT_VERIFIED);
  });

  it('rejects garbage, a token signed with another secret, and an access token', async () => {
    assert.equal(await codeOf(service.assertVerified('garbage', 't', 'RAZORPAY', CFG)), ErrorCode.CONFIG_NOT_VERIFIED);
    const forged = await jwt.signAsync({ type: 'gateway-verification', sub: 't', provider: 'RAZORPAY' }, { secret: 'x' });
    assert.equal(await codeOf(service.assertVerified(forged, 't', 'RAZORPAY', CFG)), ErrorCode.CONFIG_NOT_VERIFIED);
    const access = await jwt.signAsync({ type: 'access', sub: 't' }, { secret: 'access-secret' });
    assert.equal(await codeOf(service.assertVerified(access, 't', 'RAZORPAY', CFG)), ErrorCode.CONFIG_NOT_VERIFIED);
  });

  it('rejects an expired token', async () => {
    const hash = service.hashConfig(CFG);
    const expired = await jwt.signAsync(
      { type: 'gateway-verification', sub: 't', provider: 'RAZORPAY', configHash: hash },
      { secret: 'access-secret', expiresIn: -10 },
    );
    assert.equal(await codeOf(service.assertVerified(expired, 't', 'RAZORPAY', CFG)), ErrorCode.CONFIG_NOT_VERIFIED);
  });
});
