// FILE: modules/checkout/checkout.service.spec.ts
// PURPOSE: Unit tests for hosted checkout (token, signature confirmation, cancel, redirects) and page rendering safety
// DEPENDENCIES: node:test
// PHASE: 5
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { beforeEach, describe, it } from 'node:test';
import { AppException } from '../../common/types/app.exception';
import { ErrorCode } from '../../common/types/error-codes';
import { AuditService } from '../audit/audit.service';
import { GatewayConfigService } from '../gateway-config/gateway-config.service';
import { MerchantService } from '../merchant/merchant.service';
import { PaymentStatus } from '../payments/payment-status';
import { PaymentsRepository } from '../payments/payments.repository';
import { PaymentsService } from '../payments/payments.service';
import {
  appConfig,
  crypto,
  FakePaymentsRepo,
  fakeAudit,
  fakeGateway,
  fakeRegistry,
  KEY_SECRET,
  makePayment,
  PROVIDER_ID,
  ScriptedProvider,
} from '../payments/payments.test-utils';
import { ProvidersService } from '../providers/providers.service';
import { ProviderRegistry } from '../providers/registry/provider.registry';
import { escapeHtml, renderCheckoutPage, safeJson } from './checkout.page';
import { CheckoutService } from './checkout.service';

const REF = 'pay_0123456789abcdef0123';
const TOKEN = 'tok_abc';
const sig = (order: string, pay: string, secret = KEY_SECRET): string =>
  createHmac('sha256', secret).update(`${order}|${pay}`).digest('hex');

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppException) return e.errorCode;
  }
  return 'NO_ERROR';
}

describe('CheckoutService', () => {
  let repo: FakePaymentsRepo;
  let gateway: ReturnType<typeof fakeGateway>;
  let service: CheckoutService;

  beforeEach(() => {
    repo = new FakePaymentsRepo();
    repo.add(makePayment({ customerName: '<b>John</b>' }));
    const provider = new ScriptedProvider();
    gateway = fakeGateway(provider);
    const registry = fakeRegistry(provider) as unknown as ProviderRegistry;
    const payments = new PaymentsService(
      repo as unknown as PaymentsRepository,
      gateway as unknown as GatewayConfigService,
      registry,
      fakeAudit as unknown as AuditService,
      crypto,
      appConfig,
    );
    service = new CheckoutService(
      repo as unknown as PaymentsRepository,
      payments,
      gateway as unknown as GatewayConfigService,
      registry,
      { getProviderById: async () => ({ provider: { id: PROVIDER_ID, code: 'RAZORPAY' }, fields: [] }) } as unknown as ProvidersService,
      { findBusinessName: async () => 'Food Co' } as unknown as MerchantService,
      crypto,
    );
  });

  it('gives the page only the public key, order, amount in paise and prefill', async () => {
    const view = await service.getView(REF, TOKEN);
    assert.equal(view.kind, 'pay');
    if (view.kind !== 'pay') return;
    assert.equal(view.keyId, 'rzp_test_abc');
    assert.equal(view.orderId, 'order_ABC');
    assert.equal(view.amountMinor, 100);
    assert.equal(view.businessName, 'Food Co');
    assert.ok(!JSON.stringify(view).includes(KEY_SECRET));
  });

  it('treats a wrong token and an unknown reference the same (404)', async () => {
    assert.equal(await codeOf(service.getView(REF, 'wrong')), ErrorCode.PAYMENT_NOT_FOUND);
    assert.equal(await codeOf(service.getView('pay_ffffffffffffffffffff', TOKEN)), ErrorCode.PAYMENT_NOT_FOUND);
    assert.equal(await codeOf(service.cancel(REF, 'wrong')), ErrorCode.PAYMENT_NOT_FOUND);
    assert.equal(
      await codeOf(service.complete(REF, 'wrong', { razorpay_payment_id: 'pay_X1', razorpay_signature: 'a'.repeat(64) })),
      ErrorCode.PAYMENT_NOT_FOUND,
    );
  });

  it('shows a result instead of the widget once the payment is final, with where to go next', async () => {
    gateway.redirects = { successUrl: 'https://app.test/ok', failureUrl: 'https://app.test/fail' };
    repo.add(makePayment({ status: PaymentStatus.SUCCESS }));
    const done = await service.getView(REF, TOKEN);
    assert.equal(done.kind, 'done');
    if (done.kind !== 'done') return;
    assert.equal(done.businessName, 'Food Co');
    assert.equal(done.reference, REF);
    const url = new URL(done.returnUrl as string);
    assert.equal(url.origin + url.pathname, 'https://app.test/ok');
    assert.equal(url.searchParams.get('status'), 'SUCCESS');

    repo.add(makePayment({ status: PaymentStatus.FAILED }));
    const failed = await service.getView(REF, TOKEN);
    assert.equal(failed.kind === 'done' && new URL(failed.returnUrl as string).pathname, '/fail');
  });

  it('gives a final payment no return URL when none is configured', async () => {
    repo.add(makePayment({ status: PaymentStatus.CANCELLED }));
    const done = await service.getView(REF, TOKEN);
    assert.equal(done.kind === 'done' && done.returnUrl, null);
  });

  it('pay view carries the merchant name and payment reference', async () => {
    const view = await service.getView(REF, TOKEN);
    assert.equal(view.kind === 'pay' && view.reference, REF);
  });

  it('confirms a payment with a valid signature and records SUCCESS', async () => {
    const res = await service.complete(REF, TOKEN, {
      razorpay_payment_id: 'pay_RZP1',
      razorpay_signature: sig('order_ABC', 'pay_RZP1'),
    });
    assert.equal(res.status, 'SUCCESS');
    assert.equal(repo.payments.get('pid-1')!.providerPaymentId, 'pay_RZP1');
    assert.deepEqual(repo.events.map((e) => e.eventType), ['PAYMENT_SUCCESS']);
  });

  it('rejects an invalid signature and leaves the payment PENDING', async () => {
    const code = await codeOf(
      service.complete(REF, TOKEN, { razorpay_payment_id: 'pay_RZP1', razorpay_signature: sig('order_ABC', 'pay_RZP1', 'wrong') }),
    );
    assert.equal(code, ErrorCode.INVALID_STATE);
    assert.equal(repo.payments.get('pid-1')!.status, PaymentStatus.PENDING);
  });

  it('verifies against the stored order id, not the one the browser sends', async () => {
    const code = await codeOf(
      service.complete(REF, TOKEN, {
        razorpay_payment_id: 'pay_RZP1',
        razorpay_order_id: 'order_EVIL',
        razorpay_signature: sig('order_EVIL', 'pay_RZP1'),
      }),
    );
    assert.equal(code, ErrorCode.INVALID_STATE);
  });

  it('is repeatable once SUCCESS', async () => {
    const dto = { razorpay_payment_id: 'pay_RZP1', razorpay_signature: sig('order_ABC', 'pay_RZP1') };
    await service.complete(REF, TOKEN, dto);
    assert.equal((await service.complete(REF, TOKEN, dto)).status, 'SUCCESS');
    assert.equal(repo.events.length, 1);
  });

  it('cancels a PENDING payment but never a SUCCESS one', async () => {
    assert.equal((await service.cancel(REF, TOKEN)).status, 'CANCELLED');
    repo.payments.get('pid-1')!.status = PaymentStatus.SUCCESS;
    assert.equal((await service.cancel(REF, TOKEN)).status, 'SUCCESS');
  });

  it('builds redirect URLs from tenant settings, keeping existing query params', async () => {
    gateway.redirects = { successUrl: 'https://app.test/ok?src=hub', failureUrl: 'https://app.test/fail' };
    const ok = await service.complete(REF, TOKEN, {
      razorpay_payment_id: 'pay_RZP1',
      razorpay_signature: sig('order_ABC', 'pay_RZP1'),
    });
    const url = new URL(ok.redirectUrl as string);
    assert.equal(url.origin + url.pathname, 'https://app.test/ok');
    assert.equal(url.searchParams.get('src'), 'hub');
    assert.equal(url.searchParams.get('paymentId'), REF);
    assert.equal(url.searchParams.get('status'), 'SUCCESS');

    repo.add(makePayment({ id: 'pid-2', paymentReference: 'pay_aaaaaaaaaaaaaaaaaaaa', checkoutToken: 't2' }));
    const cancelled = await service.cancel('pay_aaaaaaaaaaaaaaaaaaaa', 't2');
    assert.equal(new URL(cancelled.redirectUrl as string).searchParams.get('status'), 'CANCELLED');
  });

  it('returns no redirect when none is configured', async () => {
    assert.equal((await service.cancel(REF, TOKEN)).redirectUrl, null);
  });
});

