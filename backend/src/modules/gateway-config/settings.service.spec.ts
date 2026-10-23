// FILE: modules/gateway-config/settings.service.spec.ts
// PURPOSE: Unit tests for redirect URL settings and the DTO rules
// DEPENDENCIES: node:test
// PHASE: 7
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditEntry, AuditService } from '../audit/audit.service';
import { UpdateRedirectsDto } from './dto/settings.dto';
import { GatewayConfigRepository } from './gateway-config.repository';
import { SettingsService } from './settings.service';

async function failed(body: object): Promise<string[]> {
  return (await validate(plainToInstance(UpdateRedirectsDto, body))).map((e) => e.property).sort();
}

describe('UpdateRedirectsDto', () => {
  it('accepts http(s) URLs including localhost', async () => {
    assert.deepEqual(await failed({ successUrl: 'https://shop.example.com/return', failureUrl: 'http://localhost:4000/return' }), []);
  });

  it('accepts an empty body and blank strings (cleared)', async () => {
    assert.deepEqual(await failed({}), []);
    const dto = plainToInstance(UpdateRedirectsDto, { successUrl: '  ', failureUrl: '' });
    assert.equal(dto.successUrl, null);
    assert.equal(dto.failureUrl, null);
  });

  it('rejects non-http schemes and junk', async () => {
    assert.deepEqual(await failed({ successUrl: 'javascript:alert(1)', failureUrl: 'ftp://x.com/a' }), ['failureUrl', 'successUrl']);
    assert.deepEqual(await failed({ successUrl: 'not a url' }), ['successUrl']);
    assert.deepEqual(await failed({ failureUrl: '/relative' }), ['failureUrl']);
  });

  it('rejects URLs over 500 characters', async () => {
    assert.deepEqual(await failed({ successUrl: 'https://a.com/' + 'x'.repeat(500) }), ['successUrl']);
  });
});

describe('SettingsService', () => {
  let stored: { successUrl: string | null; failureUrl: string | null } | null;
  let audits: AuditEntry[];
  let service: SettingsService;

  beforeEach(() => {
    stored = null;
    audits = [];
    const repo = {
      findSettings: async () => stored,
      setRedirects: async (_t: string, successUrl: string | null, failureUrl: string | null) => {
        stored = { successUrl, failureUrl };
      },
    } as unknown as GatewayConfigRepository;
    service = new SettingsService(repo, { record: async (e: AuditEntry) => void audits.push(e) } as unknown as AuditService);
  });

  it('returns nulls when nothing is saved', async () => {
    assert.deepEqual(await service.getRedirects('t'), { successUrl: null, failureUrl: null });
  });

  it('replaces both values and audits the changed field names only', async () => {
    const res = await service.setRedirects('t', { successUrl: 'https://a.com/ok', failureUrl: 'https://a.com/fail' });
    assert.deepEqual(res, { successUrl: 'https://a.com/ok', failureUrl: 'https://a.com/fail' });
    assert.deepEqual(audits[0].payload, { fields: ['successUrl', 'failureUrl'] });
    assert.ok(!JSON.stringify(audits).includes('a.com'));
  });

  it('a missing value clears that URL (PUT replaces)', async () => {
    await service.setRedirects('t', { successUrl: 'https://a.com/ok', failureUrl: 'https://a.com/fail' });
    const res = await service.setRedirects('t', { successUrl: 'https://a.com/ok' });
    assert.deepEqual(res, { successUrl: 'https://a.com/ok', failureUrl: null });
    assert.deepEqual(audits[1].payload, { fields: ['failureUrl'] });
  });

  it('does not audit when nothing changed', async () => {
    await service.setRedirects('t', { successUrl: 'https://a.com/ok' });
    audits.length = 0;
    await service.setRedirects('t', { successUrl: 'https://a.com/ok' });
    assert.equal(audits.length, 0);
  });
});
