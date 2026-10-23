// FILE: modules/gateway-config/gateway-config.service.spec.ts
// PURPOSE: Unit tests for secure storage, masking, verification gate, Replace Secret and audit content
// DEPENDENCIES: node:test
// PHASE: 4
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { beforeEach, describe, it } from 'node:test';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../../common/types/app.exception';
import { ErrorCode } from '../../common/types/error-codes';
import { AppConfig } from '../../config/configuration';
import { AuditEntry, AuditService } from '../audit/audit.service';
import { CryptoService } from '../crypto/crypto.service';
import { PaymentProviderEntity } from '../providers/entities/payment-provider.entity';
import { PaymentProviderField } from '../providers/entities/payment-provider-field.entity';
import { ProviderConfig } from '../providers/interfaces/payment-provider.interface';
import { ProvidersService } from '../providers/providers.service';
import { VerificationService } from '../providers/verification.service';
import { PaymentGatewayConfig } from './entities/payment-gateway-config.entity';
import { GatewayConfigRepository } from './gateway-config.repository';
import { GatewayConfigService, SECRET_MASK } from './gateway-config.service';

const TENANT = 'tenant-1';
const appConfig = {
  masterEncryptionKey: randomBytes(32),
  jwt: { accessSecret: 'a', refreshSecret: 'b' },
} as AppConfig;

const provider = { id: 'prov-1', code: 'RAZORPAY', name: 'Razorpay', isActive: true } as PaymentProviderEntity;
const field = (key: string, type: 'text' | 'secret', required: boolean, order: number): PaymentProviderField =>
  ({ id: key, providerId: 'prov-1', fieldKey: key, fieldLabel: key, fieldType: type, isRequired: required, displayOrder: order }) as PaymentProviderField;
const fields = [field('key_id', 'text', true, 1), field('key_secret', 'secret', true, 2), field('webhook_secret', 'secret', false, 3)];

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppException) return e.errorCode;
  }
  return 'NO_ERROR';
}

