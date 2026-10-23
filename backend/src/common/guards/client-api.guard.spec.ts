// FILE: common/guards/client-api.guard.spec.ts
// PURPOSE: Unit tests for header handling in ClientApiGuard
// DEPENDENCIES: node:test
// PHASE: 6
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ExecutionContext } from '@nestjs/common';
import { AppException } from '../../common/types/app.exception';
import { ErrorCode } from '../../common/types/error-codes';
import { ApiCredentialsService } from '../../modules/api-credentials/api-credentials.service';
import { ClientApiGuard, ClientRequest } from './client-api.guard';

function contextFor(headers: Record<string, string | string[]>): { ctx: ExecutionContext; req: ClientRequest } {
  const req = { headers } as unknown as ClientRequest;
  const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
  return { ctx, req };
}

const service = {
  missingCredentials: () => new AppException(ErrorCode.UNAUTHORIZED, 'Missing API credentials', 401),
  authenticate: async (k: string, s: string) => {
    if (k === 'good-key' && s === 'good-secret') return { tenantId: 't1', credentialId: 'c1' };
    throw new AppException(ErrorCode.UNAUTHORIZED, 'Invalid API credentials', 401);
  },
} as unknown as ApiCredentialsService;
const guard = new ClientApiGuard(service);

async function messageOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppException) return e.message;
  }
  return 'NO_ERROR';
}

describe('ClientApiGuard', () => {
  it('attaches the tenant for a valid key pair', async () => {
    const { ctx, req } = contextFor({ 'x-api-key': 'good-key', 'x-api-secret': 'good-secret' });
    assert.equal(await guard.canActivate(ctx), true);
    assert.deepEqual(req.client, { tenantId: 't1', credentialId: 'c1' });
  });

  it('rejects when either header is missing or empty', async () => {
    assert.equal(await messageOf(guard.canActivate(contextFor({}).ctx)), 'Missing API credentials');
    assert.equal(await messageOf(guard.canActivate(contextFor({ 'x-api-key': 'good-key' }).ctx)), 'Missing API credentials');
    assert.equal(await messageOf(guard.canActivate(contextFor({ 'x-api-secret': 'good-secret' }).ctx)), 'Missing API credentials');
    assert.equal(await messageOf(guard.canActivate(contextFor({ 'x-api-key': '', 'x-api-secret': 'x' }).ctx)), 'Missing API credentials');
  });

  it('rejects repeated headers (an array) instead of picking one', async () => {
    const { ctx } = contextFor({ 'x-api-key': ['good-key', 'other'], 'x-api-secret': 'good-secret' });
    assert.equal(await messageOf(guard.canActivate(ctx)), 'Missing API credentials');
  });

  it('does not attach a tenant when authentication fails', async () => {
    const { ctx, req } = contextFor({ 'x-api-key': 'good-key', 'x-api-secret': 'wrong' });
    assert.equal(await messageOf(guard.canActivate(ctx)), 'Invalid API credentials');
    assert.equal(req.client, undefined);
  });
});
