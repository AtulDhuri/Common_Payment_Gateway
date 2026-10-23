// FILE: modules/payments/payments.service.spec.ts
// PURPOSE: Unit tests for payment creation, status reads and outcome application
// DEPENDENCIES: node:test
// PHASE: 5
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { AppException } from '../../common/types/app.exception';
import { ErrorCode } from '../../common/types/error-codes';
import { ProviderCallError } from '../providers/interfaces/payment-provider.interface';
import { AuditService } from '../audit/audit.service';
import { GatewayConfigService } from '../gateway-config/gateway-config.service';
import { ProviderRegistry } from '../providers/registry/provider.registry';
import { PaymentStatus } from './payment-status';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService, toMinorUnits } from './payments.service';
import {
  appConfig,
  auditLog,
  crypto,
  FakePaymentsRepo,
  fakeAudit,
  fakeGateway,
  fakeRegistry,
  makePayment,
  ScriptedProvider,
  TENANT,
} from './payments.test-utils';

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppException) return e.errorCode;
  }
  return 'NO_ERROR';
}

const DTO = {
  amount: 1,
  currency: 'INR',
  customer: { name: 'John', email: 'john@example.com' },
  metadata: { orderId: 'FOOD-1001' },
};

describe('toMinorUnits', () => {
  it('converts major to minor units without float drift', () => {
    assert.equal(toMinorUnits(1), 100);
    assert.equal(toMinorUnits(499), 49900);
    assert.equal(toMinorUnits(0.29), 29);
    assert.equal(toMinorUnits(19.99), 1999);
    assert.equal(toMinorUnits(1.1), 110);
  });
});

