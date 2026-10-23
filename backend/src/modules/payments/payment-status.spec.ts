// FILE: modules/payments/payment-status.spec.ts
// PURPOSE: Unit tests for the status lifecycle
// DEPENDENCIES: node:test
// PHASE: 5
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canTransition, EVENT_FOR_STATUS, PaymentStatus as S } from './payment-status';

describe('canTransition', () => {
  it('allows the documented transitions', () => {
    for (const [from, to] of [
      [S.PENDING, S.SUCCESS],
      [S.PENDING, S.FAILED],
      [S.PENDING, S.CANCELLED],
      [S.FAILED, S.SUCCESS],
      [S.CANCELLED, S.SUCCESS],
      [S.SUCCESS, S.REFUNDED],
    ] as const) {
      assert.equal(canTransition(from, to), true, `${from} -> ${to}`);
    }
  });

  it('never moves a SUCCESS back to FAILED or CANCELLED', () => {
    assert.equal(canTransition(S.SUCCESS, S.FAILED), false);
    assert.equal(canTransition(S.SUCCESS, S.CANCELLED), false);
    assert.equal(canTransition(S.SUCCESS, S.PENDING), false);
  });

  it('treats REFUNDED as terminal', () => {
    for (const to of Object.values(S)) assert.equal(canTransition(S.REFUNDED, to), false);
  });

  it('does not allow refunding an unpaid payment', () => {
    assert.equal(canTransition(S.PENDING, S.REFUNDED), false);
    assert.equal(canTransition(S.FAILED, S.REFUNDED), false);
  });

  it('has an event type for every transition target', () => {
    for (const to of [S.SUCCESS, S.FAILED, S.CANCELLED, S.REFUNDED]) assert.ok(EVENT_FOR_STATUS[to]);
  });
});
