// FILE: modules/webhook-delivery/url-safety.ts
// PURPOSE: Outbound-request safety for merchant-supplied webhook URLs (SSRF protection). Pure functions, no network
// DEPENDENCIES: node:net, node:dns
// PHASE: 8
import { lookup as dnsLookup, LookupAddress, LookupAllOptions } from 'node:dns';
import { BlockList, isIP } from 'node:net';

const MAX_URL_LENGTH = 2048;

/** Addresses that are never a public internet host. */
const BLOCKED = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata endpoints
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, includes broadcast
] as const) {
  BLOCKED.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['64:ff9b::', 96], // NAT64 (can embed private IPv4)
  ['100::', 64], // discard
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  BLOCKED.addSubnet(net, prefix, 'ipv6');
}

/** True when `address` (an IP literal) is not safe to call from the server. Unparseable input counts as unsafe. */
export function isBlockedAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '');
  const family = isIP(ip);
  if (family === 4) return BLOCKED.check(ip, 'ipv4');
  if (family === 6) {
    // ::ffff:a.b.c.d (IPv4-mapped) is judged by the IPv4 address inside it.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapped) return BLOCKED.check(mapped[1], 'ipv4');
    const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      return BLOCKED.check(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`, 'ipv4');
    }
    return BLOCKED.check(ip, 'ipv6');
  }
  return true;
}

const LOCAL_NAME = /(^|\.)(localhost|local|internal|localdomain|lan|home|corp|intranet)$/i;

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/**
 * Rules for a merchant webhook URL.
 * Always: http(s) only, no embedded credentials, sane length.
 * In production: https only, and no localhost / internal names / private IP literals.
 * (DNS names are re-checked against the resolved address when connecting, see safeLookup.)
 */
export function checkWebhookUrl(raw: string, isProduction: boolean): UrlCheck {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH) {
    return { ok: false, reason: `URL must be 1-${MAX_URL_LENGTH} characters` };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'URL is not valid' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'URL must start with http:// or https://' };
  if (url.username || url.password) return { ok: false, reason: 'URL must not contain a username or password' };
  if (!url.hostname) return { ok: false, reason: 'URL has no host' };
  if (url.hash) return { ok: false, reason: 'URL must not contain a # fragment' };

  if (isProduction) {
    if (url.protocol !== 'https:') return { ok: false, reason: 'URL must use https in production' };
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host)) {
      if (isBlockedAddress(host)) return { ok: false, reason: 'URL points to a private or reserved address' };
    } else if (LOCAL_NAME.test(host) || !host.includes('.')) {
      return { ok: false, reason: 'URL must use a public host name' };
    }
  }
  return { ok: true, url };
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;
type LookupOptions = { all?: boolean; family?: number | string; hints?: number };

/**
 * DNS lookup for the HTTP client that refuses to connect to non-public addresses. Used in production so a public-looking
 * name that resolves to an internal address (or is rebound after validation) cannot reach the internal network.
 * The address that passes this check is the address that is connected to.
 */
export function safeLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  const lookupOptions: LookupAllOptions = { all: true, hints: options.hints };
  if (options.family === 4 || options.family === 6) lookupOptions.family = options.family;
  dnsLookup(hostname, lookupOptions, (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => {
    if (err) return callback(err, '', 0);
    if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
      const blocked: NodeJS.ErrnoException = new Error('Blocked: host resolves to a private or reserved address');
      blocked.code = 'EBLOCKEDADDRESS';
      return callback(blocked, '', 0);
    }
    if (options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}