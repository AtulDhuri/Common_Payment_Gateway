// FILE: modules/webhook-delivery/webhook-retry.spec.ts
// PURPOSE: Unit tests for the retry schedule (1m, 5m, 30m, 2h, 12h) and success rules
// DEPENDENCIES: node:test
// PHASE: 8
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseRetryDelays } from '../../config/configuration';
import { decideOutcome, isSuccess, maxAttempts } from './webhook-retry';

const DEFAULT = [60, 300, 1800, 7200, 43200];

describe('isSuccess', () => {
  it('only 2xx counts', () => {
    for (const c of [200, 201, 202, 204, 299]) assert.equal(isSuccess(c), true, String(c));
    for (const c of [100, 199, 300, 301, 302, 307, 400, 401, 404, 410, 429, 500, 502, 503]) assert.equal(isSuccess(c), false, String(c));
    assert.equal(isSuccess(null), false);
  });
});

describe('decideOutcome with the documented schedule', () => {
  it('has 6 attempts in total', () => {
    assert.equal(maxAttempts(DEFAULT), 6);
  });

  it('delivers on the first 2xx at any attempt', () => {
    for (let n = 1; n <= 6; n++) assert.deepEqual(decideOutcome(n, 200, DEFAULT), { status: 'DELIVERED', retryInSeconds: null });
  });

  it('retries after 1m, 5m, 30m, 2h, 12h and then gives up', () => {
    assert.deepEqual(decideOutcome(1, 500, DEFAULT), { status: 'PENDING', retryInSeconds: 60 });
    assert.deepEqual(decideOutcome(2, 500, DEFAULT), { status: 'PENDING', retryInSeconds: 300 });
    assert.deepEqual(decideOutcome(3, 503, DEFAULT), { status: 'PENDING', retryInSeconds: 1800 });
    assert.deepEqual(decideOutcome(4, 404, DEFAULT), { status: 'PENDING', retryInSeconds: 7200 });
    assert.deepEqual(decideOutcome(5, null, DEFAULT), { status: 'PENDING', retryInSeconds: 43200 });
    assert.deepEqual(decideOutcome(6, 500, DEFAULT), { status: 'FAILED', retryInSeconds: null });
  });

  it('treats redirects, client errors and no response as failures', () => {
    for (const code of [301, 302, 400, 401, 403, 404, 429, 500, null]) {
      assert.equal(decideOutcome(1, code, DEFAULT).status, 'PENDING', String(code));
    }
  });

  it('a final success after earlier failures still counts as delivered', () => {
    assert.equal(decideOutcome(4, 204, DEFAULT).status, 'DELIVERED');
  });

  it('honours a custom, shorter schedule', () => {
    assert.deepEqual(decideOutcome(1, 500, [1]), { status: 'PENDING', retryInSeconds: 1 });
    assert.deepEqual(decideOutcome(2, 500, [1]), { status: 'FAILED', retryInSeconds: null });
  });
});

describe('parseRetryDelays', () => {
  it('defaults to the documented schedule', () => {
    assert.deepEqual(parseRetryDelays(undefined), DEFAULT);
    assert.deepEqual(parseRetryDelays(''), DEFAULT);
  });

  it('parses a custom list and rejects bad input', () => {
    assert.deepEqual(parseRetryDelays('1, 2,3'), [1, 2, 3]);
    for (const bad of ['0', '-5', '1,,2', 'abc', '1.5', '10,x']) assert.throws(() => parseRetryDelays(bad), undefined, bad);
  });
});
