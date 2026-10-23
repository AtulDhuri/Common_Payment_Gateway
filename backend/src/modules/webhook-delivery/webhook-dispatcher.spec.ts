// FILE: modules/webhook-delivery/webhook-dispatcher.spec.ts
// PURPOSE: Unit tests for the dispatcher: signing, outcome recording, retries, final failure, inactive endpoints, isolation of errors
// DEPENDENCIES: node:test
// PHASE: 8
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { beforeEach, describe, it } from 'node:test';
import { AppConfig } from '../../config/configuration';
import { AuditEntry, AuditService } from '../audit/audit.service';
import { CryptoService } from '../crypto/crypto.service';
import { DeliveryStatus } from './entities/webhook-event.entity';
import { WebhookConfig } from './entities/webhook-config.entity';
import { ClaimedDelivery, WebhookDeliveryRepository } from './webhook-delivery.repository';
import { WebhookDispatcher } from './webhook-dispatcher';
import { TransportResult, WebhookTransport } from './webhook-transport';

const crypto = new CryptoService({ masterEncryptionKey: randomBytes(32) } as AppConfig);
const SECRET = 'whsec_dispatcher_test';
const DELAYS = [60, 300, 1800, 7200, 43200];

const delivery = (over: Partial<ClaimedDelivery> = {}): ClaimedDelivery => ({
  id: 'del-1',
  tenantId: 't1',
  paymentId: 'p1',
  eventType: 'PAYMENT_SUCCESS',
  requestPayload: { event: 'PAYMENT_SUCCESS', paymentId: 'pay_1', amount: 1, metadata: { orderId: 'A' } },
  attemptCount: 0,
  ...over,
});

interface Recorded {
  id: string;
  status: DeliveryStatus;
  code: number | null;
  url: string;
  retryIn: number | null;
}

