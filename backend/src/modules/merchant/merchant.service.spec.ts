// FILE: modules/merchant/merchant.service.spec.ts
// PURPOSE: Unit tests for MerchantService (repository stubbed). Runs with node:test
// DEPENDENCIES: node:test, node:assert
// PHASE: 3
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { AppException } from '../../common/types/app.exception';
import { ErrorCode } from '../../common/types/error-codes';
import { MerchantProfile, MerchantStatus } from './entities/merchant-profile.entity';
import { MerchantRepository } from './merchant.repository';
import { MerchantService } from './merchant.service';

const TENANT = '11111111-1111-1111-1111-111111111111';

function makeProfile(over: Partial<MerchantProfile> = {}): MerchantProfile {
  return {
    id: 'p1',
    userId: TENANT,
    businessName: 'ABC',
    businessEmail: 'info@abc.com',
    supportEmail: null,
    website: null,
    phone: null,
    country: 'India',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    status: MerchantStatus.ACTIVE,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  };
}

interface Stub {
  existing: MerchantProfile | null;
  createError: unknown;
  createdWith: Partial<MerchantProfile> | null;
}

describe('MerchantService', () => {
  let stub: Stub;
  let service: MerchantService;

  beforeEach(() => {
    stub = { existing: null, createError: null, createdWith: null };
    const repo = {
      findByTenantId: async (): Promise<MerchantProfile | null> => stub.existing,
      create: async (_t: string, v: Partial<MerchantProfile>): Promise<MerchantProfile> => {
        if (stub.createError) throw stub.createError;
        stub.createdWith = v;
        return makeProfile(v);
      },
      save: async (p: MerchantProfile): Promise<MerchantProfile> => p,
    };
    service = new MerchantService(repo as unknown as MerchantRepository);
  });

  async function codeOf(p: Promise<unknown>): Promise<string> {
    try {
      await p;
    } catch (e) {
      if (e instanceof AppException) return e.errorCode;
    }
    return 'NO_ERROR';
  }

  it('creates a profile with defaults (India, INR, Asia/Kolkata)', async () => {
    const res = await service.create(TENANT, { businessName: 'ABC', businessEmail: 'info@abc.com' });
    assert.equal(stub.createdWith?.country, 'India');
    assert.equal(stub.createdWith?.currency, 'INR');
    assert.equal(stub.createdWith?.timezone, 'Asia/Kolkata');
    assert.equal(stub.createdWith?.supportEmail, null);
    assert.equal(res.status, MerchantStatus.ACTIVE);
  });

  it('keeps provided optional values on create', async () => {
    await service.create(TENANT, {
      businessName: 'ABC',
      businessEmail: 'info@abc.com',
      currency: 'USD',
      timezone: 'UTC',
      website: 'https://abc.com',
    });
    assert.equal(stub.createdWith?.currency, 'USD');
    assert.equal(stub.createdWith?.timezone, 'UTC');
    assert.equal(stub.createdWith?.website, 'https://abc.com');
  });

  it('does not expose userId in the response', async () => {
    stub.existing = makeProfile();
    assert.equal('userId' in (await service.get(TENANT)), false);
  });

  it('rejects a second profile with INVALID_STATE', async () => {
    stub.existing = makeProfile();
    assert.equal(
      await codeOf(service.create(TENANT, { businessName: 'x', businessEmail: 'a@b.com' })),
      ErrorCode.INVALID_STATE,
    );
  });

  it('maps a unique-violation race to INVALID_STATE', async () => {
    stub.createError = { code: '23505' };
    assert.equal(
      await codeOf(service.create(TENANT, { businessName: 'x', businessEmail: 'a@b.com' })),
      ErrorCode.INVALID_STATE,
    );
  });

  it('get returns NOT_FOUND without a profile', async () => {
    assert.equal(await codeOf(service.get(TENANT)), ErrorCode.NOT_FOUND);
  });

  it('update returns NOT_FOUND without a profile', async () => {
    assert.equal(await codeOf(service.update(TENANT, { phone: '1' })), ErrorCode.NOT_FOUND);
  });

  it('update changes only provided fields and clears fields set to null', async () => {
    stub.existing = makeProfile({ supportEmail: 's@abc.com', phone: '123' });
    const res = await service.update(TENANT, { businessName: 'New', supportEmail: null });
    assert.equal(res.businessName, 'New');
    assert.equal(res.supportEmail, null);
    assert.equal(res.phone, '123');
    assert.equal(res.businessEmail, 'info@abc.com');
  });
});
