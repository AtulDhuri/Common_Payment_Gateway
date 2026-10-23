// FILE: modules/providers/razorpay/razorpay.provider.ts
// PURPOSE: Razorpay implementation. The only file allowed to import the razorpay SDK
// DEPENDENCIES: razorpay, node:crypto, PaymentProvider interface
// PHASE: 4 (testConnection), 5 (createOrder, verifyPayment, getPaymentDetails, webhook helpers)
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import Razorpay from 'razorpay';
import {
  ConnectionTestResult,
  CreateOrderInput,
  CreateOrderResult,
  GetPaymentInput,
  NormalizedStatus,
  NormalizedWebhookEvent,
  PaymentDetails,
  PaymentProvider,
  ProviderCallError,
  ProviderConfig,
  VerifyPaymentInput,
} from '../interfaces/payment-provider.interface';

const TIMEOUT_MS = 10_000;

interface RazorpayErrorShape {
  statusCode?: number;
  error?: { description?: string };
}

/** Fields we read from Razorpay payment entities. Everything else is ignored. */
interface RzpPayment {
  id?: string;
  order_id?: string | null;
  status?: string;
  amount?: number;
  currency?: string;
  amount_refunded?: number;
}

interface RzpWebhookBody {
  event?: string;
  payload?: {
    payment?: { entity?: RzpPayment };
    order?: { entity?: { id?: string; amount?: number; currency?: string } };
    refund?: { entity?: { payment_id?: string } };
  };
}

const EVENT_STATUS: Record<string, NormalizedStatus> = {
  'payment.captured': 'SUCCESS',
  'order.paid': 'SUCCESS',
  'payment.failed': 'FAILED',
};

function hmacHex(secret: string, data: string | Buffer): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

