// FILE: api/endpoints.ts
// PURPOSE: Typed wrappers for every backend call the UI uses (no fetch in components)
// DEPENDENCIES: api/client
// PHASE: 5 (payment sandbox)
import type { Tokens } from '../auth/session';
import { ApiError, request } from './client';

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface ProviderSummary {
  code: string;
  name: string;
}

export interface ProviderField {
  fieldKey: string;
  label: string;
  type: 'text' | 'secret';
  required: boolean;
  order: number;
}

export interface GatewayConfig {
  provider: string;
  isVerified: boolean;
  verifiedAt: string | null;
  /** Text fields show their value. Secret fields are a fixed mask. */
  fields: Record<string, string>;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  verificationToken?: string;
}

export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'REFUNDED';

export interface PaymentItem {
  paymentId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  gateway: string;
  transactionId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  checkoutUrl: string | null;
}

export interface PaymentList {
  items: PaymentItem[];
  page: number;
  limit: number;
  total: number;
}

export interface CreatePaymentInput {
  amount: number;
  currency: string;
  customer: { name: string; email: string; phone?: string };
  metadata: Record<string, unknown>;
}

export const authApi = {
  register: (email: string, password: string): Promise<User> =>
    request<User>('POST', '/auth/register', { email, password }, false),
  login: (email: string, password: string): Promise<Tokens> =>
    request<Tokens>('POST', '/auth/login', { email, password }, false),
  me: (): Promise<User> => request<User>('GET', '/auth/me'),
};

export const providersApi = {
  list: (): Promise<ProviderSummary[]> => request<ProviderSummary[]>('GET', '/providers'),
  fields: (code: string): Promise<ProviderField[]> =>
    request<ProviderField[]>('GET', `/providers/${encodeURIComponent(code)}/fields`),
  testConnection: (provider: string, config: Record<string, string>): Promise<TestConnectionResult> =>
    request<TestConnectionResult>('POST', '/providers/test-connection', { provider, config }),
};

export const gatewayApi = {
  /** Resolves to null when nothing is configured yet. */
  get: async (): Promise<GatewayConfig | null> => {
    try {
      return await request<GatewayConfig>('GET', '/gateway-config');
    } catch (err) {
      if (err instanceof ApiError && err.errorCode === 'NOT_FOUND') return null;
      throw err;
    }
  },
  save: (provider: string, config: Record<string, string>, verificationToken: string): Promise<GatewayConfig> =>
    request<GatewayConfig>('PUT', '/gateway-config', { provider, config, verificationToken }),
};

export interface ApiCredential {
  id: string;
  name: string;
  publicKey: string;
  mode: 'live' | 'test';
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

/** Returned once, at creation. The secret cannot be retrieved afterwards. */
export interface CreatedApiCredential extends ApiCredential {
  secretKey: string;
}

// The sandbox uses dashboard (JWT) routes. External apps use /payments/* with API credentials.
export const paymentsApi = {
  create: (input: CreatePaymentInput): Promise<{ paymentId: string; status: PaymentStatus; checkoutUrl: string }> =>
    request<{ paymentId: string; status: PaymentStatus; checkoutUrl: string }>('POST', '/sandbox/payments', input),
  /** Refreshes a PENDING payment from the gateway on the server before answering. */
  status: (
    paymentId: string,
  ): Promise<{ paymentId: string; status: PaymentStatus; amount: number; currency: string; transactionId: string | null }> =>
    request('GET', `/sandbox/payments/${encodeURIComponent(paymentId)}`),
  list: (limit = 10): Promise<PaymentList> => request<PaymentList>('GET', `/payments?page=1&limit=${limit}`),
};

export const apiCredentialsApi = {
  list: (): Promise<ApiCredential[]> => request<ApiCredential[]>('GET', '/api-credentials'),
  create: (name: string): Promise<CreatedApiCredential> => request<CreatedApiCredential>('POST', '/api-credentials', { name }),
  deactivate: (id: string): Promise<ApiCredential> =>
    request<ApiCredential>('PATCH', `/api-credentials/${encodeURIComponent(id)}/deactivate`),
  remove: (id: string): Promise<{ deleted: boolean }> =>
    request<{ deleted: boolean }>('DELETE', `/api-credentials/${encodeURIComponent(id)}`),
};
export interface Redirects {
  successUrl: string | null;
  failureUrl: string | null;
}

export const settingsApi = {
  getRedirects: (): Promise<Redirects> => request<Redirects>('GET', '/settings/redirects'),
  /** Replaces both URLs. An empty string clears one. */
  saveRedirects: (successUrl: string, failureUrl: string): Promise<Redirects> =>
    request<Redirects>('PUT', '/settings/redirects', { successUrl, failureUrl }),
};
export interface WebhookConfigInfo {
  url: string;
  isActive: boolean;
  /** A fixed mask, except in the one response that creates or rotates the secret. */
  secret: string;
  secretShownOnce: boolean;
}

export type DeliveryStatus = 'PENDING' | 'DELIVERED' | 'FAILED';

export interface DeliveryItem {
  id: string;
  paymentId: string;
  eventType: string;
  status: DeliveryStatus;
  attemptCount: number;
  responseCode: number | null;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
}

export interface DeliveryList {
  items: DeliveryItem[];
  page: number;
  limit: number;
  total: number;
}

export const webhooksApi = {
  /** Resolves to null when no endpoint is configured yet. */
  get: async (): Promise<WebhookConfigInfo | null> => {
    try {
      return await request<WebhookConfigInfo>('GET', '/webhooks/config');
    } catch (err) {
      if (err instanceof ApiError && err.errorCode === 'NOT_FOUND') return null;
      throw err;
    }
  },
  save: (url: string, isActive: boolean): Promise<WebhookConfigInfo> =>
    request<WebhookConfigInfo>('PUT', '/webhooks/config', { url, isActive }),
  rotateSecret: (): Promise<WebhookConfigInfo> => request<WebhookConfigInfo>('POST', '/webhooks/config/rotate-secret'),
  deliveries: (limit = 20): Promise<DeliveryList> => request<DeliveryList>('GET', `/webhooks/deliveries?page=1&limit=${limit}`),
};