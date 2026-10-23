// FILE: modules/webhooks/gateway-webhook.service.spec.ts
// PURPOSE: Unit tests for Razorpay webhook intake: signature, routing by order id, status updates, idempotency
// DEPENDENCIES: node:test
// PHASE: 5
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { beforeEach, describe, it } from 'node:test';
import { AppException } from '../../common/types/app.exception';
import { ErrorCode } from '../../common/types/error-codes';
import { AuditService } from '../audit/audit.service';
import { GatewayConfigService } from '../gateway-config/gateway-config.service';
import { PaymentStatus } from '../payments/payment-status';
import { PaymentsRepository } from '../payments/payments.repository';
import { PaymentsService } from '../payments/payments.service';
import {
  appConfig,
  auditLog,
  crypto,
  FakePaymentsRepo,
  fakeAudit,
  fakeGateway,
  fakeRegistry,
  makePayment,
  PROVIDER_ID,
  ScriptedProvider,
  WEBHOOK_SECRET,
} from '../payments/payments.test-utils';
import { ProvidersService } from '../providers/providers.service';
import { ProviderRegistry } from '../providers/registry/provider.registry';
import { GatewayWebhookService } from './gateway-webhook.service';

const sign = (raw: Buffer, secret = WEBHOOK_SECRET): string => createHmac('sha256', secret).update(raw).digest('hex');

function event(name: string, over: Record<string, unknown> = {}): Buffer {
  return Buffer.from(
    JSON.stringify({
      event: name,
      payload: {
        payment: {
          entity: {
            id: 'pay_RZP1',
            order_id: 'order_ABC',
            status: name === 'payment.failed' ? 'failed' : 'captured',
            amount: 100,
            currency: 'INR',
            amount_refunded: 0,
            ...over,
          },
        },
      },
    }),
  );
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppException) return e.errorCode;
  }
  return 'NO_ERROR';
}

