// FILE: pages/ApiCredentials.tsx
// PURPOSE: Generate, list, deactivate and delete API credentials. The secret is shown once and kept only in component state
// DEPENDENCIES: api/endpoints, ui
// PHASE: 6
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { apiCredentialsApi, type ApiCredential, type CreatedApiCredential } from '../api/endpoints';
import { CopyButton } from '../components/CopyButton';
import { Alert, buttonPrimary, buttonSecondary, Card, inputClass } from '../components/ui';

function errorLines(err: unknown): string[] {
  return err instanceof ApiError ? [err.message, ...err.lines()] : ['Something went wrong'];
}

const CURL_EXAMPLE = `curl -X POST https://<your-payment-hub-host>/api/v1/payments/create \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: <PUBLIC_KEY>" \\
  -H "x-api-secret: <SECRET_KEY>" \\
  -d '{"amount":1,"currency":"INR","customer":{"name":"John","email":"john@example.com"},"metadata":{"orderId":"ORDER-1001"}}'`;

export function ApiCredentials(): ReactNode {
  const [items, setItems] = useState<ApiCredential[]>([]);
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState<CreatedApiCredential | null>(null);
  const [error, setError] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async (): Promise<void> => {
    try {
      setItems(await apiCredentialsApi.list());
    } catch (err) {
      setError(errorLines(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // Leaving the page drops the secret from memory.
    return () => setFresh(null);
  }, [reload]);

  async function generate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError([]);
    try {
      const created = await apiCredentialsApi.create(name.trim());
      setFresh(created);
      setName('');
      await reload();
    } catch (err) {
      setError(errorLines(err));
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(c: ApiCredential): Promise<void> {
    if (!window.confirm(`Deactivate "${c.name}"? Apps using it will stop working immediately. This cannot be undone.`)) return;
    setError([]);
    try {
      await apiCredentialsApi.deactivate(c.id);
      await reload();
    } catch (err) {
      setError(errorLines(err));
    }
  }

  async function remove(c: ApiCredential): Promise<void> {
    if (!window.confirm(`Delete "${c.name}" permanently? Apps using it will stop working immediately.`)) return;
    setError([]);
    try {
      await apiCredentialsApi.remove(c.id);
      if (fresh?.id === c.id) setFresh(null);
      await reload();
    } catch (err) {
      setError(errorLines(err));
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">API Credentials</h1>
      <p className="text-sm text-slate-600">
        External applications use these keys to create payments and read their status, without ever touching Razorpay.
      </p>

      {error.length > 0 && (
        <Alert kind="error">
          {error.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </Alert>
      )}

      {fresh && (
        <section className="space-y-4 rounded-lg border-2 border-amber-400 bg-amber-50 p-6">
          <h2 className="text-lg font-semibold">New credentials: {fresh.name}</h2>
          <Alert kind="warning">
            <strong>This secret will only be shown once.</strong> Copy it now and store it safely. It cannot be retrieved later. If you lose it, generate a new key and delete this one.
          </Alert>
          <div>
            <label htmlFor="fresh-public" className="mb-1 block text-sm font-medium">
              Public Key
            </label>
            <div className="flex gap-2">
              <input id="fresh-public" readOnly value={fresh.publicKey} className={`${inputClass} font-mono`} />
              <CopyButton label="Copy Public Key" value={fresh.publicKey} />
            </div>
          </div>
          <div>
            <label htmlFor="fresh-secret" className="mb-1 block text-sm font-medium">
              Secret Key
            </label>
            <div className="flex gap-2">
              <input id="fresh-secret" readOnly value={fresh.secretKey} className={`${inputClass} font-mono`} />
              <CopyButton label="Copy Secret Key" value={fresh.secretKey} />
            </div>
          </div>
          <button className={buttonPrimary} onClick={() => setFresh(null)}>
            I have saved the secret
          </button>
        </section>
      )}

      <Card title="Generate key">
        <form onSubmit={(e) => void generate(e)} className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <label htmlFor="cred-name" className="mb-1 block text-sm font-medium">
              Name
            </label>
            <input
              id="cred-name"
              required
              maxLength={255}
              placeholder="e.g. Food app production"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>
          <button type="submit" disabled={busy || name.trim() === ''} className={buttonPrimary}>
            {busy ? 'Generating...' : 'Generate Key'}
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          Keys are labelled <code>live</code> when your saved Razorpay key is a live key, otherwise <code>test</code>.
        </p>
      </Card>

      <Card title="Your keys">
        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-600">No keys yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Public Key</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Last used</th>
                  <th className="py-2 pr-4 font-medium">Created</th>
                  <th className="py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-4">{c.name}</td>
                    <td className="py-2 pr-4">
                      <div className="break-all font-mono text-xs">{c.publicKey}</div>
                      <div className="mt-1">
                        <CopyButton label="Copy" value={c.publicKey} />
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-700'}`}
                      >
                        {c.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <span className="ml-2 text-xs text-slate-500">{c.mode}</span>
                    </td>
                    <td className="py-2 pr-4">{c.lastUsedAt ? new Date(c.lastUsedAt).toLocaleString() : 'Never'}</td>
                    <td className="py-2 pr-4">{new Date(c.createdAt).toLocaleString()}</td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        {c.isActive && (
                          <button className={buttonSecondary} onClick={() => void deactivate(c)}>
                            Deactivate
                          </button>
                        )}
                        <button className={buttonSecondary} onClick={() => void remove(c)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">Secrets are never shown here. Last used is updated at most once a minute.</p>
      </Card>

      <Card title="Use it from your app">
        <pre className="overflow-x-auto rounded-md bg-slate-900 p-4 text-xs text-slate-100">{CURL_EXAMPLE}</pre>
        <p className="mt-3 text-sm text-slate-600">
          The response contains <code>data.checkoutUrl</code>. Send your customer there. Check the result later with{' '}
          <code>GET /api/v1/payments/&lt;paymentId&gt;</code> using the same two headers. Full guide: <code>docs/external-api-guide.md</code>.
        </p>
      </Card>
    </>
  );
}
