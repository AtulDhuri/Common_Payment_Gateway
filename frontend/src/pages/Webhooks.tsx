// FILE: pages/Webhooks.tsx
// PURPOSE: Configure the merchant webhook endpoint, show the signing secret once, rotate it, and watch the delivery log
// DEPENDENCIES: api/endpoints, ui, CopyButton
// PHASE: 8
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { webhooksApi, type DeliveryItem, type DeliveryStatus, type WebhookConfigInfo } from '../api/endpoints';
import { CopyButton } from '../components/CopyButton';
import { Alert, buttonPrimary, buttonSecondary, Card, inputClass } from '../components/ui';

const REFRESH_MS = 4000;

function errorLines(err: unknown): string[] {
  return err instanceof ApiError ? [err.message, ...err.lines()] : ['Something went wrong'];
}

const BADGE: Record<DeliveryStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  DELIVERED: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
};

const VERIFY_EXAMPLE = `import { createHmac, timingSafeEqual } from 'node:crypto';

// rawBody: the request body exactly as received (a string/Buffer), BEFORE JSON.parse
function isGenuine(headers, rawBody, secret) {
  const ts = Number(headers['x-paymenthub-timestamp']);
  if (!Number.isInteger(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false; // too old: replay
  const expected = 'sha256=' + createHmac('sha256', secret).update(ts + '.' + rawBody).digest('hex');
  const given = String(headers['x-paymenthub-signature'] ?? '');
  return expected.length === given.length && timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}
// Then: ignore a repeated headers['x-paymenthub-delivery-id'], answer 2xx quickly,
// and confirm important changes with GET /payments/:id.`;

