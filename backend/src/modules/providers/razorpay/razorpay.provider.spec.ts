// FILE: modules/providers/razorpay/razorpay.provider.spec.ts
// PURPOSE: Unit tests for the offline parts of RazorpayProvider: signatures, webhook normalization, status mapping
// DEPENDENCIES: node:test
// PHASE: 5
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { mapRazorpayStatus, RazorpayProvider } from './razorpay.provider';

const provider = new RazorpayProvider();
const hmac = (secret: string, data: string | Buffer): string => createHmac('sha256', secret).update(data).digest('hex');
const body = (o: object): Buffer => Buffer.from(JSON.stringify(o));

describe('RazorpayProvider.verifyPayment', () => {
  const config = { key_id: 'k', key_secret: 'sekret' };
  const input = { providerOrderId: 'order_1', providerPaymentId: 'pay_1' };

  it('accepts the HMAC of "order_id|payment_id"', () => {
    assert.equal(provider.verifyPayment(config, { ...input, signature: hmac('sekret', 'order_1|pay_1') }), true);
  });

  it('rejects a signature for another order, another secret, or garbage', () => {
    assert.equal(provider.verifyPayment(config, { ...input, signature: hmac('sekret', 'order_2|pay_1') }), false);
    assert.equal(provider.verifyPayment(config, { ...input, signature: hmac('other', 'order_1|pay_1') }), false);
    assert.equal(provider.verifyPayment(config, { ...input, signature: 'zz' }), false);
    assert.equal(provider.verifyPayment(config, { ...input, signature: '' }), false);
  });

  it('rejects when the secret is missing', () => {
    assert.equal(provider.verifyPayment({}, { ...input, signature: hmac('', 'order_1|pay_1') }), false);
  });
});

describe('RazorpayProvider.verifyWebhookSignature', () => {
  const raw = body({ event: 'payment.captured' });

  it('accepts the HMAC of the exact raw body', () => {
    assert.equal(provider.verifyWebhookSignature(raw, hmac('wh', raw), 'wh'), true);
  });

  it('rejects a modified body, a wrong secret, or a missing signature', () => {
    const sig = hmac('wh', raw);
    assert.equal(provider.verifyWebhookSignature(body({ event: 'payment.failed' }), sig, 'wh'), false);
    assert.equal(provider.verifyWebhookSignature(raw, sig, 'other'), false);
    assert.equal(provider.verifyWebhookSignature(raw, '', 'wh'), false);
    assert.equal(provider.verifyWebhookSignature(raw, sig, ''), false);
  });

  it('is sensitive to whitespace (signature covers raw bytes, not parsed JSON)', () => {
    const pretty = Buffer.from('{ "event": "payment.captured" }');
    assert.equal(provider.verifyWebhookSignature(pretty, hmac('wh', raw), 'wh'), false);
  });
});

describe('RazorpayProvider.normalizeWebhook', () => {
  const payment = (over: object = {}): object => ({
    id: 'pay_9',
    order_id: 'order_9',
    status: 'captured',
    amount: 100,
    currency: 'INR',
    amount_refunded: 0,
    ...over,
  });
  const wrap = (event: string, extra: object = {}, p: object = payment()): Buffer =>
    body({ event, payload: { payment: { entity: p }, ...extra } });

  it('maps payment.captured and order.paid to SUCCESS', () => {
    for (const ev of ['payment.captured', 'order.paid']) {
      const n = provider.normalizeWebhook(wrap(ev));
      assert.equal(n?.status, 'SUCCESS');
      assert.equal(n?.providerOrderId, 'order_9');
      assert.equal(n?.providerPaymentId, 'pay_9');
      assert.equal(n?.amountMinor, 100);
      assert.equal(n?.currency, 'INR');
    }
  });

  it('maps payment.failed to FAILED', () => {
    assert.equal(provider.normalizeWebhook(wrap('payment.failed', {}, payment({ status: 'failed' })))?.status, 'FAILED');
  });

  it('maps a full refund to REFUNDED and ignores a partial one', () => {
    assert.equal(
      provider.normalizeWebhook(wrap('refund.processed', {}, payment({ status: 'refunded', amount_refunded: 100 })))?.status,
      'REFUNDED',
    );
    assert.equal(
      provider.normalizeWebhook(wrap('refund.processed', {}, payment({ amount_refunded: 40 })))?.status,
      null,
    );
  });

  it('returns a null status for events that do not change a payment', () => {
    assert.equal(provider.normalizeWebhook(wrap('payment.authorized', {}, payment({ status: 'authorized' })))?.status, null);
    assert.equal(provider.normalizeWebhook(wrap('refund.created'))?.status, null);
  });

  it('falls back to the order entity when there is no payment entity', () => {
    const n = provider.normalizeWebhook(body({ event: 'order.paid', payload: { order: { entity: { id: 'order_7', amount: 500, currency: 'INR' } } } }));
    assert.equal(n?.providerOrderId, 'order_7');
    assert.equal(n?.amountMinor, 500);
  });

  it('returns null for non-JSON or non-event bodies', () => {
    assert.equal(provider.normalizeWebhook(Buffer.from('not json')), null);
    assert.equal(provider.normalizeWebhook(body({ hello: 'world' })), null);
    assert.equal(provider.normalizeWebhook(Buffer.from('null')), null);
  });

  it('exposes only normalized fields (no raw payload)', () => {
    const n = provider.normalizeWebhook(wrap('payment.captured', {}, payment({ card: { last4: '1111' }, email: 'x@y.z' })));
    assert.deepEqual(Object.keys(n ?? {}).sort(), [
      'amountMinor', 'currency', 'eventType', 'providerOrderId', 'providerPaymentId', 'status',
    ]);
  });
});

describe('mapRazorpayStatus', () => {
  it('maps gateway statuses', () => {
    assert.equal(mapRazorpayStatus('captured'), 'SUCCESS');
    assert.equal(mapRazorpayStatus('failed'), 'FAILED');
    assert.equal(mapRazorpayStatus('refunded'), 'REFUNDED');
    assert.equal(mapRazorpayStatus('authorized'), 'PENDING');
    assert.equal(mapRazorpayStatus('created'), 'PENDING');
    assert.equal(mapRazorpayStatus(undefined), 'PENDING');
  });
});