function safeHexEqual(expectedHex: string, givenHex: string): boolean {
  const a = Buffer.from(expectedHex, 'utf8');
  const b = Buffer.from(givenHex, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Razorpay payment status -> Payment Hub vocabulary. created/authorized are still in progress. */
export function mapRazorpayStatus(status: string | undefined): NormalizedStatus {
  switch (status) {
    case 'captured':
      return 'SUCCESS';
    case 'failed':
      return 'FAILED';
    case 'refunded':
      return 'REFUNDED';
    default:
      return 'PENDING';
  }
}

@Injectable()
export class RazorpayProvider implements PaymentProvider {
  readonly code = 'RAZORPAY';
  private readonly logger = new Logger(RazorpayProvider.name);

  /** Makes one cheap authenticated read (list 1 order). A 2xx means the key pair is valid. */
  async testConnection(config: ProviderConfig): Promise<ConnectionTestResult> {
    const client = this.client(config);
    if (!client) return { success: false, message: 'Key ID and Key Secret are required' };

    try {
      await this.withTimeout(client.orders.all({ count: 1 }));
      return { success: true, message: 'Connection successful' };
    } catch (err) {
      const status = (err as RazorpayErrorShape).statusCode;
      if (status === 401) return { success: false, message: 'Razorpay rejected these credentials' };
      if (status === 429) return { success: false, message: 'Razorpay is rate limiting requests. Try again shortly' };
      // Log the status only. Error objects from the SDK can echo request details.
      this.logger.warn(`Razorpay connection test failed (status ${status ?? 'n/a'})`);
      return { success: false, message: 'Could not reach Razorpay. Try again' };
    }
  }

  async createOrder(config: ProviderConfig, input: CreateOrderInput): Promise<CreateOrderResult> {
    const client = this.requireClient(config);
    try {
      const order = await this.withTimeout(
        client.orders.create({
          amount: input.amountMinor,
          currency: input.currency,
          receipt: input.receipt,
          payment_capture: true,
        }),
      );
      return { providerOrderId: order.id };
    } catch (err) {
      throw this.toCallError('create order', err);
    }
  }

  /** Checkout signature = HMAC-SHA256("<order_id>|<payment_id>", key_secret). */
  verifyPayment(config: ProviderConfig, input: VerifyPaymentInput): boolean {
    const secret = config['key_secret'];
    if (!secret || !input.signature) return false;
    return safeHexEqual(hmacHex(secret, `${input.providerOrderId}|${input.providerPaymentId}`), input.signature);
  }

  async getPaymentDetails(config: ProviderConfig, input: GetPaymentInput): Promise<PaymentDetails> {
    const client = this.requireClient(config);
    try {
      if (input.providerPaymentId) {
        const p = (await this.withTimeout(client.payments.fetch(input.providerPaymentId))) as unknown as RzpPayment;
        return this.toDetails(p);
      }
      if (!input.providerOrderId) throw new ProviderCallError('An order or payment id is required');
      const res = (await this.withTimeout(client.orders.fetchPayments(input.providerOrderId))) as unknown as {
        items?: RzpPayment[];
      };
      return this.pickBest(res.items ?? [], input.providerOrderId);
    } catch (err) {
      if (err instanceof ProviderCallError) throw err;
      throw this.toCallError('fetch payment', err);
    }
  }

  /** Razorpay signs the raw webhook body: HMAC-SHA256(body, webhook_secret), hex. */
  verifyWebhookSignature(rawBody: Buffer, signature: string, webhookSecret: string): boolean {
    if (!signature || !webhookSecret) return false;
    return safeHexEqual(hmacHex(webhookSecret, rawBody), signature);
  }

  normalizeWebhook(rawBody: Buffer): NormalizedWebhookEvent | null {
    let body: RzpWebhookBody;
    try {
      body = JSON.parse(rawBody.toString('utf8')) as RzpWebhookBody;
    } catch {
      return null;
    }
    if (typeof body !== 'object' || body === null || typeof body.event !== 'string') return null;

    const payment = body.payload?.payment?.entity;
    const order = body.payload?.order?.entity;
    let status: NormalizedStatus | null = EVENT_STATUS[body.event] ?? null;

    if (body.event === 'refund.processed') {
      // Partial refunds leave the payment SUCCESS. Only a full refund changes status.
      const full =
        payment?.status === 'refunded' ||
        (typeof payment?.amount === 'number' && (payment.amount_refunded ?? 0) >= payment.amount);
      status = full ? 'REFUNDED' : null;
    }

    return {
      eventType: body.event,
      providerOrderId: payment?.order_id ?? order?.id ?? null,
      providerPaymentId: payment?.id ?? body.payload?.refund?.entity?.payment_id ?? null,
      status,
      amountMinor: typeof payment?.amount === 'number' ? payment.amount : (order?.amount ?? null),
      currency: payment?.currency ?? order?.currency ?? null,
    };
  }

  private toDetails(p: RzpPayment): PaymentDetails {
    return {
      providerPaymentId: p.id ?? null,
      providerOrderId: p.order_id ?? null,
      status: mapRazorpayStatus(p.status),
      amountMinor: typeof p.amount === 'number' ? p.amount : null,
      currency: p.currency ?? null,
    };
  }

  /** An order can have several attempts. Prefer money received, then in-progress, then failed. */
  private pickBest(items: RzpPayment[], orderId: string): PaymentDetails {
    const rank = (p: RzpPayment): number => {
      const s = mapRazorpayStatus(p.status);
      return s === 'SUCCESS' || s === 'REFUNDED' ? 3 : s === 'PENDING' ? 2 : 1;
    };
    const best = [...items].sort((a, b) => rank(b) - rank(a))[0];
    if (!best) {
      return { providerPaymentId: null, providerOrderId: orderId, status: 'PENDING', amountMinor: null, currency: null };
    }
    return { ...this.toDetails(best), providerOrderId: best.order_id ?? orderId };
  }

  private client(config: ProviderConfig): Razorpay | null {
    const keyId = config['key_id'];
    const keySecret = config['key_secret'];
    return keyId && keySecret ? new Razorpay({ key_id: keyId, key_secret: keySecret }) : null;
  }

  private requireClient(config: ProviderConfig): Razorpay {
    const client = this.client(config);
    if (!client) throw new ProviderCallError('Gateway credentials are incomplete');
    return client;
  }

  /** Converts an SDK failure to a safe message. Logs the HTTP status only, never the error object. */
  private toCallError(action: string, err: unknown): ProviderCallError {
    const e = err as RazorpayErrorShape;
    const status = e.statusCode;
    this.logger.warn(`Razorpay ${action} failed (status ${status ?? 'n/a'})`);
    if (status === 401) return new ProviderCallError('The gateway rejected the stored credentials', status);
    if (status === 429) return new ProviderCallError('The gateway is rate limiting requests. Try again shortly', status);
    if (status === 400) {
      const detail = e.error?.description?.slice(0, 200);
      return new ProviderCallError(detail ? `The gateway rejected the request: ${detail}` : 'The gateway rejected the request', status);
    }
    return new ProviderCallError('Could not reach the payment gateway', status);
  }

  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
      promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e: unknown) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }
}
