// FILE: modules/webhook-delivery/webhook-transport.ts
// PURPOSE: Sends one webhook POST. No redirects, hard timeout, response body discarded, SSRF-safe in production
// DEPENDENCIES: node:http, node:https, url-safety
// PHASE: 8
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config.module';
import { AppConfig } from '../../config/configuration';
import { checkWebhookUrl, isBlockedAddress, safeLookup } from './url-safety';

export interface TransportResult {
  /** HTTP status of the response, or null when there was none. */
  statusCode: number | null;
  /** Short machine-readable reason when statusCode is null (never contains the URL or body). */
  error: string | null;
}

export const DEFAULT_TIMEOUT_MS = 10_000;

@Injectable()
export class WebhookTransport {
  private readonly isProduction: boolean;
  /** Public so tests can shorten it. */
  timeoutMs = DEFAULT_TIMEOUT_MS;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.isProduction = config.isProduction;
  }

  post(rawUrl: string, body: string, headers: Record<string, string>): Promise<TransportResult> {
    const check = checkWebhookUrl(rawUrl, this.isProduction);
    if (!check.ok) return Promise.resolve({ statusCode: null, error: 'URL_NOT_ALLOWED' });
    const url = check.url;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    // IP literals skip DNS, so they are judged here.
    if (this.isProduction && isIP(host) && isBlockedAddress(host)) {
      return Promise.resolve({ statusCode: null, error: 'URL_NOT_ALLOWED' });
    }

    return new Promise<TransportResult>((resolve) => {
      let settled = false;
      const done = (r: TransportResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        resolve(r);
      };
      const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
      const req = send(
        {
          protocol: url.protocol,
          hostname: host,
          port: url.port || undefined,
          path: `${url.pathname}${url.search}`,
          method: 'POST',
          headers: { ...headers, 'content-length': String(Buffer.byteLength(body)) },
          agent: false, // one connection per delivery, nothing shared between merchants
          lookup: this.isProduction ? safeLookup : undefined,
        },
        (res) => {
          // 3xx is a failure and is not followed. Only the status matters; the body is thrown away.
          done({ statusCode: res.statusCode ?? null, error: res.statusCode ? null : 'NO_STATUS' });
          res.destroy();
          req.destroy();
        },
      );
      const deadline = setTimeout(() => {
        done({ statusCode: null, error: 'TIMEOUT' });
        req.destroy();
      }, this.timeoutMs);
      req.on('error', (err: NodeJS.ErrnoException) => done({ statusCode: null, error: err.code ?? 'REQUEST_FAILED' }));
      req.write(body);
      req.end();
    });
  }
}
