// FILE: modules/payments/payments.test-utils.ts
// PURPOSE: In-memory fakes shared by the Phase 5 unit tests (not used at runtime)
// DEPENDENCIES: Payment entity, provider interface
// PHASE: 5
import { randomBytes } from 'node:crypto';
import { AppException } from '../../common/types/app.exception';
import { ErrorCode } from '../../common/types/error-codes';
import { AppConfig } from '../../config/configuration';
import { AuditEntry } from '../audit/audit.service';
import { CryptoService } from '../crypto/crypto.service';
import {
  CreateOrderInput,
  CreateOrderResult,
  PaymentDetails,
  PaymentProvider,
  ProviderConfig,
  VerifyPaymentInput,
} from '../providers/interfaces/payment-provider.interface';
import { RazorpayProvider } from '../providers/razorpay/razorpay.provider';
import { Payment } from './entities/payment.entity';
import { PaymentStatus } from './payment-status';
import { NewEvent } from './payments.repository';

export const TENANT = 'tenant-1';
export const PROVIDER_ID = 'prov-1';
export const KEY_SECRET = 'key-secret-123';
export const WEBHOOK_SECRET = 'whsec-456';

export const appConfig = {
  publicBaseUrl: 'https://hub.test',
  masterEncryptionKey: randomBytes(32),
} as AppConfig;
export const crypto = new CryptoService(appConfig);

export function makePayment(over: Partial<Payment> = {}): Payment {
  return {
    id: 'pid-1',
    tenantId: TENANT,
    providerId: PROVIDER_ID,
    paymentReference: 'pay_0123456789abcdef0123',
    providerOrderId: 'order_ABC',
    providerPaymentId: null,
    amount: 1,
    currency: 'INR',
    status: PaymentStatus.PENDING,
    customerName: 'John',
    customerEmail: 'john@example.com',
    customerPhone: null,
    metadata: { orderId: 'FOOD-1001' },
    checkoutToken: 'tok_abc',
    idempotencyKey: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  };
}

export class FakePaymentsRepo {
  payments = new Map<string, Payment>();
  events: { paymentId: string; eventType: string; payload: Record<string, unknown> }[] = [];
  private n = 0;

  add(p: Payment): Payment {
    this.payments.set(p.id, p);
    return p;
  }
  private copy(p: Payment | undefined): Payment | null {
    return p ? { ...p } : null;
  }
  async findByReference(tenantId: string, ref: string): Promise<Payment | null> {
    return this.copy([...this.payments.values()].find((p) => p.tenantId === tenantId && p.paymentReference === ref));
  }
  async findByIdempotencyKey(tenantId: string, key: string): Promise<Payment | null> {
    return this.copy([...this.payments.values()].find((p) => p.tenantId === tenantId && p.idempotencyKey === key));
  }
  async findByReferenceForCheckout(ref: string): Promise<Payment | null> {
    return this.copy([...this.payments.values()].find((p) => p.paymentReference === ref));
  }
  async findByProviderOrder(providerId: string, orderId: string): Promise<Payment | null> {
    return this.copy([...this.payments.values()].find((p) => p.providerId === providerId && p.providerOrderId === orderId));
  }
  async findById(tenantId: string, id: string): Promise<Payment | null> {
    const p = this.payments.get(id);
    return p && p.tenantId === tenantId ? { ...p } : null;
  }
  async createWithEvent(values: Partial<Payment>, buildEvent: (saved: Payment) => NewEvent): Promise<Payment> {
    this.n += 1;
    const saved = makePayment({ id: `pid-new-${this.n}`, ...values });
    this.payments.set(saved.id, saved);
    this.events.push({ paymentId: saved.id, ...buildEvent({ ...saved }) });
    return { ...saved };
  }
  async transition(
    tenantId: string,
    id: string,
    from: PaymentStatus,
    to: PaymentStatus,
    providerPaymentId: string | null,
    buildEvent: (current: Payment) => NewEvent,
  ): Promise<boolean> {
    const p = this.payments.get(id);
    if (!p || p.tenantId !== tenantId || p.status !== from) return false;
    p.status = to;
    if (providerPaymentId) p.providerPaymentId = providerPaymentId;
    this.events.push({ paymentId: id, ...buildEvent({ ...p }) });
    return true;
  }
}

/** Provider whose network calls are scripted. Webhook and signature logic is the real Razorpay code. */
export class ScriptedProvider extends RazorpayProvider implements PaymentProvider {
  orderCalls: CreateOrderInput[] = [];
  nextOrder: CreateOrderResult | Error = { providerOrderId: 'order_ABC' };
  nextDetails: PaymentDetails | Error = {
    providerPaymentId: null,
    providerOrderId: 'order_ABC',
    status: 'PENDING',
    amountMinor: null,
    currency: null,
  };

  async createOrder(_c: ProviderConfig, input: CreateOrderInput): Promise<CreateOrderResult> {
    this.orderCalls.push(input);
    if (this.nextOrder instanceof Error) throw this.nextOrder;
    return this.nextOrder;
  }
  async getPaymentDetails(): Promise<PaymentDetails> {
    if (this.nextDetails instanceof Error) throw this.nextDetails;
    return this.nextDetails;
  }
  verifyPayment(config: ProviderConfig, input: VerifyPaymentInput): boolean {
    return super.verifyPayment(config, input);
  }
}

export function fakeGateway(provider: ScriptedProvider, opts: { configured?: boolean } = {}): {
  withProviderConfig: <T>(
    tenantId: string,
    fn: (ctx: { providerId: string; providerCode: string; config: ProviderConfig }) => Promise<T>,
    providerId?: string,
  ) => Promise<T>;
  getPublicFields: (tenantId: string, providerId: string) => Promise<Record<string, string>>;
  getRedirects: (tenantId: string) => Promise<{ successUrl: string | null; failureUrl: string | null }>;
  redirects: { successUrl: string | null; failureUrl: string | null };
  provider: ScriptedProvider;
} {
  const configured = opts.configured ?? true;
  return {
    provider,
    redirects: { successUrl: null, failureUrl: null },
    withProviderConfig: async (_t, fn) => {
      if (!configured) throw new AppException(ErrorCode.CONFIG_NOT_VERIFIED, 'No verified gateway configuration found', 400);
      return fn({
        providerId: PROVIDER_ID,
        providerCode: 'RAZORPAY',
        config: { key_id: 'rzp_test_abc', key_secret: KEY_SECRET, webhook_secret: WEBHOOK_SECRET },
      });
    },
    getPublicFields: async () => ({ key_id: 'rzp_test_abc' }),
    getRedirects: async function () {
      return this.redirects;
    },
  };
}

export function fakeRegistry(provider: PaymentProvider): { get: (code: string) => PaymentProvider } {
  return { get: () => provider };
}

export const auditLog: AuditEntry[] = [];
export const fakeAudit = { record: async (e: AuditEntry): Promise<void> => void auditLog.push(e) };
