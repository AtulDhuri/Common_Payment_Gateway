// FILE: modules/crypto/crypto.service.spec.ts
// PURPOSE: Unit tests for AES-256-GCM envelope encryption
// DEPENDENCIES: node:test
// PHASE: 4
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import { AppConfig, parseMasterKey } from '../../config/configuration';
import { CryptoService } from './crypto.service';

function make(key: Buffer = randomBytes(32)): CryptoService {
  return new CryptoService({ masterEncryptionKey: key } as AppConfig);
}

describe('CryptoService', () => {
  it('round-trips a value', () => {
    const c = make();
    assert.equal(c.decrypt(c.encrypt('rzp_secret_123')), 'rzp_secret_123');
  });

  it('uses the v1:<iv>:<tag>:<ciphertext> envelope and never contains the plaintext', () => {
    const c = make();
    const env = c.encrypt('super-secret');
    assert.equal(env.split(':').length, 4);
    assert.ok(env.startsWith('v1:'));
    assert.ok(!env.includes('super-secret'));
    assert.equal(c.isEnvelope(env), true);
    assert.equal(c.isEnvelope('plain'), false);
  });

  it('produces a different envelope each time (random IV)', () => {
    const c = make();
    assert.notEqual(c.encrypt('x'), c.encrypt('x'));
  });

  it('rejects tampered ciphertext', () => {
    const c = make();
    const [v, iv, tag, data] = c.encrypt('hello world').split(':');
    const flipped = Buffer.from(data, 'base64');
    flipped[0] ^= 1;
    assert.throws(() => c.decrypt([v, iv, tag, flipped.toString('base64')].join(':')));
  });

  it('rejects decryption with a different key', () => {
    const env = make().encrypt('hello');
    assert.throws(() => make().decrypt(env));
  });

  it('rejects malformed envelopes', () => {
    assert.throws(() => make().decrypt('not-an-envelope'));
  });

  it('handles an empty string and unicode', () => {
    const c = make();
    assert.equal(c.decrypt(c.encrypt('')), '');
    assert.equal(c.decrypt(c.encrypt('päss₹')), 'päss₹');
  });

  it('safeEqual compares correctly', () => {
    const c = make();
    assert.equal(c.safeEqual('abc', 'abc'), true);
    assert.equal(c.safeEqual('abc', 'abd'), false);
    assert.equal(c.safeEqual('abc', 'abcd'), false);
  });
});

describe('parseMasterKey', () => {
  it('accepts 64 hex chars and 32-byte base64', () => {
    const key = randomBytes(32);
    assert.equal(parseMasterKey(key.toString('hex')).length, 32);
    assert.equal(parseMasterKey(key.toString('base64')).length, 32);
  });

  it('rejects keys of the wrong length', () => {
    assert.throws(() => parseMasterKey('short'));
    assert.throws(() => parseMasterKey(randomBytes(16).toString('hex')));
  });
});
