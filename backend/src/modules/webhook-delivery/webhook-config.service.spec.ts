// FILE: modules/webhook-delivery/webhook-config.service.spec.ts
// PURPOSE: Unit tests for webhook endpoint configuration: secret shown once, encrypted at rest, URL rules, audit
// DEPENDENCIES: node:test
// PHASE: 8
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { beforeEach, describe, it } from 'node:test';
import { AppException } from '../../common/types/app.exception';
import { ErrorCode } from '../../common/types/error-codes';
import { AppConfig } from '../../config/configuration';
import { AuditEntry, AuditService } from '../audit/audit.service';
import { CryptoService } from '../crypto/crypto.service';
import { SECRET_MASK } from './dto/webhook-config.dto';
import { WebhookConfig } from './entities/webhook-config.entity';
import { WebhookConfigService } from './webhook-config.service';
import { WebhookDeliveryRepository } from './webhook-delivery.repository';

const crypto = new CryptoService({ masterEncryptionKey: randomBytes(32) } as AppConfig);

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppException) return e.errorCode;
  }
  return 'NO_ERROR';
}

function build(isProduction = false): { svc: () => WebhookConfigService; store: { cfg: WebhookConfig | null }; audits: AuditEntry[] } {
  const store: { cfg: WebhookConfig | null } = { cfg: null };
  const audits: AuditEntry[] = [];
  const repo = {
    findConfig: async () => store.cfg,
    createConfig: (v: Partial<WebhookConfig>) => ({ id: 'cfg-1', ...v }) as WebhookConfig,
    saveConfig: async (c: WebhookConfig) => {
      store.cfg = c;
      return c;
    },
    listForTenant: async (t: string, page: number, limit: number) => [[{ id: 'd1', tenant: t, page, limit }], 7],
  } as unknown as WebhookDeliveryRepository;
  const audit = { record: async (e: AuditEntry) => void audits.push(e) } as unknown as AuditService;
  return { svc: () => new WebhookConfigService(repo, crypto, audit, { isProduction } as AppConfig), store, audits };
}

describe('WebhookConfigService', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it('first save creates the endpoint and returns the signing secret once', async () => {
    const res = await ctx.svc().upsert('t1', { url: 'https://shop.example.com/hook' });
    assert.match(res.secret, /^whsec_/);
    assert.equal(res.secretShownOnce, true);
    assert.equal(res.isActive, true);
  });

  it('stores the secret encrypted, never in plaintext', async () => {
    const res = await ctx.svc().upsert('t1', { url: 'https://shop.example.com/hook' });
    const stored = ctx.store.cfg!;
    assert.ok(crypto.isEnvelope(stored.webhookSecret));
    assert.ok(!stored.webhookSecret.includes(res.secret));
    assert.equal(crypto.decrypt(stored.webhookSecret), res.secret);
  });

  it('later reads and updates return the secret masked, with secretShownOnce false', async () => {
    const first = await ctx.svc().upsert('t1', { url: 'https://shop.example.com/hook' });
    const got = await ctx.svc().get('t1');
    assert.deepEqual(got, { url: 'https://shop.example.com/hook', isActive: true, secret: SECRET_MASK, secretShownOnce: false });
    const updated = await ctx.svc().upsert('t1', { url: 'https://shop.example.com/other' });
    assert.equal(updated.secret, SECRET_MASK);
    assert.ok(!JSON.stringify([got, updated]).includes(first.secret));
  });

  it('an update changes the URL and the active flag but keeps the same secret', async () => {
    const first = await ctx.svc().upsert('t1', { url: 'https://shop.example.com/a' });
    await ctx.svc().upsert('t1', { url: 'https://shop.example.com/b', isActive: false });
    assert.equal(ctx.store.cfg!.webhookUrl, 'https://shop.example.com/b');
    assert.equal(ctx.store.cfg!.isActive, false);
    assert.equal(crypto.decrypt(ctx.store.cfg!.webhookSecret), first.secret);
  });

  it('rotating returns a new secret once; the old one no longer decrypts from storage', async () => {
    const first = await ctx.svc().upsert('t1', { url: 'https://shop.example.com/hook' });
    const rotated = await ctx.svc().rotateSecret('t1');
    assert.notEqual(rotated.secret, first.secret);
    assert.equal(rotated.secretShownOnce, true);
    assert.equal(crypto.decrypt(ctx.store.cfg!.webhookSecret), rotated.secret);
  });

  it('get and rotate return NOT_FOUND before an endpoint exists', async () => {
    assert.equal(await codeOf(ctx.svc().get('t1')), ErrorCode.NOT_FOUND);
    assert.equal(await codeOf(ctx.svc().rotateSecret('t1')), ErrorCode.NOT_FOUND);
  });

  it('audits create, update and rotate with field names only, never the secret or URL', async () => {
    const first = await ctx.svc().upsert('t1', { url: 'https://shop.example.com/hook?token=abc' });
    await ctx.svc().upsert('t1', { url: 'https://shop.example.com/two' });
    const rotated = await ctx.svc().rotateSecret('t1');
    assert.deepEqual(ctx.audits.map((a) => a.action), ['WEBHOOK_CONFIG_CREATED', 'WEBHOOK_CONFIG_UPDATED', 'WEBHOOK_SECRET_ROTATED']);
    const json = JSON.stringify(ctx.audits);
    assert.ok(!json.includes(first.secret) && !json.includes(rotated.secret) && !json.includes('shop.example.com') && !json.includes('token=abc'));
  });

  it('does not audit an update that changes nothing', async () => {
    await ctx.svc().upsert('t1', { url: 'https://shop.example.com/hook' });
    ctx.audits.length = 0;
    await ctx.svc().upsert('t1', { url: 'https://shop.example.com/hook' });
    assert.equal(ctx.audits.length, 0);
  });

  it('rejects unsafe URLs with a field-level reason and stores nothing', async () => {
    for (const url of ['ftp://x.example.com/h', 'https://user:pw@x.example.com/h', 'not a url']) {
      assert.equal(await codeOf(ctx.svc().upsert('t1', { url })), ErrorCode.VALIDATION_ERROR, url);
    }
    assert.equal(ctx.store.cfg, null);
  });

  it('in production also rejects http and private/local addresses', async () => {
    const prod = build(true);
    for (const url of ['http://shop.example.com/h', 'https://localhost/h', 'https://10.0.0.5/h', 'https://169.254.169.254/x']) {
      assert.equal(await codeOf(prod.svc().upsert('t1', { url })), ErrorCode.VALIDATION_ERROR, url);
    }
    assert.equal((await prod.svc().upsert('t1', { url: 'https://shop.example.com/h' })).secretShownOnce, true);
  });

  it('outside production allows localhost for testing', async () => {
    assert.equal((await ctx.svc().upsert('t1', { url: 'http://localhost:4000/webhook' })).isActive, true);
  });

  it('passes paging through to the delivery log with defaults', async () => {
    const res = await ctx.svc().listDeliveries('t9');
    assert.equal(res.total, 7);
    assert.equal(res.page, 1);
    assert.equal(res.limit, 20);
  });
});