describe('PaymentsService', () => {
  let repo: FakePaymentsRepo;
  let provider: ScriptedProvider;
  let service: PaymentsService;
  let gatewayConfigured: boolean;

  function build(): void {
    repo = new FakePaymentsRepo();
    provider = new ScriptedProvider();
    auditLog.length = 0;
    service = new PaymentsService(
      repo as unknown as PaymentsRepository,
      fakeGateway(provider, { configured: gatewayConfigured }) as unknown as GatewayConfigService,
      fakeRegistry(provider) as unknown as ProviderRegistry,
      fakeAudit as unknown as AuditService,
      crypto,
      appConfig,
    );
  }

  beforeEach(() => {
    gatewayConfigured = true;
    build();
  });

  describe('create', () => {
    it('creates a gateway order in minor units, stores a PENDING payment and returns the checkout URL', async () => {
      const res = await service.create(TENANT, DTO);
      assert.match(res.paymentId, /^pay_[a-f0-9]{20}$/);
      assert.equal(res.status, 'PENDING');
      assert.equal(provider.orderCalls.length, 1);
      assert.equal(provider.orderCalls[0].amountMinor, 100);
      assert.equal(provider.orderCalls[0].currency, 'INR');
      assert.equal(provider.orderCalls[0].receipt, res.paymentId);

      const stored = [...repo.payments.values()][0];
      assert.equal(stored.status, PaymentStatus.PENDING);
      assert.equal(stored.providerOrderId, 'order_ABC');
      assert.deepEqual(stored.metadata, { orderId: 'FOOD-1001' });
      assert.equal(res.checkoutUrl, `https://hub.test/api/v1/checkout/${res.paymentId}?t=${stored.checkoutToken}`);
    });

    it('records a PAYMENT_CREATED event with the normalized payload and an audit entry', async () => {
      const res = await service.create(TENANT, DTO);
      assert.equal(repo.events.length, 1);
      assert.equal(repo.events[0].eventType, 'PAYMENT_CREATED');
      const p = repo.events[0].payload;
      assert.equal(p.paymentId, res.paymentId);
      assert.equal(p.status, 'PENDING');
      assert.equal(p.amount, 1);
      assert.equal(p.gateway, 'RAZORPAY');
      assert.deepEqual(p.metadata, { orderId: 'FOOD-1001' });
      assert.match(String(p.customerId), /^cust_[a-f0-9]{16}$/);
      assert.deepEqual(auditLog.map((a) => a.action), ['PAYMENT_CREATED']);
    });

    it('generates an unguessable checkout token and a unique reference each time', async () => {
      const a = await service.create(TENANT, DTO);
      const b = await service.create(TENANT, DTO);
      assert.notEqual(a.paymentId, b.paymentId);
      const tokens = [...repo.payments.values()].map((p) => p.checkoutToken);
      assert.notEqual(tokens[0], tokens[1]);
      assert.ok(tokens[0].length >= 32);
    });

    it('returns the same payment for a repeated Idempotency-Key without a second gateway order', async () => {
      const a = await service.create(TENANT, DTO, 'key-1');
      const b = await service.create(TENANT, DTO, 'key-1');
      assert.deepEqual(a, b);
      assert.equal(provider.orderCalls.length, 1);
      assert.equal(repo.payments.size, 1);
    });

    it('treats different Idempotency-Keys as different payments', async () => {
      const a = await service.create(TENANT, DTO, 'key-1');
      const b = await service.create(TENANT, DTO, 'key-2');
      assert.notEqual(a.paymentId, b.paymentId);
    });

    it('rejects an empty or oversized Idempotency-Key', async () => {
      assert.equal(await codeOf(service.create(TENANT, DTO, '')), ErrorCode.VALIDATION_ERROR);
      assert.equal(await codeOf(service.create(TENANT, DTO, 'k'.repeat(256))), ErrorCode.VALIDATION_ERROR);
    });

    it('maps a gateway failure to PROVIDER_ERROR with a safe message and stores nothing', async () => {
      provider.nextOrder = new ProviderCallError('The gateway rejected the stored credentials', 401);
      try {
        await service.create(TENANT, DTO);
        assert.fail('should throw');
      } catch (e) {
        assert.ok(e instanceof AppException);
        assert.equal(e.errorCode, ErrorCode.PROVIDER_ERROR);
        assert.equal(e.httpStatus, 502);
      }
      assert.equal(repo.payments.size, 0);
    });

    it('does not leak unexpected provider error text', async () => {
      provider.nextOrder = new Error('connect ECONNREFUSED key_secret=key-secret-123');
      try {
        await service.create(TENANT, DTO);
        assert.fail('should throw');
      } catch (e) {
        assert.ok(e instanceof AppException);
        assert.ok(!e.message.includes('key-secret-123'));
      }
    });

    it('fails with CONFIG_NOT_VERIFIED when the merchant has no verified gateway', async () => {
      gatewayConfigured = false;
      build();
      assert.equal(await codeOf(service.create(TENANT, DTO)), ErrorCode.CONFIG_NOT_VERIFIED);
      assert.equal(provider.orderCalls.length, 0);
    });
  });

  describe('get', () => {
    it('returns the stored status without calling the gateway when not PENDING', async () => {
      repo.add(makePayment({ status: PaymentStatus.SUCCESS }));
      provider.nextDetails = new Error('should not be called');
      const res = await service.get(TENANT, 'pay_0123456789abcdef0123');
      assert.deepEqual(res, {
        paymentId: 'pay_0123456789abcdef0123',
        status: 'SUCCESS',
        amount: 1,
        currency: 'INR',
        transactionId: null,
      });
    });

    it('is scoped to the tenant', async () => {
      repo.add(makePayment());
      assert.equal(await codeOf(service.get('other-tenant', 'pay_0123456789abcdef0123')), ErrorCode.PAYMENT_NOT_FOUND);
      assert.equal(await codeOf(service.get(TENANT, 'pay_ffffffffffffffffffff')), ErrorCode.PAYMENT_NOT_FOUND);
    });

    it('refreshes a PENDING payment from the gateway and records the event', async () => {
      repo.add(makePayment());
      provider.nextDetails = {
        providerPaymentId: 'pay_RZP1',
        providerOrderId: 'order_ABC',
        status: 'SUCCESS',
        amountMinor: 100,
        currency: 'INR',
      };
      const res = await service.get(TENANT, 'pay_0123456789abcdef0123');
      assert.equal(res.status, 'SUCCESS');
      assert.equal(repo.payments.get('pid-1')?.providerPaymentId, 'pay_RZP1');
      assert.deepEqual(repo.events.map((e) => e.eventType), ['PAYMENT_SUCCESS']);
      assert.equal(repo.events[0].payload.transactionId, 'pay_RZP1');
    });

    it('does not mark SUCCESS when the gateway amount differs', async () => {
      repo.add(makePayment());
      provider.nextDetails = {
        providerPaymentId: 'pay_RZP1',
        providerOrderId: 'order_ABC',
        status: 'SUCCESS',
        amountMinor: 1,
        currency: 'INR',
      };
      assert.equal((await service.get(TENANT, 'pay_0123456789abcdef0123')).status, 'PENDING');
      assert.equal(repo.events.length, 0);
    });

    it('stays PENDING when the gateway has nothing yet or errors', async () => {
      repo.add(makePayment());
      assert.equal((await service.get(TENANT, 'pay_0123456789abcdef0123')).status, 'PENDING');
      provider.nextDetails = new ProviderCallError('down');
      assert.equal((await service.get(TENANT, 'pay_0123456789abcdef0123')).status, 'PENDING');
    });
  });

  describe('applyOutcome', () => {
    it('applies SUCCESS once and audits it; a repeat is a no-op', async () => {
      const p = repo.add(makePayment());
      await service.applyOutcome({ ...p }, 'RAZORPAY', PaymentStatus.SUCCESS, 'pay_RZP1');
      await service.applyOutcome({ ...p }, 'RAZORPAY', PaymentStatus.SUCCESS, 'pay_RZP1');
      assert.equal(repo.events.length, 1);
      assert.deepEqual(auditLog.map((a) => a.action), ['PAYMENT_COMPLETED']);
    });

    it('stores one event when two callers race with the same stale snapshot', async () => {
      const p = repo.add(makePayment());
      const stale1 = { ...p };
      const stale2 = { ...p };
      await Promise.all([
        service.applyOutcome(stale1, 'RAZORPAY', PaymentStatus.SUCCESS, 'pay_RZP1'),
        service.applyOutcome(stale2, 'RAZORPAY', PaymentStatus.SUCCESS, 'pay_RZP1'),
      ]);
      assert.equal(repo.events.length, 1);
    });

    it('ignores FAILED after SUCCESS', async () => {
      const p = repo.add(makePayment({ status: PaymentStatus.SUCCESS }));
      const res = await service.applyOutcome({ ...p }, 'RAZORPAY', PaymentStatus.FAILED, null);
      assert.equal(res.status, PaymentStatus.SUCCESS);
      assert.equal(repo.events.length, 0);
    });

    it('allows FAILED then SUCCESS (customer retried)', async () => {
      const p = repo.add(makePayment());
      await service.applyOutcome({ ...p }, 'RAZORPAY', PaymentStatus.FAILED, null);
      const res = await service.applyOutcome({ ...repo.payments.get('pid-1')! }, 'RAZORPAY', PaymentStatus.SUCCESS, 'pay_RZP2');
      assert.equal(res.status, PaymentStatus.SUCCESS);
      assert.deepEqual(repo.events.map((e) => e.eventType), ['PAYMENT_FAILED', 'PAYMENT_SUCCESS']);
    });

    it('moves SUCCESS to REFUNDED', async () => {
      const p = repo.add(makePayment({ status: PaymentStatus.SUCCESS }));
      const res = await service.applyOutcome({ ...p }, 'RAZORPAY', PaymentStatus.REFUNDED, null);
      assert.equal(res.status, PaymentStatus.REFUNDED);
      assert.equal(repo.events[0].eventType, 'PAYMENT_REFUNDED');
    });
  });

  describe('matchesAmount', () => {
    it('compares minor units and currency case-insensitively', () => {
      const p = makePayment({ amount: 499, currency: 'INR' });
      assert.equal(service.matchesAmount(p, 49900, 'inr'), true);
      assert.equal(service.matchesAmount(p, 49901, 'INR'), false);
      assert.equal(service.matchesAmount(p, 49900, 'USD'), false);
      assert.equal(service.matchesAmount(p, null, 'INR'), false);
    });
  });
});
