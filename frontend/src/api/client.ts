// FILE: api/client.ts
// PURPOSE: Single typed HTTP client. Unwraps the {success,data} envelope, throws ApiError, refreshes the access token once on 401
// DEPENDENCIES: auth/session
// PHASE: 5 (payment sandbox)
import { clearSession, getTokens, saveTokens, type Tokens } from '../auth/session';

const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errorCode: string,
    public readonly details: Record<string, unknown>,
  ) {
    super(message);
  }

  /** One line per validation problem, for display. Values are never included by the server. */
  lines(): string[] {
    const errors = this.details['errors'];
    if (Array.isArray(errors)) return errors.map(String);
    const fields = this.details['fields'];
    if (fields && typeof fields === 'object') {
      return Object.entries(fields as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v)}`);
    }
    return [];
  }
}

interface SuccessEnvelope<T> {
  success: true;
  message: string;
  data: T;
}
interface FailureEnvelope {
  success: false;
  message: string;
  errorCode: string;
  details?: Record<string, unknown>;
}

type Listener = () => void;
const expiredListeners = new Set<Listener>();
/** Called when the session can no longer be refreshed, so the UI can go to the login page. */
export function onSessionExpired(fn: Listener): () => void {
  expiredListeners.add(fn);
  return () => expiredListeners.delete(fn);
}

async function send(method: string, path: string, body: unknown, accessToken: string | null): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (accessToken) headers['authorization'] = `Bearer ${accessToken}`;
  return fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function refreshTokens(): Promise<string | null> {
  const tokens = getTokens();
  if (!tokens) return null;
  const res = await send('POST', '/auth/refresh', { refreshToken: tokens.refreshToken }, null);
  if (!res.ok) return null;
  const json = (await res.json()) as SuccessEnvelope<Tokens>;
  saveTokens(json.data);
  return json.data.accessToken;
}

export async function request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  let res = await send(method, path, body, auth ? (getTokens()?.accessToken ?? null) : null);

  if (res.status === 401 && auth) {
    const fresh = await refreshTokens();
    if (fresh) {
      res = await send(method, path, body, fresh);
    } else {
      clearSession();
      expiredListeners.forEach((fn) => fn());
    }
  }

  let json: SuccessEnvelope<T> | FailureEnvelope;
  try {
    json = (await res.json()) as SuccessEnvelope<T> | FailureEnvelope;
  } catch {
    throw new ApiError('Unexpected response from the server', res.status, 'INTERNAL_ERROR', {});
  }
  if (!json.success) throw new ApiError(json.message, res.status, json.errorCode, json.details ?? {});
  return json.data;
}