export function Webhooks(): ReactNode {
  const [config, setConfig] = useState<WebhookConfigInfo | null>(null);
  const [url, setUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [shownSecret, setShownSecret] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; lines: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadDeliveries = useCallback(async (): Promise<void> => {
    const list = await webhooksApi.deliveries(20);
    setDeliveries(list.items);
    setTotal(list.total);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const existing = await webhooksApi.get();
        setConfig(existing);
        if (existing) {
          setUrl(existing.url);
          setIsActive(existing.isActive);
        }
        await loadDeliveries();
      } catch (err) {
        setNotice({ kind: 'error', lines: errorLines(err) });
      } finally {
        setLoading(false);
      }
    })();
    // Leaving the page drops the one-time secret from memory.
    return () => setShownSecret(null);
  }, [loadDeliveries]);

  // Keep the log fresh while something is still being delivered or retried.
  const hasPending = deliveries.some((d) => d.status === 'PENDING');
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => void loadDeliveries().catch(() => undefined), REFRESH_MS);
    return () => clearInterval(timer);
  }, [hasPending, loadDeliveries]);

  async function save(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const saved = await webhooksApi.save(url.trim(), isActive);
      setConfig(saved);
      setUrl(saved.url);
      setIsActive(saved.isActive);
      if (saved.secretShownOnce) setShownSecret(saved.secret);
      setNotice({ kind: 'success', lines: ['Webhook endpoint saved'] });
    } catch (err) {
      setNotice({ kind: 'error', lines: errorLines(err) });
    } finally {
      setBusy(false);
    }
  }

  async function rotate(): Promise<void> {
    if (!window.confirm('Create a new signing secret? The current one stops working immediately, so update your server straight away.')) return;
    setBusy(true);
    setNotice(null);
    try {
      const rotated = await webhooksApi.rotateSecret();
      setConfig(rotated);
      setShownSecret(rotated.secret);
    } catch (err) {
      setNotice({ kind: 'error', lines: errorLines(err) });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-slate-500">Loading...</p>;

  return (
    <>
      <h1 className="text-2xl font-semibold">Webhooks</h1>
      <p className="text-sm text-slate-600">
        Payment Hub calls your server when a payment is created, succeeds, fails, is cancelled or is refunded, so you do not have to poll.
      </p>

      {shownSecret && (
        <section className="space-y-3 rounded-lg border-2 border-amber-400 bg-amber-50 p-6">
          <h2 className="text-lg font-semibold">Your signing secret</h2>
          <Alert kind="warning">
            <strong>This secret will only be shown once.</strong> Copy it now and store it on your server. Your server uses it to check that each
            request really came from Payment Hub.
          </Alert>
          <div className="flex gap-2">
            <input id="shown-secret" readOnly value={shownSecret} className={`${inputClass} font-mono`} aria-label="Signing secret" />
            <CopyButton label="Copy Secret" value={shownSecret} />
          </div>
          <button className={buttonPrimary} onClick={() => setShownSecret(null)}>
            I have saved the secret
          </button>
        </section>
      )}

      <Card title="Endpoint">
        <form onSubmit={(e) => void save(e)} className="space-y-4">
          <div>
            <label htmlFor="webhook-url" className="mb-1 block text-sm font-medium">
              Webhook URL
            </label>
            <input
              id="webhook-url"
              required
              type="url"
              placeholder="https://yourshop.com/payhub/webhook"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-slate-500">
              Production requires <code>https</code> and a public address. During development <code>http://localhost</code> is accepted.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input id="webhook-active" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Send webhooks to this URL
          </label>
          {config && (
            <p className="text-sm text-slate-600">
              Signing secret: <code>{config.secretShownOnce ? '(shown above)' : config.secret}</code>
            </p>
          )}
          {notice && (
            <Alert kind={notice.kind}>
              {notice.lines.map((l) => (
                <div key={l}>{l}</div>
              ))}
            </Alert>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy} className={buttonPrimary}>
              {busy ? 'Saving...' : config ? 'Save endpoint' : 'Create endpoint and signing secret'}
            </button>
            {config && (
              <button type="button" disabled={busy} className={buttonSecondary} onClick={() => void rotate()}>
                Rotate signing secret
              </button>
            )}
          </div>
        </form>
      </Card>

      <Card title="Delivery log">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-slate-600">
            {total} deliver{total === 1 ? 'y' : 'ies'}. A failed delivery is retried after 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours.
          </p>
          <button className={buttonSecondary} onClick={() => void loadDeliveries().catch((err: unknown) => setNotice({ kind: 'error', lines: errorLines(err) }))}>
            Reload
          </button>
        </div>
        {deliveries.length === 0 ? (
          <p className="text-sm text-slate-600">No deliveries yet. They appear here when a payment changes state after you save an endpoint.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Time</th>
                  <th className="py-2 pr-4 font-medium">Payment</th>
                  <th className="py-2 pr-4 font-medium">Event</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Attempts</th>
                  <th className="py-2 pr-4 font-medium">Response</th>
                  <th className="py-2 font-medium">Next attempt</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{new Date(d.createdAt).toLocaleString()}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{d.paymentId}</td>
                    <td className="py-2 pr-4">{d.eventType}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE[d.status]}`}>{d.status}</span>
                    </td>
                    <td className="py-2 pr-4">{d.attemptCount}</td>
                    <td className="py-2 pr-4">{d.responseCode ?? '-'}</td>
                    <td className="py-2">{d.status === 'PENDING' && d.nextAttemptAt ? new Date(d.nextAttemptAt).toLocaleTimeString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Check each request on your server">
        <p className="mb-3 text-sm text-slate-600">
          Every request carries <code>X-PaymentHub-Signature</code>, <code>X-PaymentHub-Timestamp</code>, <code>X-PaymentHub-Event</code> and{' '}
          <code>X-PaymentHub-Delivery-Id</code>. Anyone can call your URL, so verify the signature before trusting a request. A delivery can arrive
          more than once, so ignore a delivery id you have already handled.
        </p>
        <pre className="overflow-x-auto rounded-md bg-slate-900 p-4 text-xs text-slate-100">{VERIFY_EXAMPLE}</pre>
      </Card>
    </>
  );
}
