// FILE: components/RedirectSettings.tsx
// PURPOSE: Edit the success / failure return URLs used by hosted checkout (GET/PUT /settings/redirects)
// DEPENDENCIES: api/endpoints, ui
// PHASE: 7
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { settingsApi } from '../api/endpoints';
import { Alert, buttonPrimary, buttonSecondary, Card, inputClass } from './ui';

export function RedirectSettings(): ReactNode {
  const [successUrl, setSuccessUrl] = useState('');
  const [failureUrl, setFailureUrl] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; lines: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    settingsApi
      .getRedirects()
      .then((r) => {
        setSuccessUrl(r.successUrl ?? '');
        setFailureUrl(r.failureUrl ?? '');
      })
      .catch((err: unknown) =>
        setNotice({ kind: 'error', lines: err instanceof ApiError ? [err.message] : ['Could not load redirect URLs'] }),
      );
  }, []);

  function useSandbox(): void {
    const url = `${window.location.origin}/sandbox`;
    setSuccessUrl(url);
    setFailureUrl(url);
    setNotice(null);
  }

  async function save(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const saved = await settingsApi.saveRedirects(successUrl.trim(), failureUrl.trim());
      setSuccessUrl(saved.successUrl ?? '');
      setFailureUrl(saved.failureUrl ?? '');
      setNotice({ kind: 'success', lines: ['Redirect URLs saved'] });
    } catch (err) {
      setNotice({ kind: 'error', lines: err instanceof ApiError ? [err.message, ...err.lines()] : ['Something went wrong'] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Checkout return URLs (optional)">
      <form onSubmit={(e) => void save(e)} className="space-y-4">
        <p className="text-sm text-slate-600">
          After a payment ends, the customer is sent back to these addresses with <code>?paymentId=...&amp;status=...</code> added. The
          status in the URL is informational: always confirm it with the payment status API.
        </p>
        <div>
          <label htmlFor="successUrl" className="mb-1 block text-sm font-medium">
            Success URL
          </label>
          <input id="successUrl" type="url" placeholder="https://yourshop.com/return" value={successUrl} onChange={(e) => setSuccessUrl(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="failureUrl" className="mb-1 block text-sm font-medium">
            Failure / cancel URL
          </label>
          <input id="failureUrl" type="url" placeholder="https://yourshop.com/return" value={failureUrl} onChange={(e) => setFailureUrl(e.target.value)} className={inputClass} />
        </div>
        <button type="button" className={buttonSecondary} onClick={useSandbox}>
          Use the Payment Sandbox page for both (testing)
        </button>
        {notice && (
          <Alert kind={notice.kind}>
            {notice.lines.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </Alert>
        )}
        <button type="submit" disabled={busy} className={buttonPrimary}>
          {busy ? 'Saving...' : 'Save return URLs'}
        </button>
      </form>
    </Card>
  );
}