describe('checkout page rendering', () => {
  const view = {
    kind: 'pay' as const,
    keyId: 'rzp_test_abc',
    orderId: 'order_1',
    amountMinor: 100,
    currency: 'INR',
    reference: 'pay_0123456789abcdef0123',
    businessName: '</script><script>alert(1)</script>',
    prefill: { name: '"><img src=x onerror=alert(2)>', email: 'a@b.com', contact: '' },
  };

  it('cannot be broken out of via business or customer names', () => {
    const html = renderCheckoutPage(view);
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(!html.includes('<img src=x'));
    // exactly the three expected script tags: config JSON, razorpay loader, page logic
    assert.equal((html.match(/<script/g) ?? []).length, 3);
  });

  it('never contains a secret-looking field', () => {
    const html = renderCheckoutPage(view);
    assert.ok(!/key_secret|webhook_secret/i.test(html));
  });

  it('escapeHtml and safeJson neutralize markup', () => {
    assert.equal(escapeHtml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
    assert.ok(!safeJson({ a: '</script>' }).includes('<'));
    assert.deepEqual(JSON.parse(safeJson({ a: '</script>' })), { a: '</script>' });
  });

  it('returns the customer by redirect only (no window messaging)', () => {
    const html = renderCheckoutPage(view);
    assert.ok(html.includes('location.replace'));
    assert.ok(!html.includes('postMessage') && !html.includes('opener'));
  });

  it('passes the return URL as data and does not render it as markup', () => {
    const html = renderCheckoutPage({
      kind: 'done',
      status: 'FAILED',
      amount: 1,
      currency: 'INR',
      businessName: 'Food Co',
      reference: REF,
      returnUrl: 'https://app.test/x?a="><script>alert(3)</script>',
    });
    assert.ok(!html.includes('<script>alert(3)</script>'));
    assert.equal((html.match(/<script/g) ?? []).length, 2);
  });

  it('renders a plain result for final payments', () => {
    const html = renderCheckoutPage({ kind: 'done', status: 'SUCCESS', amount: 1, currency: 'INR', businessName: 'Food Co', reference: REF, returnUrl: null });
    assert.ok(html.includes('Payment successful'));
    assert.ok(!html.includes('checkout.razorpay.com'));
  });
});