describe('GatewayWebhookService (Razorpay)', () => {
  let repo: FakePaymentsRepo;
  let service: GatewayWebhookService;
  let configured: boolean;

  function build(): void {
    repo = new FakePaymentsRepo();
    auditLog.length = 0;
    const provider = new ScriptedProvider();
    const gateway = fakeGateway(provider, { configured }) as unknown as GatewayConfigService;
    const registry = fakeRegistry(provider) as unknown as ProviderRegistry;
    const payments = new PaymentsService(
      repo as unknown as PaymentsRepository,
      gateway,
      registry,
      fakeAudit as unknown as AuditService,
      crypto,
      appConfig,
    );
    const providers = {
      getActiveProvider: async () => ({ provider: { id: PROVIDER_ID, code: 'RAZORPAY' }, fields: [] }),
    } as unknown as ProvidersService;
    service = new GatewayWebhookService(registry, providers, payments, repo as unknown as PaymentsRepository, gateway);
  }

  beforeEach(() => {
    configured = true;
    build();
    repo.add(makePayment());
  });

  it('marks the payment SUCCESS on a signed payment.captured and stores the event', async () => {
    const raw = event('payment.captured');
    assert.deepEqual(await service.handleRazorpay(raw, sign(raw)), { received: true });
    const p = repo.payments.get('pid-1')!;
    assert.equal(p.status, PaymentStatus.SUCCESS);
    assert.equal(p.providerPaymentId, 'pay_RZP1');
    assert.deepEqual(repo.events.map((e) => e.eventType), ['PAYMENT_SUCCESS']);
    assert.equal(repo.events[0].payload.transactionId, 'pay_RZP1');
    assert.equal(repo.events[0].payload.gateway, 'RAZORPAY');
  });

  it('marks the payment FAILED on payment.failed', async () => {
    const raw = event('payment.failed');
    await service.handleRazorpay(raw, sign(raw));
    assert.equal(repo.payments.get('pid-1')!.status, PaymentStatus.FAILED);
  });

  it('handles order.paid like a capture', async () => {
    const raw = event('order.paid');
    await service.handleRazorpay(raw, sign(raw));
    assert.equal(repo.payments.get('pid-1')!.status, PaymentStatus.SUCCESS);
  });

  it('is idempotent: Razorpay retries do not duplicate events', async () => {
    const raw = event('payment.captured');
    await service.handleRazorpay(raw, sign(raw));
    await service.handleRazorpay(raw, sign(raw));
    await service.handleRazorpay(raw, sign(raw));
    assert.equal(repo.events.length, 1);
  });

  it('keeps SUCCESS when a late payment.failed arrives', async () => {
    const ok = event('payment.captured');
    await service.handleRazorpay(ok, sign(ok));
    const late = event('payment.failed');
    await service.handleRazorpay(late, sign(late));
    assert.equal(repo.payments.get('pid-1')!.status, PaymentStatus.SUCCESS);
    assert.equal(repo.events.length, 1);
  });

  it('applies a full refund after SUCCESS and ignores a partial one', async () => {
    const ok = event('payment.captured');
    await service.handleRazorpay(ok, sign(ok));
    const partial = event('refund.processed', { status: 'captured', amount_refunded: 40 });
    await service.handleRazorpay(partial, sign(partial));
    assert.equal(repo.payments.get('pid-1')!.status, PaymentStatus.SUCCESS);
    const full = event('refund.processed', { status: 'refunded', amount_refunded: 100 });
    await service.handleRazorpay(full, sign(full));
    assert.equal(repo.payments.get('pid-1')!.status, PaymentStatus.REFUNDED);
  });

  it('rejects a bad, missing or wrong-secret signature with 401 and changes nothing', async () => {
    const raw = event('payment.captured');
    assert.equal(await codeOf(service.handleRazorpay(raw, 'deadbeef')), ErrorCode.UNAUTHORIZED);
    assert.equal(await codeOf(service.handleRazorpay(raw, undefined)), ErrorCode.UNAUTHORIZED);
    assert.equal(await codeOf(service.handleRazorpay(raw, sign(raw, 'attacker-secret'))), ErrorCode.UNAUTHORIZED);
    assert.equal(repo.payments.get('pid-1')!.status, PaymentStatus.PENDING);
    assert.equal(repo.events.length, 0);
  });

  it('rejects a body modified after signing', async () => {
    const raw = event('payment.captured');
    const sig = sign(raw);
    const tampered = event('payment.captured', { amount: 1 });
    assert.equal(await codeOf(service.handleRazorpay(tampered, sig)), ErrorCode.UNAUTHORIZED);
  });

  it('rejects when the tenant has no verified gateway config (nothing to verify against)', async () => {
    configured = false;
    build();
    repo.add(makePayment());
    const raw = event('payment.captured');
    assert.equal(await codeOf(service.handleRazorpay(raw, sign(raw))), ErrorCode.UNAUTHORIZED);
  });

  it('acknowledges events for unknown orders without error', async () => {
    const raw = event('payment.captured', { order_id: 'order_UNKNOWN' });
    assert.deepEqual(await service.handleRazorpay(raw, 'whatever'), { received: true });
    assert.equal(repo.events.length, 0);
  });

  it('acknowledges untracked event types after verifying them', async () => {
    const raw = event('payment.authorized', { status: 'authorized' });
    assert.deepEqual(await service.handleRazorpay(raw, sign(raw)), { received: true });
    assert.equal(repo.payments.get('pid-1')!.status, PaymentStatus.PENDING);
  });

  it('does not mark SUCCESS when the amount or currency does not match', async () => {
    const wrongAmount = event('payment.captured', { amount: 100000 });
    await service.handleRazorpay(wrongAmount, sign(wrongAmount));
    const wrongCurrency = event('payment.captured', { currency: 'USD' });
    await service.handleRazorpay(wrongCurrency, sign(wrongCurrency));
    assert.equal(repo.payments.get('pid-1')!.status, PaymentStatus.PENDING);
    assert.equal(repo.events.length, 0);
  });

  it('returns 400 for an empty or non-event body', async () => {
    assert.equal(await codeOf(service.handleRazorpay(undefined, 'x')), ErrorCode.VALIDATION_ERROR);
    assert.equal(await codeOf(service.handleRazorpay(Buffer.from('nope'), 'x')), ErrorCode.VALIDATION_ERROR);
  });

  it('audits completion', async () => {
    const raw = event('payment.captured');
    await service.handleRazorpay(raw, sign(raw));
    assert.deepEqual(auditLog.map((a) => a.action), ['PAYMENT_COMPLETED']);
  });
});
