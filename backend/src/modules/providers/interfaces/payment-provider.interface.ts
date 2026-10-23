// FILE: modules/providers/interfaces/payment-provider.interface.ts
// PURPOSE: Gateway-neutral contract. Services depend on this, never on an SDK (coding-standards.md)
// DEPENDENCIES: none
// PHASE: 4 (testConnection), 5 (orders, verification, details, webhook helpers)
/** Decrypted config values keyed by payment_provider_fields.field_key. Never persisted or logged. */
export type ProviderConfig = Record<string, string>;

export interface ConnectionTestResult {
  success: boolean;
  /** Safe to show to the merchant. Must not contain credentials. */
  message: string;
}

/** Status vocabulary every provider maps into. CANCELLED is a Payment Hub decision, not a gateway one. */
export type NormalizedStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';

export interface CreateOrderInput {
  /** Minor units (paise). Conversion from major units happens in the service. */
  amountMinor: number;
  currency: string;
  /** Our payment reference. */
  receipt: string;
}

export interface CreateOrderResult {
  providerOrderId: string;
}

export interface VerifyPaymentInput {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
}

export interface GetPaymentInput {
  providerOrderId?: string | null;
  providerPaymentId?: string | null;
}

export interface PaymentDetails {
  providerPaymentId: string | null;
  providerOrderId: string | null;
  status: NormalizedStatus;
  amountMinor: number | null;
  currency: string | null;
}

/** Gateway webhook reduced to what Payment Hub needs. Raw payloads never leave the provider. */
export interface NormalizedWebhookEvent {
  /** Gateway event name, for logs only. */
  eventType: string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  /** null when the event does not change a payment's status (ignored). */
  status: NormalizedStatus | null;
  amountMinor: number | null;
  currency: string | null;
}

/** Thrown by providers for gateway failures. `message` is safe to show to API callers. */
export class ProviderCallError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
  }
}

export interface PaymentProvider {
  readonly code: string;
  testConnection(config: ProviderConfig): Promise<ConnectionTestResult>;
  createOrder(config: ProviderConfig, input: CreateOrderInput): Promise<CreateOrderResult>;
  /** Checks the signature the checkout widget returns. Pure computation, no network. */
  verifyPayment(config: ProviderConfig, input: VerifyPaymentInput): boolean;
  /** Fetches by payment id when known, otherwise looks up the order's payments. */
  getPaymentDetails(config: ProviderConfig, input: GetPaymentInput): Promise<PaymentDetails>;
  verifyWebhookSignature(rawBody: Buffer, signature: string, webhookSecret: string): boolean;
  /** Returns null when the body is not a recognizable gateway event. */
  normalizeWebhook(rawBody: Buffer): NormalizedWebhookEvent | null;
}
