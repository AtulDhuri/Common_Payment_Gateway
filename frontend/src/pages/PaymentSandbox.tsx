// FILE: pages/PaymentSandbox.tsx
// PURPOSE: Payment Testing page: create a test payment, open hosted checkout, watch the status, see recent payments
// DEPENDENCIES: api/endpoints, ui
// PHASE: 5 (payment sandbox)
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { gatewayApi, paymentsApi, type PaymentItem } from '../api/endpoints';
import { Alert, buttonPrimary, buttonSecondary, Card, inputClass, StatusBadge } from '../components/ui';

const POLL_MS = 3000;
const CURRENCY = 'INR';

function newOrderRef(): string {
  return `TEST-${Date.now()}`;
}

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount);
}

function orderRef(p: PaymentItem): string {
  const v = p.metadata['orderId'];
  return typeof v === 'string' ? v : '-';
}

function errorLines(err: unknown): string[] {
  return err instanceof ApiError ? [err.message, ...err.lines()] : ['Something went wrong'];
}

export function PaymentSandbox(): ReactNode {
  const [amount, setAmount] = useState('1');
  const [name, setName] = useState('Test Customer');
  const [email, setEmail] = useState('test@example.com');
  const [phone, setPhone] = useState('');
  const [orderReference, setOrderReference] = useState(newOrderRef);

  const [history, setHistory] = useState<PaymentItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [liveKey, setLiveKey] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const mounted = useRef(true);

  const selected = history.find((p) => p.paymentId === selectedId) ?? null;

  const reload = useCallback(async (): Promise<void> => {
    const list = await paymentsApi.list(10);
    if (mounted.current) setHistory(list.items);
  }, []);

  /** Asks the server to refresh from the gateway (it only does so while PENDING), then reloads the list. */
  const refreshStatus = useCallback(
    async (paymentId: string): Promise<void> => {
      try {
        await paymentsApi.status(paymentId);
        await reload();
        if (mounted.current) setLastChecked(new Date());
      } catch (err) {
        if (mounted.current) setError(errorLines(err));
      }
    },
    [reload],
  );

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const cfg = await gatewayApi.get();
        setConfigured(cfg?.isVerified === true);
        setLiveKey((cfg?.fields['key_id'] ?? '').startsWith('rzp_live_'));
        await reload();
        // Coming back from checkout: Payment Hub appends ?paymentId=... to our return URL.
        const returned = new URLSearchParams(window.location.search).get('paymentId');
        if (returned && /^pay_[a-f0-9]{20}$/.test(returned)) {
          window.history.replaceState(null, '', window.location.pathname);
          setSelectedId(returned);
          await refreshStatus(returned);
        }
      } catch (err) {
        setError(errorLines(err));
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, [reload, refreshStatus]);

  // Poll while the selected payment is PENDING so the UI shows the result of the webhook / checkout.
  const pendingId = selected?.status === 'PENDING' ? selected.paymentId : null;
  useEffect(() => {
    if (!pendingId) return;
    const timer = setInterval(() => void refreshStatus(pendingId), POLL_MS);
    return () => clearInterval(timer);
  }, [pendingId, refreshStatus]);

  async function create(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError([]);
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError(['Amount must be greater than 0']);
      return;
    }
    setCreating(true);
    try {
      const created = await paymentsApi.create({
        amount: value,
        currency: CURRENCY,
        customer: { name: name.trim(), email: email.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}) },
        metadata: { orderId: orderReference.trim() },
      });
      await reload();
      setSelectedId(created.paymentId);
      setOrderReference(newOrderRef());
    } catch (err) {
      setError(errorLines(err));
    } finally {
      setCreating(false);
    }
  }

  // Checkout opens in this tab. Payment Hub sends the customer back to the Success/Failure URL
  // (set it to this page with the button on the Gateway page), and we pick the payment up from ?paymentId=.
  function openCheckout(): void {
    if (selected?.checkoutUrl) window.location.assign(selected.checkoutUrl);
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Payment Sandbox</h1>

      {configured === false && (
        <Alert kind="warning">No verified gateway configuration yet. Set it up on the Gateway page first.</Alert>
      )}
      {liveKey && (
        <Alert kind="warning">
          A <strong>live</strong> Razorpay key is configured. Payments created here are real charges. Switch to <code>rzp_test_</code> keys.
        </Alert>
      )}
      {error.length > 0 && (
        <Alert kind="error">
          {error.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Create test payment">
          <form onSubmit={(e) => void create(e)} className="space-y-4">
            <div>
              <label htmlFor="amount" className="mb-1 block text-sm font-medium">
                Amount (INR)
              </label>
              <input id="amount" type="number" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="orderRef" className="mb-1 block text-sm font-medium">
                Order reference
              </label>
              <input id="orderRef" required maxLength={100} value={orderReference} onChange={(e) => setOrderReference(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium">
                Customer name
              </label>
              <input id="name" required maxLength={255} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="cemail" className="mb-1 block text-sm font-medium">
                Customer email
              </label>
              <input id="cemail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="phone" className="mb-1 block text-sm font-medium">
                Customer phone <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <input id="phone" type="tel" maxLength={50} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
            </div>
            <button type="submit" disabled={creating || configured === false} className={buttonPrimary}>
              {creating ? 'Creating...' : 'Create Test Payment'}
            </button>
          </form>
        </Card>

        <Card title="Payment details">
          {selected ? (
            <div className="space-y-4">
              <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
                <dt className="text-slate-500">Payment ID</dt>
                <dd className="break-all font-mono">{selected.paymentId}</dd>
                <dt className="text-slate-500">Status</dt>
                <dd>
                  <StatusBadge status={selected.status} />
                </dd>
                <dt className="text-slate-500">Gateway</dt>
                <dd>{selected.gateway}</dd>
                <dt className="text-slate-500">Transaction ID</dt>
                <dd className="break-all font-mono">{selected.transactionId ?? '-'}</dd>
                <dt className="text-slate-500">Created At</dt>
                <dd>{new Date(selected.createdAt).toLocaleString()}</dd>
                <dt className="text-slate-500">Amount</dt>
                <dd>{money(selected.amount, selected.currency)}</dd>
                <dt className="text-slate-500">Order reference</dt>
                <dd>{orderRef(selected)}</dd>
              </dl>
              <div className="flex flex-wrap gap-3">
                <button className={buttonPrimary} onClick={openCheckout} disabled={!selected.checkoutUrl}>
                  Open Checkout
                </button>
                <button className={buttonSecondary} onClick={() => void refreshStatus(selected.paymentId)}>
                  Refresh status
                </button>
              </div>
              {selected.status === 'PENDING' && (
                <p className="text-xs text-slate-500">
                  Waiting for payment. Checking every {POLL_MS / 1000}s{lastChecked ? ` (last check ${lastChecked.toLocaleTimeString()})` : ''}.
                </p>
              )}
              {!selected.checkoutUrl && selected.status !== 'PENDING' && (
                <p className="text-xs text-slate-500">Checkout is only available while a payment is PENDING.</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-600">Create a payment, or pick one from the history, to see its details here.</p>
          )}
        </Card>
      </div>

      <Card title="Payment history (latest 10)">
        <div className="mb-3 flex justify-end">
          <button className={buttonSecondary} onClick={() => void reload().catch((err: unknown) => setError(errorLines(err)))}>
            Reload
          </button>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-slate-600">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Payment ID</th>
                  <th className="py-2 pr-4 font-medium">Order</th>
                  <th className="py-2 pr-4 font-medium">Amount</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((p) => (
                  <tr
                    key={p.paymentId}
                    onClick={() => setSelectedId(p.paymentId)}
                    className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${p.paymentId === selectedId ? 'bg-indigo-50' : ''}`}
                  >
                    <td className="py-2 pr-4">{new Date(p.createdAt).toLocaleString()}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{p.paymentId}</td>
                    <td className="py-2 pr-4">{orderRef(p)}</td>
                    <td className="py-2 pr-4">{money(p.amount, p.currency)}</td>
                    <td className="py-2">
                      <StatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
