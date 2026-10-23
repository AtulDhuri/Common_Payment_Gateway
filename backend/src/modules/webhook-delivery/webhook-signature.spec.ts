// FILE: modules/webhook-delivery/webhook-signature.spec.ts
// PURPOSE: Unit tests for signing and headers, using a receiver-side verifier written the way docs/merchant-webhooks.md tells merchants to
// DEPENDENCIES: node:test
// PHASE: 8
import assert from 'node:assert/strict';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { describe, it } from 'node:test';
import { buildWebhookHeaders, generateSigningSecret, signPayload } from './webhook-signature';

/** What a merchant's server does. */
function receiverAccepts(secret: string, headers: Record<string, string>, rawBody: string, nowSeconds: number): boolean {
  const ts = Number(headers['x-paymenthub-timestamp']);
  if (!Number.isInteger(ts) || Math.abs(nowSeconds - ts) > 300) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  const given = headers['x-paymenthub-signature'] ?? '';
  return expected.length === given.length && timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

describe('signing', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ event: 'PAYMENT_SUCCESS', paymentId: 'pay_1', amount: 499 });

  it('matches the documented formula: sha256= + HMAC-SHA256(secret, "<timestamp>.<body>")', () => {
    const expected = 'sha256=' + createHmac('sha256', secret).update(`1700000000.${body}`).digest('hex');
    assert.equal(signPayload(secret, 1700000000, body), expected);
    assert.match(signPayload(secret, 1700000000, body), /^sha256=[a-f0-9]{64}$/);
  });

  it('changes when the body, the timestamp or the secret changes', () => {
    const base = signPayload(secret, 1700000000, body);
    assert.notEqual(signPayload(secret, 1700000000, body + ' '), base);
    assert.notEqual(signPayload(secret, 1700000001, body), base);
    assert.notEqual(signPayload('other', 1700000000, body), base);
  });

  it('builds the documented headers, including the stable delivery id', () => {
    const h = buildWebhookHeaders({ secret, eventType: 'PAYMENT_SUCCESS', deliveryId: 'd-123', timestampSeconds: 1700000000, rawBody: body });
    assert.equal(h['content-type'], 'application/json');
    assert.equal(h['x-paymenthub-event'], 'PAYMENT_SUCCESS');
    assert.equal(h['x-paymenthub-timestamp'], '1700000000');
    assert.equal(h['x-paymenthub-delivery-id'], 'd-123');
    assert.equal(h['x-paymenthub-signature'], signPayload(secret, 1700000000, body));
    assert.ok(!JSON.stringify(h).includes(secret));
  });

  it('a receiver following the docs accepts a genuine delivery', () => {
    const now = 1700000100;
    const h = buildWebhookHeaders({ secret, eventType: 'PAYMENT_SUCCESS', deliveryId: 'd', timestampSeconds: now, rawBody: body });
    assert.equal(receiverAccepts(secret, h, body, now), true);
  });

  it('a receiver rejects a tampered body, the wrong secret, and a replayed old delivery', () => {
    const now = 1700000100;
    const h = buildWebhookHeaders({ secret, eventType: 'PAYMENT_SUCCESS', deliveryId: 'd', timestampSeconds: now, rawBody: body });
    assert.equal(receiverAccepts(secret, h, body.replace('499', '1'), now), false);
    assert.equal(receiverAccepts('wrong', h, body, now), false);
    assert.equal(receiverAccepts(secret, h, body, now + 301), false);
  });
});

describe('generateSigningSecret', () => {
  it('is long, prefixed and different every time', () => {
    const a = generateSigningSecret();
    const b = generateSigningSecret();
    assert.match(a, /^whsec_[A-Za-z0-9_-]{43}$/);
    assert.notEqual(a, b);
  });
});
