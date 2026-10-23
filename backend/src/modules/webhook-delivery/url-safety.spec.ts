// FILE: modules/webhook-delivery/url-safety.spec.ts
// PURPOSE: Unit tests for webhook URL validation and the private-address block list
// DEPENDENCIES: node:test
// PHASE: 8
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkWebhookUrl, isBlockedAddress, safeLookup } from './url-safety';

describe('isBlockedAddress', () => {
  it('blocks private, loopback, link-local, metadata, CGNAT, multicast and reserved IPv4', () => {
    for (const ip of ['10.0.0.1', '10.255.255.255', '127.0.0.1', '127.1.2.3', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '240.0.0.1', '255.255.255.255', '198.18.0.1']) {
      assert.equal(isBlockedAddress(ip), true, ip);
    }
  });

  it('allows ordinary public IPv4', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1', '11.0.0.1', '100.63.255.255', '100.128.0.1']) {
      assert.equal(isBlockedAddress(ip), false, ip);
    }
  });

  it('blocks IPv6 loopback, unspecified, unique-local, link-local, multicast and NAT64', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '64:ff9b::7f00:1', '2001:db8::1']) {
      assert.equal(isBlockedAddress(ip), true, ip);
    }
  });

  it('judges IPv4-mapped IPv6 by the IPv4 address inside', () => {
    assert.equal(isBlockedAddress('::ffff:127.0.0.1'), true);
    assert.equal(isBlockedAddress('::ffff:10.0.0.5'), true);
    assert.equal(isBlockedAddress('::ffff:7f00:1'), true);
    assert.equal(isBlockedAddress('::ffff:a9fe:a9fe'), true); // 169.254.169.254
    assert.equal(isBlockedAddress('::ffff:8.8.8.8'), false);
  });

  it('allows public IPv6 and treats bracketed literals the same', () => {
    assert.equal(isBlockedAddress('2606:4700:4700::1111'), false);
    assert.equal(isBlockedAddress('[::1]'), true);
  });

  it('treats anything that is not an IP as blocked', () => {
    assert.equal(isBlockedAddress('example.com'), true);
    assert.equal(isBlockedAddress(''), true);
  });
});

describe('checkWebhookUrl', () => {
  const ok = (u: string, prod: boolean): boolean => checkWebhookUrl(u, prod).ok;

  it('accepts https public URLs in production', () => {
    assert.equal(ok('https://shop.example.com/payhub/webhook', true), true);
    assert.equal(ok('https://shop.example.com:8443/hook?x=1', true), true);
    assert.equal(ok('https://8.8.8.8/hook', true), true);
  });

  it('in production rejects http, localhost, internal names and private IP literals', () => {
    for (const u of ['http://shop.example.com/h', 'https://localhost/h', 'https://127.0.0.1/h', 'https://10.0.0.5/h', 'https://169.254.169.254/latest/meta-data', 'https://[::1]/h', 'https://[fd00::1]/h', 'https://intranet/h', 'https://db.internal/h', 'https://printer.local/h', 'https://[::ffff:127.0.0.1]/h']) {
      assert.equal(ok(u, true), false, u);
    }
  });

  it('outside production allows http and localhost for developer testing', () => {
    assert.equal(ok('http://localhost:4000/webhook', false), true);
    assert.equal(ok('http://127.0.0.1:4000/webhook', false), true);
  });

  it('always rejects non-http schemes, credentials in the URL, fragments and junk', () => {
    for (const prod of [true, false]) {
      for (const u of ['ftp://x.com/h', 'file:///etc/passwd', 'javascript:alert(1)', 'gopher://x.com', 'https://user:pass@x.example.com/h', 'https://x.example.com/h#frag', 'not a url', '', '//x.com/h']) {
        assert.equal(ok(u, prod), false, `${prod ? 'prod' : 'dev'}: ${u}`);
      }
    }
  });

  it('rejects very long URLs', () => {
    assert.equal(ok('https://x.example.com/' + 'a'.repeat(2100), true), false);
  });

  it('returns a reason a merchant can act on', () => {
    const r = checkWebhookUrl('http://shop.example.com/h', true);
    assert.ok(!r.ok && /https/.test(r.reason));
  });
});

describe('safeLookup', () => {
  it('refuses a host name that resolves to a loopback address', async () => {
    const code = await new Promise<string>((resolve) => {
      safeLookup('localhost', {}, (err) => resolve(err?.code ?? 'no error'));
    });
    assert.equal(code, 'EBLOCKEDADDRESS');
  });

  it('passes through a literal public address', async () => {
    const res = await new Promise<{ err: string; address: unknown }>((resolve) => {
      safeLookup('8.8.8.8', {}, (err, address) => resolve({ err: err?.code ?? '', address }));
    });
    assert.equal(res.err, '');
    assert.equal(res.address, '8.8.8.8');
  });
});
