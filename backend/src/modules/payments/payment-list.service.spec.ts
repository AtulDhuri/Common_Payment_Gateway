// FILE: modules/payments/payment-list.service.spec.ts
// PURPOSE: Unit tests for the payment list mapping
// DEPENDENCIES: node:test
// PHASE: 5
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ProvidersService } from '../providers/providers.service';
import { PaymentStatus } from './payment-status';
import { PaymentListService } from './payment-list.service';
import { PaymentsRepository } from './payments.repository';
import { appConfig, makePayment, PROVIDER_ID } from './payments.test-utils';

describe('PaymentListService', () => {
  const rows = [
    makePayment({ id: 'a', paymentReference: 'pay_aaaaaaaaaaaaaaaaaaaa', status: PaymentStatus.PENDING, checkoutToken: 'tok a/b' }),
    makePayment({ id: 'b', paymentReference: 'pay_bbbbbbbbbbbbbbbbbbbb', status: PaymentStatus.SUCCESS, providerPaymentId: 'pay_RZP1' }),
  ];
  let seen: { tenant: string; page: number; limit: number } | null = null;
  const repo = {
    listByTenant: async (tenant: string, page: number, limit: number): Promise<[typeof rows, number]> => {
      seen = { tenant, page, limit };
      return [rows, 12];
    },
  } as unknown as PaymentsRepository;
  const providers = {
    getProviderById: async () => ({ provider: { id: PROVIDER_ID, code: 'RAZORPAY' }, fields: [] }),
  } as unknown as ProvidersService;
  const service = new PaymentListService(repo, providers, appConfig);

  it('maps rows, scopes by tenant and applies paging defaults', async () => {
    const res = await service.list('tenant-9');
    assert.deepEqual(seen, { tenant: 'tenant-9', page: 1, limit: 10 });
    assert.equal(res.total, 12);
    assert.equal(res.items.length, 2);
    assert.equal(res.items[0].gateway, 'RAZORPAY');
    assert.equal(res.items[1].transactionId, 'pay_RZP1');
  });

  it('exposes the checkout URL only while PENDING, with the token URL-encoded', async () => {
    const res = await service.list('t', 2, 5);
    assert.deepEqual(seen, { tenant: 't', page: 2, limit: 5 });
    assert.equal(res.items[0].checkoutUrl, 'https://hub.test/api/v1/checkout/pay_aaaaaaaaaaaaaaaaaaaa?t=tok%20a%2Fb');
    assert.equal(res.items[1].checkoutUrl, null);
  });

  it('never includes the internal id or tenant id', async () => {
    const json = JSON.stringify((await service.list('t')).items);
    assert.ok(!json.includes('tenant-1') && !json.includes('"id"') && !json.includes('checkoutToken'));
  });
});
