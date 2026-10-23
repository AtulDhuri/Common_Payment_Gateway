// FILE: pages/Gateway.tsx
// PURPOSE: Gateway Configuration: enter Razorpay credentials, Test Connection, Save. Fields come from /providers/:code/fields
// DEPENDENCIES: api/endpoints, DynamicForm, ui
// PHASE: 5 (payment sandbox)
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { gatewayApi, providersApi, type GatewayConfig, type ProviderField } from '../api/endpoints';
import { DynamicForm } from '../components/DynamicForm';
import { RedirectSettings } from '../components/RedirectSettings';
import { Alert, buttonPrimary, buttonSecondary, Card } from '../components/ui';

interface Notice {
  kind: 'success' | 'error' | 'info';
  lines: string[];
}

function errorLines(err: unknown): string[] {
  return err instanceof ApiError ? [err.message, ...err.lines()] : ['Something went wrong'];
}

export function Gateway(): ReactNode {
  const [providerCode, setProviderCode] = useState<string | null>(null);
  const [fields, setFields] = useState<ProviderField[]>([]);
  const [config, setConfig] = useState<GatewayConfig | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<'test' | 'save' | null>(null);
  const [loading, setLoading] = useState(true);

  const secretKeys = useMemo(() => new Set(fields.filter((f) => f.type === 'secret').map((f) => f.fieldKey)), [fields]);
  const configuredSecrets = useMemo(
    () => new Set(config ? Object.keys(config.fields).filter((k) => secretKeys.has(k)) : []),
    [config, secretKeys],
  );

  const load = useCallback(async (): Promise<void> => {
    try {
      const providers = await providersApi.list();
      const code = providers[0]?.code;
      if (!code) {
        setNotice({ kind: 'error', lines: ['No payment provider is available'] });
        return;
      }
      const [providerFields, existing] = await Promise.all([providersApi.fields(code), gatewayApi.get()]);
      setProviderCode(code);
      setFields(providerFields);
      setConfig(existing);
      // Text values come back in the clear and are safe to prefill. Secrets never are.
      if (existing) {
        const text: Record<string, string> = {};
        for (const f of providerFields) {
          const v = existing.fields[f.fieldKey];
          if (f.type === 'text' && v !== undefined) text[f.fieldKey] = v;
        }
        setValues(text);
      }
    } catch (err) {
      setNotice({ kind: 'error', lines: errorLines(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function change(key: string, value: string): void {
    setValues((v) => ({ ...v, [key]: value }));
    // Any edit invalidates a previous successful test: the server binds the token to the exact values.
    setVerificationToken(null);
    setNotice(null);
  }

  function filledConfig(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of fields) {
      const v = (values[f.fieldKey] ?? '').trim();
      if (v) out[f.fieldKey] = v;
    }
    return out;
  }

  function missingRequired(cfg: Record<string, string>): string[] {
    return fields.filter((f) => f.required && !cfg[f.fieldKey]).map((f) => f.label);
  }

  async function testConnection(): Promise<void> {
    if (!providerCode) return;
    const cfg = filledConfig();
    const missing = missingRequired(cfg);
    if (missing.length) {
      setNotice({ kind: 'error', lines: [`Required: ${missing.join(', ')}`] });
      return;
    }
    setBusy('test');
    setNotice(null);
    try {
      const result = await providersApi.testConnection(providerCode, cfg);
      if (result.success && result.verificationToken) {
        setVerificationToken(result.verificationToken);
        setNotice({ kind: 'success', lines: [result.message, 'You can now save the configuration.'] });
      } else {
        setVerificationToken(null);
        setNotice({ kind: 'error', lines: [result.message] });
      }
    } catch (err) {
      setNotice({ kind: 'error', lines: errorLines(err) });
    } finally {
      setBusy(null);
    }
  }

  async function save(): Promise<void> {
    if (!providerCode || !verificationToken) return;
    setBusy('save');
    setNotice(null);
    try {
      const saved = await gatewayApi.save(providerCode, filledConfig(), verificationToken);
      setConfig(saved);
      // Clear secrets from the form as soon as they are stored.
      setValues((v) => Object.fromEntries(Object.entries(v).filter(([k]) => !secretKeys.has(k))));
      setVerificationToken(null);
      setNotice({ kind: 'success', lines: ['Configuration saved. Secrets are stored encrypted and cannot be viewed again.'] });
    } catch (err) {
      setNotice({ kind: 'error', lines: errorLines(err) });
    } finally {
      setBusy(null);
    }
  }

  const keyId = config?.fields['key_id'] ?? values['key_id'] ?? '';
  const isLiveKey = keyId.startsWith('rzp_live_');
  const webhookPath = '/api/v1/webhooks/razorpay';

  if (loading) return <p className="text-slate-500">Loading...</p>;

  return (
    <>
      <h1 className="text-2xl font-semibold">Gateway Configuration</h1>

      {isLiveKey && (
        <Alert kind="warning">
          This is a <strong>live</strong> Razorpay key. Sandbox payments would be real charges. Use <code>rzp_test_</code> keys for testing.
        </Alert>
      )}

      <Card title="Current status">
        {config ? (
          <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
            <dt className="text-slate-500">Provider</dt>
            <dd>{config.provider}</dd>
            <dt className="text-slate-500">Verified</dt>
            <dd>{config.isVerified ? `Yes${config.verifiedAt ? ` (${new Date(config.verifiedAt).toLocaleString()})` : ''}` : 'No'}</dd>
            {Object.entries(config.fields).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-slate-500">{k}</dt>
                <dd className="font-mono">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-slate-600">Not configured yet.</p>
        )}
      </Card>

      <Card title={`${providerCode ?? 'Gateway'} credentials`}>
        <div className="space-y-4">
          <Alert kind="info">
            Secrets are encrypted before they are stored and are never shown again. To change anything, enter all required values again,
            then test and save.
          </Alert>
          <DynamicForm fields={fields} values={values} configuredSecrets={configuredSecrets} onChange={change} />
          {notice && (
            <Alert kind={notice.kind}>
              {notice.lines.map((l) => (
                <div key={l}>{l}</div>
              ))}
            </Alert>
          )}
          <div className="flex gap-3">
            <button className={buttonSecondary} onClick={() => void testConnection()} disabled={busy !== null}>
              {busy === 'test' ? 'Testing...' : 'Test Connection'}
            </button>
            <button className={buttonPrimary} onClick={() => void save()} disabled={busy !== null || !verificationToken}>
              {busy === 'save' ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
          {!verificationToken && <p className="text-xs text-slate-500">Save is enabled after a successful connection test.</p>}
        </div>
      </Card>

      <RedirectSettings />

      <Card title="Webhook setup (Razorpay Dashboard)">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>
            Expose this server publicly (for example <code>ngrok http 3000</code>). Razorpay cannot reach <code>localhost</code>.
          </li>
          <li>
            In Razorpay Dashboard (Test Mode) go to Settings, Webhooks, Add new webhook.
          </li>
          <li>
            URL: <code className="rounded bg-slate-100 px-1">https://&lt;your-public-host&gt;{webhookPath}</code>
          </li>
          <li>
            Secret: the same <strong>Webhook Secret</strong> you entered above.
          </li>
          <li>
            Events: <code>payment.captured</code>, <code>payment.failed</code>, <code>order.paid</code>, <code>refund.processed</code>.
          </li>
        </ol>
      </Card>
    </>
  );
}