describe('GatewayConfigService', () => {
  const crypto = new CryptoService(appConfig);
  const verification = new VerificationService(new JwtService(), crypto, appConfig);

  let row: PaymentGatewayConfig | null;
  let redirects: { s?: string; f?: string } | null;
  let audits: AuditEntry[];
  let testedWith: ProviderConfig | null;
  let testResult: { success: boolean; message: string };
  let service: GatewayConfigService;

  beforeEach(() => {
    row = null;
    redirects = null;
    audits = [];
    testedWith = null;
    testResult = { success: true, message: 'Connection successful' };

    const repo = {
      findForTenant: async () => row,
      findByTenantAndProvider: async () => row,
      create: (v: Partial<PaymentGatewayConfig>) => ({ id: 'cfg-1', ...v }) as PaymentGatewayConfig,
      save: async (c: PaymentGatewayConfig) => {
        row = c;
        return c;
      },
      upsertRedirects: async (_t: string, s?: string, f?: string) => {
        redirects = { s, f };
      },
    };
    // Real validateConfig logic, stubbed lookups.
    const providers = Object.create(ProvidersService.prototype) as ProvidersService;
    Object.assign(providers, {
      getActiveProvider: async () => ({ provider, fields }),
      getProviderById: async () => ({ provider, fields }),
      runConnectionTest: async (_c: string, cfg: ProviderConfig) => {
        testedWith = cfg;
        return testResult;
      },
    });
    const audit = { record: async (e: AuditEntry) => void audits.push(e) } as unknown as AuditService;
    service = new GatewayConfigService(
      repo as unknown as GatewayConfigRepository,
      providers,
      verification,
      crypto,
      audit,
    );
  });

  const CONFIG = { key_id: 'rzp_test_abc', key_secret: 'PLAINSECRET', webhook_secret: 'PLAINWEBHOOK' };
  const tokenFor = (cfg: ProviderConfig): Promise<string> => verification.issue(TENANT, 'RAZORPAY', cfg);

  it('saves with secrets encrypted and non-secrets in plain text', async () => {
    await service.save(TENANT, { provider: 'RAZORPAY', config: CONFIG, verificationToken: await tokenFor(CONFIG) });
    const stored = row!.configJson;
    assert.equal(stored.key_id, 'rzp_test_abc');
    assert.ok(crypto.isEnvelope(stored.key_secret));
    assert.ok(crypto.isEnvelope(stored.webhook_secret));
    assert.equal(crypto.decrypt(stored.key_secret), 'PLAINSECRET');
    assert.ok(!JSON.stringify(stored).includes('PLAINSECRET'));
    assert.equal(row!.isVerified, true);
    assert.ok(row!.verifiedAt instanceof Date);
  });

  it('returns a masked response without any secret value', async () => {
    const res = await service.save(TENANT, {
      provider: 'RAZORPAY',
      config: CONFIG,
      verificationToken: await tokenFor(CONFIG),
    });
    assert.deepEqual(res.fields, { key_id: 'rzp_test_abc', key_secret: SECRET_MASK, webhook_secret: SECRET_MASK });
    const json = JSON.stringify(await service.get(TENANT));
    assert.ok(!json.includes('PLAINSECRET') && !json.includes('PLAINWEBHOOK') && !json.includes('v1:'));
  });

  it('omits an optional secret that was not configured', async () => {
    const cfg = { key_id: 'rzp_test_abc', key_secret: 'PLAINSECRET' };
    const res = await service.save(TENANT, { provider: 'RAZORPAY', config: cfg, verificationToken: await tokenFor(cfg) });
    assert.deepEqual(Object.keys(res.fields), ['key_id', 'key_secret']);
  });

  it('refuses to save without a matching verification token', async () => {
    assert.equal(
      await codeOf(service.save(TENANT, { provider: 'RAZORPAY', config: CONFIG, verificationToken: 'nope' })),
      ErrorCode.CONFIG_NOT_VERIFIED,
    );
    const token = await tokenFor(CONFIG);
    assert.equal(
      await codeOf(
        service.save(TENANT, { provider: 'RAZORPAY', config: { ...CONFIG, key_secret: 'changed' }, verificationToken: token }),
      ),
      ErrorCode.CONFIG_NOT_VERIFIED,
    );
    assert.equal(row, null);
  });

  it('audits creation with field names only, never values', async () => {
    await service.save(TENANT, { provider: 'RAZORPAY', config: CONFIG, verificationToken: await tokenFor(CONFIG) });
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, 'GATEWAY_CONFIG_CREATED');
    assert.deepEqual(audits[0].payload, { provider: 'RAZORPAY', fields: ['key_id', 'key_secret', 'webhook_secret'] });
    assert.ok(!JSON.stringify(audits[0]).includes('PLAINSECRET'));
  });

  it('audits a second save as an update', async () => {
    const token = await tokenFor(CONFIG);
    await service.save(TENANT, { provider: 'RAZORPAY', config: CONFIG, verificationToken: token });
    await service.save(TENANT, { provider: 'RAZORPAY', config: CONFIG, verificationToken: token });
    assert.equal(audits[1].action, 'GATEWAY_CONFIG_UPDATED');
  });

  it('stores redirect URLs when provided', async () => {
    await service.save(TENANT, {
      provider: 'RAZORPAY',
      config: CONFIG,
      verificationToken: await tokenFor(CONFIG),
      successUrl: 'https://a.com/ok',
      failureUrl: 'https://a.com/fail',
    });
    assert.deepEqual(redirects, { s: 'https://a.com/ok', f: 'https://a.com/fail' });
  });

  it('rejects unknown and missing fields before touching the token', async () => {
    assert.equal(
      await codeOf(service.save(TENANT, { provider: 'RAZORPAY', config: { key_id: 'x' }, verificationToken: 't' })),
      ErrorCode.VALIDATION_ERROR,
    );
    assert.equal(
      await codeOf(service.save(TENANT, { provider: 'RAZORPAY', config: { ...CONFIG, extra: 'x' }, verificationToken: 't' })),
      ErrorCode.VALIDATION_ERROR,
    );
  });

  it('validation errors name fields but never echo values', async () => {
    try {
      await service.save(TENANT, { provider: 'RAZORPAY', config: { key_id: 'x', key_secret: 123, bad: 'LEAKME' }, verificationToken: 't' });
      assert.fail('should throw');
    } catch (e) {
      assert.ok(e instanceof AppException);
      assert.ok(!JSON.stringify(e.details).includes('LEAKME'));
    }
  });

  it('get returns NOT_FOUND when nothing is configured', async () => {
    assert.equal(await codeOf(service.get(TENANT)), ErrorCode.NOT_FOUND);
  });

  describe('replaceSecret', () => {
    beforeEach(async () => {
      await service.save(TENANT, { provider: 'RAZORPAY', config: CONFIG, verificationToken: await tokenFor(CONFIG) });
      audits = [];
    });

    it('re-tests with the new value plus the decrypted existing values, then stores it encrypted', async () => {
      const res = await service.replaceSecret(TENANT, { fieldKey: 'key_secret', value: 'NEWSECRET' });
      assert.deepEqual(res, { fieldKey: 'key_secret', configured: true });
      assert.deepEqual(testedWith, { key_id: 'rzp_test_abc', key_secret: 'NEWSECRET', webhook_secret: 'PLAINWEBHOOK' });
      assert.equal(crypto.decrypt(row!.configJson.key_secret), 'NEWSECRET');
      assert.ok(!JSON.stringify(row!.configJson).includes('NEWSECRET'));
      assert.equal(crypto.decrypt(row!.configJson.webhook_secret), 'PLAINWEBHOOK');
    });

    it('audits the replacement with the field name only', async () => {
      await service.replaceSecret(TENANT, { fieldKey: 'key_secret', value: 'NEWSECRET' });
      assert.equal(audits[0].action, 'GATEWAY_SECRET_REPLACED');
      assert.deepEqual(audits[0].payload, { provider: 'RAZORPAY', fieldKey: 'key_secret' });
    });

    it('keeps the old secret and writes no audit when the re-test fails', async () => {
      testResult = { success: false, message: 'Razorpay rejected these credentials' };
      assert.equal(
        await codeOf(service.replaceSecret(TENANT, { fieldKey: 'key_secret', value: 'BAD' })),
        ErrorCode.CONNECTION_FAILED,
      );
      assert.equal(crypto.decrypt(row!.configJson.key_secret), 'PLAINSECRET');
      assert.equal(audits.length, 0);
    });

    it('rejects non-secret and unknown fields', async () => {
      assert.equal(await codeOf(service.replaceSecret(TENANT, { fieldKey: 'key_id', value: 'x' })), ErrorCode.VALIDATION_ERROR);
      assert.equal(await codeOf(service.replaceSecret(TENANT, { fieldKey: 'nope', value: 'x' })), ErrorCode.VALIDATION_ERROR);
    });

    it('returns NOT_FOUND when there is no config', async () => {
      row = null;
      assert.equal(await codeOf(service.replaceSecret(TENANT, { fieldKey: 'key_secret', value: 'x' })), ErrorCode.NOT_FOUND);
    });
  });
});