describe('WebhookDispatcher', () => {
  let claimed: ClaimedDelivery[];
  let cfg: WebhookConfig | null;
  let recorded: Recorded[];
  let failedUnsent: string[];
  let audits: AuditEntry[];
  let sent: { url: string; body: string; headers: Record<string, string> }[];
  let result: (url: string) => TransportResult;
  let recordFails: boolean;
  let dispatcher: WebhookDispatcher;

  beforeEach(() => {
    claimed = [];
    cfg = { id: 'c', tenantId: 't1', webhookUrl: 'https://shop.example.com/hook', webhookSecret: crypto.encrypt(SECRET), isActive: true } as WebhookConfig;
    recorded = [];
    failedUnsent = [];
    audits = [];
    sent = [];
    recordFails = false;
    result = () => ({ statusCode: 200, error: null });

    const repo = {
      claimDue: async () => claimed,
      findConfig: async () => cfg,
      recordAttempt: async (id: string, status: DeliveryStatus, code: number | null, url: string, retryIn: number | null) => {
        if (recordFails) throw new Error('db down');
        recorded.push({ id, status, code, url, retryIn });
      },
      failWithoutSending: async (id: string) => void failedUnsent.push(id),
    } as unknown as WebhookDeliveryRepository;
    const transport = {
      post: async (url: string, body: string, headers: Record<string, string>) => {
        sent.push({ url, body, headers });
        return result(url);
      },
    } as unknown as WebhookTransport;
    dispatcher = new WebhookDispatcher(
      repo,
      transport,
      crypto,
      { record: async (e: AuditEntry) => void audits.push(e) } as unknown as AuditService,
      { webhooks: { retryDelaysSeconds: DELAYS } } as AppConfig,
    );
  });

  it('does nothing when nothing is due', async () => {
    assert.equal(await dispatcher.processDue(), 0);
    assert.equal(sent.length, 0);
  });

  it('sends the stored payload, signed with the merchant\'s decrypted secret, and the stable delivery id', async () => {
    claimed = [delivery()];
    await dispatcher.processDue();
    assert.equal(sent.length, 1);
    const s = sent[0];
    assert.equal(s.url, 'https://shop.example.com/hook');
    assert.deepEqual(JSON.parse(s.body), claimed[0].requestPayload);
    assert.equal(s.headers['x-paymenthub-delivery-id'], 'del-1');
    assert.equal(s.headers['x-paymenthub-event'], 'PAYMENT_SUCCESS');
    const ts = s.headers['x-paymenthub-timestamp'];
    assert.match(ts, /^\d{10}$/);
    assert.equal(s.headers['x-paymenthub-signature'], 'sha256=' + createHmac('sha256', SECRET).update(`${ts}.${s.body}`).digest('hex'));
    assert.ok(!JSON.stringify(s.headers).includes(SECRET));
  });

  it('marks a 2xx as DELIVERED and audits it', async () => {
    claimed = [delivery()];
    await dispatcher.processDue();
    assert.deepEqual(recorded, [{ id: 'del-1', status: 'DELIVERED', code: 200, url: 'https://shop.example.com/hook', retryIn: null }]);
    assert.deepEqual(audits.map((a) => a.action), ['WEBHOOK_DELIVERED']);
  });

  it('a failure schedules the next retry on the documented delay and does not audit yet', async () => {
    result = () => ({ statusCode: 500, error: null });
    claimed = [delivery({ attemptCount: 0 }), delivery({ id: 'del-2', attemptCount: 2 })];
    await dispatcher.processDue();
    assert.deepEqual(recorded.map((r) => [r.id, r.status, r.code, r.retryIn]), [['del-1', 'PENDING', 500, 60], ['del-2', 'PENDING', 500, 1800]]);
    assert.equal(audits.length, 0);
  });

  it('a connection failure (no status) is retried too', async () => {
    result = () => ({ statusCode: null, error: 'ECONNREFUSED' });
    claimed = [delivery()];
    await dispatcher.processDue();
    assert.deepEqual(recorded.map((r) => [r.status, r.code, r.retryIn]), [['PENDING', null, 60]]);
  });

  it('a redirect is a failure and is retried', async () => {
    result = () => ({ statusCode: 301, error: null });
    claimed = [delivery()];
    await dispatcher.processDue();
    assert.equal(recorded[0].status, 'PENDING');
  });

  it('after the sixth failed attempt the delivery is FAILED, audited, and not retried', async () => {
    result = () => ({ statusCode: 503, error: null });
    claimed = [delivery({ attemptCount: 5 })];
    await dispatcher.processDue();
    assert.deepEqual(recorded, [{ id: 'del-1', status: 'FAILED', code: 503, url: 'https://shop.example.com/hook', retryIn: null }]);
    assert.deepEqual(audits.map((a) => a.action), ['WEBHOOK_FAILED']);
    assert.equal((audits[0].payload as { attempts: number }).attempts, 6);
  });

  it('a late success after earlier failures is DELIVERED', async () => {
    claimed = [delivery({ attemptCount: 3 })];
    await dispatcher.processDue();
    assert.equal(recorded[0].status, 'DELIVERED');
  });

  it('uses the merchant\'s CURRENT url, so fixing a wrong URL rescues pending retries', async () => {
    cfg!.webhookUrl = 'https://shop.example.com/fixed';
    claimed = [delivery({ attemptCount: 2 })];
    await dispatcher.processDue();
    assert.equal(sent[0].url, 'https://shop.example.com/fixed');
    assert.equal(recorded[0].url, 'https://shop.example.com/fixed');
  });

  it('uses the CURRENT secret after a rotation', async () => {
    cfg!.webhookSecret = crypto.encrypt('whsec_new');
    claimed = [delivery()];
    await dispatcher.processDue();
    const ts = sent[0].headers['x-paymenthub-timestamp'];
    assert.equal(sent[0].headers['x-paymenthub-signature'], 'sha256=' + createHmac('sha256', 'whsec_new').update(`${ts}.${sent[0].body}`).digest('hex'));
  });

  it('closes a delivery without sending when the endpoint is inactive or removed', async () => {
    cfg!.isActive = false;
    claimed = [delivery()];
    await dispatcher.processDue();
    cfg = null;
    claimed = [delivery({ id: 'del-2' })];
    await dispatcher.processDue();
    assert.deepEqual(failedUnsent, ['del-1', 'del-2']);
    assert.equal(sent.length, 0);
    assert.deepEqual(audits.map((a) => a.action), ['WEBHOOK_FAILED', 'WEBHOOK_FAILED']);
  });

  it('an error on one delivery does not stop the others, and the failed one is left for the lease to expire', async () => {
    let n = 0;
    result = () => {
      n += 1;
      if (n === 1) throw new Error('boom');
      return { statusCode: 200, error: null };
    };
    claimed = [delivery({ id: 'bad' }), delivery({ id: 'good' })];
    await dispatcher.processDue();
    assert.deepEqual(recorded.map((r) => r.id), ['good']);
  });

  it('survives the database failing while recording a result', async () => {
    recordFails = true;
    claimed = [delivery()];
    await assert.doesNotReject(dispatcher.processDue());
  });

  it('never puts the signing secret or the URL in audit entries', async () => {
    result = () => ({ statusCode: 500, error: null });
    claimed = [delivery({ attemptCount: 5 })];
    await dispatcher.processDue();
    const json = JSON.stringify(audits);
    assert.ok(!json.includes(SECRET) && !json.includes('shop.example.com'));
  });
});
