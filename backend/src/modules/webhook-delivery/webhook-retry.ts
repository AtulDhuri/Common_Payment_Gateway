// FILE: modules/webhook-delivery/webhook-retry.ts
// PURPOSE: Pure retry decision for one delivery attempt (docs/merchant-webhooks.md): 2xx = delivered, otherwise retry on the
// schedule until the attempts run out. No I/O, so it is easy to test
// DEPENDENCIES: none
// PHASE: 8
import { DeliveryStatus } from './entities/webhook-event.entity';

export interface AttemptOutcome {
  status: DeliveryStatus;
  /** Seconds until the next attempt when status is PENDING, else null. */
  retryInSeconds: number | null;
}

/** 2xx is the only success. 3xx (redirects), 4xx and 5xx all count as failures. */
export function isSuccess(statusCode: number | null): boolean {
  return statusCode !== null && statusCode >= 200 && statusCode < 300;
}

/** Total attempts allowed: the first one plus one per retry delay. */
export function maxAttempts(retryDelaysSeconds: number[]): number {
  return retryDelaysSeconds.length + 1;
}

/**
 * @param attemptNumber 1 for the first attempt, 2 for the first retry, and so on
 * @param statusCode HTTP status, or null when there was no response
 */
export function decideOutcome(attemptNumber: number, statusCode: number | null, retryDelaysSeconds: number[]): AttemptOutcome {
  if (isSuccess(statusCode)) return { status: 'DELIVERED', retryInSeconds: null };
  if (attemptNumber >= maxAttempts(retryDelaysSeconds)) return { status: 'FAILED', retryInSeconds: null };
  return { status: 'PENDING', retryInSeconds: retryDelaysSeconds[attemptNumber - 1] };
}
