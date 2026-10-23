// FILE: modules/webhook-delivery/webhook-transport.spec.ts
// PURPOSE: Unit tests for the HTTP sender using real local servers: redirects not followed, timeouts, body discarded, production blocking
// DEPENDENCIES: node:test, node:http
// PHASE: 8
import assert from 'node:assert/strict';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { AppConfig } from '../../config/configuration';
import { WebhookTransport } from './webhook-transport';

interface Seen {
  path: string;
  method: string;
  headers: IncomingMessage['headers'];
  body: string;
}

describe('WebhookTransport (real local servers)', () => {
  let server: Server;
  let base: string;
  let seen: Seen[] = [];
  const handlers = new Map<string, (req: IncomingMessage, res: ServerResponse) => void>();

  before(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        seen.push({ path: req.url ?? '', method: req.method ?? '', headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
        const h = handlers.get((req.url ?? '').split('?')[0]);
        if (h) h(req, res);
        else {
          res.statusCode = 404;
          res.end('nope');
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    handlers.set('/ok', (_q, res) => { res.statusCode = 200; res.end('{"received":true}'); });
    handlers.set('/created', (_q, res) => { res.statusCode = 204; res.end(); });
    handlers.set('/boom', (_q, res) => { res.statusCode = 500; res.end('oops'); });
    handlers.set('/redirect', (_q, res) => { res.statusCode = 302; res.setHeader('location', `${base}/landed`); res.end(); });
    handlers.set('/landed', (_q, res) => { res.statusCode = 200; res.end(); });
    handlers.set('/slow', () => { /* never answers */ });
    handlers.set('/huge', (_q, res) => { res.statusCode = 200; res.end('x'.repeat(5_000_000)); });
  });
  after(() => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }));

  const dev = (): WebhookTransport => new WebhookTransport({ isProduction: false } as AppConfig);
  const prod = (): WebhookTransport => new WebhookTransport({ isProduction: true } as AppConfig);
  const headers = { 'content-type': 'application/json', 'x-paymenthub-event': 'PAYMENT_SUCCESS' };

  it('POSTs the exact body and headers, and reports the status', async () => {
    seen = [];
    const body = JSON.stringify({ event: 'PAYMENT_SUCCESS', n: 1 });
    const r = await dev().post(`${base}/ok?x=1`, body, headers);
    assert.deepEqual(r, { statusCode: 200, error: null });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].method, 'POST');
    assert.equal(seen[0].path, '/ok?x=1');
    assert.equal(seen[0].body, body);
    assert.equal(seen[0].headers['x-paymenthub-event'], 'PAYMENT_SUCCESS');
    assert.equal(seen[0].headers['content-length'], String(Buffer.byteLength(body)));
  });

  it('reports other statuses unchanged', async () => {
    assert.equal((await dev().post(`${base}/created`, '{}', headers)).statusCode, 204);
    assert.equal((await dev().post(`${base}/boom`, '{}', headers)).statusCode, 500);
    assert.equal((await dev().post(`${base}/missing`, '{}', headers)).statusCode, 404);
  });

  it('does NOT follow redirects: the 302 is the result and the target is never called', async () => {
    seen = [];
    const r = await dev().post(`${base}/redirect`, '{}', headers);
    assert.equal(r.statusCode, 302);
    assert.equal(seen.some((s) => s.path === '/landed'), false);
  });

  it('times out on a server that never answers', async () => {
    const t = dev();
    t.timeoutMs = 150;
    const started = Date.now();
    const r = await t.post(`${base}/slow`, '{}', headers);
    assert.deepEqual(r, { statusCode: null, error: 'TIMEOUT' });
    assert.ok(Date.now() - started < 2000);
  });

  it('reports a refused connection without throwing', async () => {
    const r = await dev().post('http://127.0.0.1:1/hook', '{}', headers);
    assert.equal(r.statusCode, null);
    assert.ok(r.error);
  });

  it('does not buffer a huge response body (status is enough)', async () => {
    const r = await dev().post(`${base}/huge`, '{}', headers);
    assert.equal(r.statusCode, 200);
  });

  it('does not send to a URL that fails the safety rules, and never opens a connection', async () => {
    seen = [];
    const r = await dev().post('ftp://127.0.0.1/hook', '{}', headers);
    assert.deepEqual(r, { statusCode: null, error: 'URL_NOT_ALLOWED' });
    assert.equal(seen.length, 0);
  });

  it('in production refuses http, localhost and private literals before connecting', async () => {
    seen = [];
    for (const u of [`${base}/ok`, 'https://127.0.0.1/ok', 'https://localhost/ok', 'https://10.1.2.3/ok', 'https://169.254.169.254/latest/meta-data/', 'https://[::1]/ok']) {
      assert.deepEqual(await prod().post(u, '{}', headers), { statusCode: null, error: 'URL_NOT_ALLOWED' }, u);
    }
    assert.equal(seen.length, 0);
  });
});
