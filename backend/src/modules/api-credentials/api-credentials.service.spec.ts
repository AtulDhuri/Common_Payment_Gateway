// FILE: modules/api-credentials/api-credentials.service.spec.ts
// PURPOSE: Unit tests for credential generation, hashing, authentication, tenant scoping and audit
// DEPENDENCIES: node:test, bcrypt
// PHASE: 6
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import * as bcrypt from 'bcrypt';
import { AppException } from '../../common/types/app.exception';
import { ErrorCode } from '../../common/types/error-codes';
import { AuditEntry, AuditService } from '../audit/audit.service';
import { GatewayConfigService } from '../gateway-config/gateway-config.service';
import { ApiCredentialsRepository } from './api-credentials.repository';
import { ApiCredentialsService } from './api-credentials.service';
import { ApiCredential } from './entities/api-credential.entity';

const T1 = 'tenant-1';
const T2 = 'tenant-2';

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppException) return e.errorCode;
  }
  return 'NO_ERROR';
}

describe('ApiCredentialsService', () => {
  let rows: ApiCredential[];
  let audits: AuditEntry[];
  let touched: string[];
  let mode: 'live' | 'test';
  let service: ApiCredentialsService;

  beforeEach(() => {
    rows = [];
    audits = [];
    touched = [];
    mode = 'test';
    let n = 0;
    const repo = {
      create: async (v: Partial<ApiCredential>) => {
        n += 1;
        const row = { id: `00000000-0000-4000-8000-00000000000${n}`, lastUsedAt: null, isActive: true, createdAt: new Date(0), updatedAt: new Date(0), ...v } as ApiCredential;
        rows.push(row);
        return row;
      },
      listByTenant: async (t: string) => rows.filter((r) => r.tenantId === t),
      findByPublicKey: async (k: string) => rows.find((r) => r.publicKey === k) ?? null,
      findForTenant: async (t: string, id: string) => rows.find((r) => r.tenantId === t && r.id === id) ?? null,
      save: async (c: ApiCredential) => c,
      deleteForTenant: async (t: string, id: string) => {
        const before = rows.length;
        rows = rows.filter((r) => !(r.tenantId === t && r.id === id));
        return rows.length < before;
      },
      touchLastUsed: async (id: string) => void touched.push(id),
    } as unknown as ApiCredentialsRepository;
    service = new ApiCredentialsService(
      repo,
      { getKeyMode: async () => mode } as unknown as GatewayConfigService,
      { record: async (e: AuditEntry) => void audits.push(e) } as unknown as AuditService,
    );
  });

  describe('generate', () => {
    it('returns the secret once and stores only a bcrypt hash of it', async () => {
      const created = await service.generate(T1, 'Food app');
      assert.match(created.publicKey, /^pk_test_[a-f0-9]{32}$/);
      assert.match(created.secretKey, /^sk_test_[A-Za-z0-9_-]{43}$/);
      const stored = rows[0];
      assert.ok(stored.secretKeyHash.startsWith('$2'));
      assert.notEqual(stored.secretKeyHash, created.secretKey);
      assert.ok(!JSON.stringify(stored).includes(created.secretKey));
      assert.equal(await bcrypt.compare(created.secretKey, stored.secretKeyHash), true);
    });

    it('uses live prefixes when the merchant has a live gateway key', async () => {
      mode = 'live';
      const created = await service.generate(T1, 'Live');
      assert.ok(created.publicKey.startsWith('pk_live_'));
      assert.ok(created.secretKey.startsWith('sk_live_'));
      assert.equal(created.mode, 'live');
    });

    it('creates unique keys and secrets each time', async () => {
      const a = await service.generate(T1, 'a');
      const b = await service.generate(T1, 'b');
      assert.notEqual(a.publicKey, b.publicKey);
      assert.notEqual(a.secretKey, b.secretKey);
    });

    it('audits without the secret', async () => {
      const created = await service.generate(T1, 'Food app');
      assert.equal(audits[0].action, 'API_CREDENTIAL_CREATED');
      assert.ok(!JSON.stringify(audits).includes(created.secretKey));
      assert.deepEqual(audits[0].payload, { name: 'Food app', publicKey: created.publicKey });
    });
  });

  describe('list', () => {
    it('never exposes the secret or its hash, and is tenant scoped', async () => {
      await service.generate(T1, 'mine');
      await service.generate(T2, 'theirs');
      const list = await service.list(T1);
      assert.equal(list.length, 1);
      assert.equal(list[0].name, 'mine');
      const json = JSON.stringify(list);
      assert.ok(!json.includes('secretKey') && !json.includes('$2') && !json.includes('tenant'));
    });
  });

  describe('authenticate', () => {
    it('accepts the right key pair and records usage', async () => {
      const c = await service.generate(T1, 'k');
      const ctx = await service.authenticate(c.publicKey, c.secretKey);
      assert.deepEqual(ctx, { tenantId: T1, credentialId: c.id });
      assert.deepEqual(touched, [c.id]);
    });

    it('rejects a wrong secret, wrong key, malformed values with the same error', async () => {
      const c = await service.generate(T1, 'k');
      const other = await service.generate(T1, 'other');
      const messages = new Set<string>();
      for (const [k, s] of [
        [c.publicKey, other.secretKey],
        ['pk_test_' + 'a'.repeat(32), c.secretKey],
        [c.publicKey, 'sk_test_short'],
        ['nonsense', c.secretKey],
        [c.publicKey, c.secretKey.replace('sk_test_', 'sk_live_')],
      ]) {
        try {
          await service.authenticate(k, s);
          assert.fail('should reject');
        } catch (e) {
          assert.ok(e instanceof AppException);
          assert.equal(e.errorCode, ErrorCode.UNAUTHORIZED);
          assert.equal(e.httpStatus, 401);
          messages.add(e.message);
        }
      }
      assert.equal(messages.size, 1);
      assert.equal(touched.length, 0);
    });

    it('rejects a deactivated key even with the right secret', async () => {
      const c = await service.generate(T1, 'k');
      await service.deactivate(T1, c.id);
      assert.equal(await codeOf(service.authenticate(c.publicKey, c.secretKey)), ErrorCode.UNAUTHORIZED);
    });

    it('rejects a deleted key', async () => {
      const c = await service.generate(T1, 'k');
      await service.remove(T1, c.id);
      assert.equal(await codeOf(service.authenticate(c.publicKey, c.secretKey)), ErrorCode.UNAUTHORIZED);
    });
  });

  describe('deactivate and remove', () => {
    it('deactivates, audits once, and is idempotent', async () => {
      const c = await service.generate(T1, 'k');
      audits.length = 0;
      const res = await service.deactivate(T1, c.id);
      assert.equal(res.isActive, false);
      await service.deactivate(T1, c.id);
      assert.deepEqual(audits.map((a) => a.action), ['API_CREDENTIAL_DEACTIVATED']);
    });

    it('cannot touch another tenant\'s credential', async () => {
      const c = await service.generate(T1, 'k');
      assert.equal(await codeOf(service.deactivate(T2, c.id)), ErrorCode.NOT_FOUND);
      assert.equal(await codeOf(service.remove(T2, c.id)), ErrorCode.NOT_FOUND);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].isActive, true);
    });

    it('deletes and audits', async () => {
      const c = await service.generate(T1, 'k');
      assert.deepEqual(await service.remove(T1, c.id), { deleted: true });
      assert.equal(rows.length, 0);
      assert.equal(audits.at(-1)?.action, 'API_CREDENTIAL_DELETED');
    });

    it('returns NOT_FOUND for an unknown id', async () => {
      assert.equal(await codeOf(service.remove(T1, '00000000-0000-4000-8000-0000000000ff')), ErrorCode.NOT_FOUND);
    });
  });
});
