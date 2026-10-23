// FILE: modules/webhook-delivery/webhook-signature.ts
// PURPOSE: Signing and headers for outgoing merchant webhooks (api-design.md): sha256= + HMAC-SHA256(secret, `${timestamp}.${rawBody}`)
// DEPENDENCIES: node:crypto
// PHASE: 8
import { createHmac, randomBytes } from 'node:crypto';

export const SIGNING_SECRET_PREFIX = 'whsec_';

export function generateSigningSecret(): string {
  return SIGNING_SECRET_PREFIX + randomBytes(32).toString('base64url');
}

export function signPayload(secret: string, timestampSeconds: number, rawBody: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(`${timestampSeconds}.${rawBody}`).digest('hex');
}

export interface WebhookHeaderInput {
  secret: string;
  eventType: string;
  deliveryId: string;
  timestampSeconds: number;
  rawBody: string;
}

export function buildWebhookHeaders(i: WebhookHeaderInput): Record<string, string> {
  return {
    'content-type': 'application/json',
    'user-agent': 'PaymentHub-Webhooks/1.0',
    'x-paymenthub-event': i.eventType,
    'x-paymenthub-timestamp': String(i.timestampSeconds),
    'x-paymenthub-signature': signPayload(i.secret, i.timestampSeconds, i.rawBody),
    'x-paymenthub-delivery-id': i.deliveryId,
  };
}
