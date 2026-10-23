// FILE: modules/merchant/dto/merchant-profile.dto.spec.ts
// PURPOSE: Validation-rule tests from docs/merchant-profile.md. Runs with node:test
// DEPENDENCIES: class-validator, class-transformer, node:test
// PHASE: 3
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMerchantProfileDto, UpdateMerchantProfileDto } from './merchant-profile.dto';

async function failedFields<T extends object>(cls: new () => T, body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, body));
  return errors.map((e) => e.property).sort();
}

const valid = {
  businessName: 'ABC Technologies',
  businessEmail: 'info@abc.com',
  supportEmail: 'support@abc.com',
  website: 'https://abc.com',
  phone: '+919999999999',
  country: 'India',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
};

describe('CreateMerchantProfileDto', () => {
  it('accepts the documented request body', async () => {
    assert.deepEqual(await failedFields(CreateMerchantProfileDto, valid), []);
  });

  it('accepts only the required fields', async () => {
    assert.deepEqual(
      await failedFields(CreateMerchantProfileDto, { businessName: 'A', businessEmail: 'a@b.com' }),
      [],
    );
  });

  it('requires businessName and businessEmail', async () => {
    assert.deepEqual(await failedFields(CreateMerchantProfileDto, {}), ['businessEmail', 'businessName']);
  });

  it('rejects businessName over 255 chars', async () => {
    assert.deepEqual(
      await failedFields(CreateMerchantProfileDto, { ...valid, businessName: 'a'.repeat(256) }),
      ['businessName'],
    );
  });

  it('rejects invalid emails', async () => {
    assert.deepEqual(
      await failedFields(CreateMerchantProfileDto, { ...valid, businessEmail: 'nope', supportEmail: 'bad' }),
      ['businessEmail', 'supportEmail'],
    );
  });

  it('rejects an invalid website and phone over 50 chars', async () => {
    assert.deepEqual(
      await failedFields(CreateMerchantProfileDto, { ...valid, website: 'not a url', phone: '1'.repeat(51) }),
      ['phone', 'website'],
    );
  });

  it('rejects non-http(s) website schemes', async () => {
    assert.deepEqual(
      await failedFields(CreateMerchantProfileDto, { ...valid, website: 'javascript:alert(1)' }),
      ['website'],
    );
  });
});

describe('UpdateMerchantProfileDto', () => {
  it('accepts an empty body', async () => {
    assert.deepEqual(await failedFields(UpdateMerchantProfileDto, {}), []);
  });

  it('allows null to clear optional fields', async () => {
    assert.deepEqual(
      await failedFields(UpdateMerchantProfileDto, { supportEmail: null, website: null, phone: null, country: null }),
      [],
    );
  });

  it('rejects null or empty for required fields', async () => {
    assert.deepEqual(
      await failedFields(UpdateMerchantProfileDto, { businessName: null, businessEmail: null }),
      ['businessEmail', 'businessName'],
    );
    assert.deepEqual(await failedFields(UpdateMerchantProfileDto, { businessName: '' }), ['businessName']);
  });

  it('still validates provided values', async () => {
    assert.deepEqual(
      await failedFields(UpdateMerchantProfileDto, { businessEmail: 'bad', website: 'x' }),
      ['businessEmail', 'website'],
    );
  });
});
