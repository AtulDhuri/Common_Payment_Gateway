// FILE: modules/webhook-delivery/webhook-enqueuer.spec.ts
// PURPOSE: Unit tests for queuing a delivery inside the payment event's transaction
// DEPENDENCIES: node:test
// PHASE: 8
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EntityManager } from 'typeorm';
import { WebhookEnqueuer } from './webhook-enqueuer';

function fakeManager(configRows: { webhook_url: string }[]): { manager: EntityManager; calls: { sql: string; params: unknown[] }[] } {
  const calls: { sql: string; params: unknown[] }[] = [];
  const manager = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return sql.startsWith('SELECT') ? configRows : [];
    },
  } as unknown as EntityManager;
  return { manager, calls };
}

const INPUT = {
  tenantId: 't1',
  paymentId: 'p1',
  paymentEventId: 'e1',
  eventType: 'PAYMENT_SUCCESS',
  payload: { event: 'PAYMENT_SUCCESS', paymentId: 'pay_1', metadata: { orderId: 'A' } },
};

describe('WebhookEnqueuer', () => {
  it('queues nothing when the merchant has no active endpoint', async () => {
    const { manager, calls } = fakeManager([]);
    assert.equal(await new WebhookEnqueuer().enqueue(manager, INPUT), false);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].sql.includes('is_active = true'));
    assert.deepEqual(calls[0].params, ['t1']);
  });

  it('queues a PENDING delivery that is due now, carrying the URL and the exact payload', async () => {
    const { manager, calls } = fakeManager([{ webhook_url: 'https://shop.example.com/hook' }]);
    assert.equal(await new WebhookEnqueuer().enqueue(manager, INPUT), true);
    assert.equal(calls.length, 2);
    const insert = calls[1];
    assert.ok(insert.sql.includes('INSERT INTO webhook_events'));
    assert.ok(insert.sql.includes("'PENDING'") && insert.sql.includes('now()'));
    assert.deepEqual(insert.params, ['t1', 'p1', 'e1', 'PAYMENT_SUCCESS', 'https://shop.example.com/hook', JSON.stringify(INPUT.payload)]);
  });

  it('uses only the caller\'s manager, so the queue row shares the payment event\'s transaction', async () => {
    const { manager, calls } = fakeManager([{ webhook_url: 'https://x.example.com/h' }]);
    await new WebhookEnqueuer().enqueue(manager, INPUT);
    assert.equal(calls.length, 2); // everything went through the one manager passed in
  });
});
